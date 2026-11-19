import { ModuleStore, StampAndMarker } from '@/backend/StoreStatements';
import {
    CascadeDepthCheck,
    FullTextIndexLookup,
    GraphBackend,
    MatchingSearch,
    NearestSearch,
    Page
} from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import {
    carriesLabels,
    hasLabels,
    nodeDocument,
    OracleGraph,
    textOf
} from '@/backend/oracle/OracleGraph';
import { called, hinted, noted } from '@/backend/oracle/OracleFragments';
import { DSL_ROW, FragmentQueryRenderer } from '@/backend/sql/FragmentQueryRenderer';
import { SqlFragments } from '@/cypher/SqlFragments';
import { hasId } from '@/backend/sql/NodeIds';
import { CypherShorthand } from '@/backend/sql/CypherShorthand';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { beyondCount, keptTargets } from '@/backend/sql/SqlCascades';
import { CascadeBeyond } from '@/backend/CascadeTargets';
import { OracleSaveBuilder } from '@/backend/oracle/OracleSaveBuilder';
import { OracleWrites } from '@/backend/oracle/OracleWrites';
import { OracleSearch } from '@/backend/oracle/OracleSearch';
import { OracleGroups } from '@/backend/oracle/OracleGroups';
import { recordedAs } from '@/backend/oracle/OracleSchemaGrammar';
import { catalogProperties } from '@/backend/sql/SqlCatalog';
import { fullTextIndexLookup } from '@/cypher/SharedCypherCompiler';
import { DrivineError } from '@/DrivineError';
import { FragmentModel, IdentifiedFragment } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { TargetModel } from '@/model/RelationshipModel';
import { CascadeType } from '@/manager/CascadeType';
import { SaveOptions } from '@/manager/SaveOptions';
import { SaveStatement } from '@/backend/SaveStatement';
import { ModelRegistry } from '@/model/ModelRegistry';
import { RenderedQuery } from '@/dsl/QueryRenderer';
import { QueryFn, WhereFn } from '@/dsl/Refs';
import { FragmentGroup } from '@/backend/FragmentBatchStatement';
import { GroupQuery } from '@/manager/Groups';
import { SchemaItem } from '@/schema/SchemaGrammar';
import { MatchedNode } from '@/backend/EdgeStatements';
import { Direction } from '@/annotation/Metadata';
import { RelateMode } from '@/manager/NodeRef';
import { Stamps } from '@/model/Stamps';
import { IdKeyedStatement } from '@/backend/oracle/IdKeyedStatement';

/** What a read of the query DSL calls its root's row (see DSL_ROW). A raw `where` is SQL over `n`, which `written` reads as it. */
export const ROW_ALIAS = DSL_ROW;

/** What the statements that read a node by its id alone call its row. */
const NODE_ROW = 'n';

/**
 * Statements for Oracle, over the tables of an OracleGraph. A load returns the rows the graph engines do, `{props,
 * labels}` for a fragment, as JSON. A raw `where` is an SQL predicate over the node's row, `n` (its `labels`, `props`
 * and `stamp`), in which a property of the node may be written as Cypher writes it, `n.name` (see `written`). A filter,
 * a seek and an order of the query DSL are the shared module's SQL (FragmentQueryRenderer), over the row `n_`; what its
 * fragments ask of the statement, its hints and the stored functions they call, travels with their text and is written
 * into each statement here (see OracleFragments).
 */
export class OracleBackend implements GraphBackend {
    /** The store's stamp and schema marker, the shared module's statements. */
    private readonly stampAndMarker = new StampAndMarker(
        'oracle',
        this.graph.name,
        (text, bindings) => new GraphStatement(text, bindings)
    );

    get moduleStore(): { store: ModuleStore; graph?: string } {
        return { store: 'oracle', graph: this.graph.name };
    }

    constructor(readonly graph: OracleGraph = new OracleGraph()) {}

    loadAllFragments(model: FragmentModel, where?: string, page: Page = {}, tested: string[] = []): GraphStatement {
        return this.statement(
            [`SELECT ${nodeDocument(ROW_ALIAS)} AS "result"`, this.from(model, where, tested), ...this.page(page)].join(
                '\n'
            )
        );
    }

    loadFragment(model: FragmentModel): GraphStatement {
        return IdKeyedStatement.of(
            this.statement(
                [`SELECT ${nodeDocument(ROW_ALIAS)} AS "result"`, this.foundById(model, this.idPredicate(model))].join(
                    '\n'
                )
            )
        );
    }

    countFragments(model: FragmentModel, where?: string, tested: string[] = []): GraphStatement {
        return this.statement([`SELECT COUNT(*) AS "count"`, this.from(model, where, tested)].join('\n'));
    }

    loadAllViews(
        model: GraphViewModel,
        where?: string,
        depth: Record<string, number> = {},
        page: Page = {},
        tested: string[] = []
    ): GraphStatement {
        const views = new OracleViews(this.graph, depth);
        return this.statement(
            [
                `SELECT ${views.document(model, ROW_ALIAS)} AS "result"`,
                this.from(model.root, this.viewWhere(model, where, depth), tested),
                ...this.page(page)
            ].join('\n'),
            views.fragments
        );
    }

    loadView(model: GraphViewModel, depth: Record<string, number> = {}): GraphStatement {
        const views = new OracleViews(this.graph, depth);
        return IdKeyedStatement.of(
            this.statement(
                [
                    `SELECT ${views.document(model, ROW_ALIAS)} AS "result"`,
                    this.foundById(model.root, this.viewWhere(model, this.idPredicate(model.root), depth))
                ].join('\n'),
                views.fragments
            )
        );
    }

    countViews(
        model: GraphViewModel,
        where?: string,
        depth: Record<string, number> = {},
        tested: string[] = []
    ): GraphStatement {
        return this.statement(
            [`SELECT COUNT(*) AS "count"`, this.from(model.root, this.viewWhere(model, where, depth), tested)].join(
                '\n'
            )
        );
    }

    /**
     * Deletes the root with id `$id` that meets `where`, and for a cascade the nodes a load of the view reaches from it
     * through the relationships a save writes (see SqlViews.cascade): every one, or with `DELETE_ORPHAN` those not kept
     * (see keptTargets), which are read before anything is deleted. Returns how many nodes were deleted, the roots and what
     * the cascade took (#562): `{deleted}`.
     */
    delete(target: TargetModel, where?: string, cascade: CascadeType = CascadeType.NONE): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const filter = this.deletedWhere(target, where);
        if (cascade === CascadeType.NONE) {
            return IdKeyedStatement.of(this.deleting(root, filter, [], true));
        }
        if (target.kind !== 'GRAPH_VIEW') {
            throw new DrivineError(`A cascade follows a view's relationships. ${root.type.name} is a @NodeFragment.`);
        }
        const cascaded = new OracleViews(this.graph).cascade(
            target.model,
            'n.nid IN (SELECT column_value FROM TABLE(v_roots))'
        );
        const reached = cascaded.reached.join('\n        UNION ALL ');
        const targets = !cascaded.reached.length
            ? 'NULL;'
            : cascade === CascadeType.DELETE_ORPHAN
            ? [
                  `WITH cascade_targets AS (SELECT DISTINCT t.nid FROM (${reached}) t ` +
                      `WHERE t.nid NOT IN (SELECT column_value FROM TABLE(v_roots))),`,
                  `    cascade_all AS (SELECT column_value AS nid FROM TABLE(v_roots) UNION SELECT nid FROM cascade_targets),`,
                  `    cascade_kept (nid) AS (\n    ${keptTargets(this.graph, cascaded.followed, 'UNION ALL', true)}`,
                  `    ) CYCLE nid SET looped TO 'Y' DEFAULT 'N'`,
                  `    SELECT nid BULK COLLECT INTO v_targets FROM cascade_targets WHERE nid NOT IN (SELECT nid FROM cascade_kept);`
              ].join('\n')
            : `SELECT DISTINCT nid BULK COLLECT INTO v_targets FROM (${reached});`;
        const roots = hinted(`SELECT ${ROW_ALIAS}.nid BULK COLLECT INTO v_roots ${this.foundById(root, filter)};`);
        return IdKeyedStatement.of(
            this.statement(`DECLARE
    v_roots SYS.ODCINUMBERLIST;
    v_targets SYS.ODCINUMBERLIST := SYS.ODCINUMBERLIST();
    v_deleted NUMBER;
    c SYS_REFCURSOR;
BEGIN
    ${roots}
    ${targets}
    DELETE FROM ${this.graph.nodes} WHERE nid IN (SELECT column_value FROM TABLE(v_roots));
    v_deleted := SQL%ROWCOUNT;
    DELETE FROM ${this.graph.nodes} x WHERE x.nid IN (SELECT column_value FROM TABLE(v_targets));
    v_deleted := v_deleted + SQL%ROWCOUNT;
    OPEN c FOR SELECT v_deleted AS "deleted" FROM dual;
    DBMS_SQL.RETURN_RESULT(c);
END;`)
        );
    }

    cascadeDepthChecks(target: TargetModel, where?: string): CascadeDepthCheck[] {
        if (target.kind !== 'GRAPH_VIEW') {
            return [];
        }
        const roots = hinted(
            `SELECT ${ROW_ALIAS}.nid ${this.foundById(target.model.root, this.deletedWhere(target, where))}`
        );
        const cascaded = new OracleViews(this.graph).cascade(target.model, 'n.nid IN (SELECT nid FROM cascade_roots)');
        return cascaded.beyond.map(({ view, field, maxDepth, nodes, within }: CascadeBeyond) => ({
            view,
            field,
            maxDepth,
            statement: IdKeyedStatement.of(this.statement(beyondCount(roots, within, nodes)))
        }));
    }

    deleteAll(target: TargetModel, where?: string, tested: string[] = []): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        return this.deleting(root, this.rootWhere(target, where), tested);
    }

    /**
     * The table a vector index was made over, recorded as drivine4j records it or as this library did before. Given
     * `dimensions`, only an index made for embeddings of that size: Oracle refuses to measure a vector against an index
     * of another size (ORA-51808), so a search by it measures every node instead.
     */
    vectorIndexTable(label: string, property: string, dimensions?: number): GraphStatement {
        const [recorded, earlier] = recordedAs('VECTOR');
        const sized = dimensions !== undefined;
        return new GraphStatement(
            `SELECT object_name AS "table" FROM ${this.graph.catalog} WHERE kind IN ($kind, $earlier) ` +
                `AND label = $label AND properties = $properties AND object_name IS NOT NULL` +
                (sized ? ` AND JSON_VALUE(details, '$.dimensions' RETURNING NUMBER) = $dimensions` : ''),
            {
                kind: recorded,
                earlier,
                label,
                properties: catalogProperties([property]),
                ...(sized ? { dimensions } : {})
            }
        );
    }

    /**
     * The table the Oracle Text index of the full-text index was made over, by the shared module's lookup of the catalog:
     * one row, or none when it was not made, and the search then scores by BM25 over every node of the label.
     */
    fullTextIndex(label: string, properties: string[]): FullTextIndexLookup {
        const lookup = fullTextIndexLookup('oracle', this.graph.name, label, properties)!;
        return {
            statement: new GraphStatement(lookup.statement, lookup.parameters),
            found: (rows) => (rows.length ? { oracleText: rows[0] } : {})
        };
    }

    nearest(target: TargetModel, search: NearestSearch): GraphStatement {
        return new OracleSearch(this.graph).nearest(target, search);
    }

    matching(target: TargetModel, search: MatchingSearch): GraphStatement {
        return new OracleSearch(this.graph).matching(target, search);
    }

    save(
        target: TargetModel,
        object: any,
        options?: SaveOptions<any>,
        createOnly?: boolean,
        registry?: ModelRegistry
    ): SaveStatement {
        return new OracleSaveBuilder(this.graph, registry).build(target, object, options, createOnly);
    }

    /**
     * Re-encoded with JSON_TRANSFORM: a document updated in place, as every save updates one, comes back as OSON version
     * 2, which the thin drivers can't read (oracle/node-oracledb#1796, oracle/python-oracledb#622).
     */
    heldProperties(model: FragmentModel): GraphStatement {
        return IdKeyedStatement.of(
            new GraphStatement(
                [
                    `SELECT JSON_TRANSFORM(${NODE_ROW}.props, KEEP '$') AS "props"`,
                    this.foundById(model, this.idPredicate(model, NODE_ROW), NODE_ROW)
                ].join('\n')
            )
        );
    }

    foundStamp(model: FragmentModel): GraphStatement {
        return IdKeyedStatement.of(
            new GraphStatement(
                [
                    `SELECT NVL(${NODE_ROW}.stamp, '${Stamps.NEVER_STAMPED}') AS "found"`,
                    this.foundById(model, this.idPredicate(model, NODE_ROW), NODE_ROW)
                ].join('\n')
            )
        );
    }

    /**
     * The query, as the shared module's fragments write it (FragmentQueryRenderer), what they ask of its statement noted
     * on its filter and its order (see OracleFragments). An equality of a property the first property of a range index or
     * a uniqueness constraint of one of the root's labels is (`indexed`) is read through the index's expression, as the
     * module writes it for the labels the root is given (drivine4j#65): a label the module says the filter then implies
     * (`impliedLabels`, drivine-cypher-spec#373) is not tested again by the statement (`labelsTested`, see `from`).
     */
    renderQuery<T>(fn: QueryFn<T>, target: TargetModel, indexed: SchemaItem[] = []): RenderedQuery {
        const fragments = new SqlFragments('oracle', {
            name: this.graph.name,
            indexedProperties: indexed.map((it) => [it.label, it.properties[0]] as const)
        });
        const query = FragmentQueryRenderer.render(fragments, fn, target, ROW_ALIAS);
        return {
            ...query,
            where: noted(query.where, fragments),
            orderBy: noted(query.orderBy, fragments)
        };
    }

    /** A raw `where`, over `n`, read over the row a read calls its root, `n_` (see CypherShorthand). */
    written(predicate: string, bindings: Record<string, any> = {}): string {
        return new CypherShorthand(NODE_ROW, ROW_ALIAS, textOf).rewrite(predicate, bindings);
    }

    /** The condition, as the shared module's fragments write it, what they ask of its statement noted on it. */
    renderWhere<T>(fn: WhereFn<T>, target: TargetModel): { where: string; bindings: Record<string, any> } {
        const fragments = new SqlFragments('oracle', { name: this.graph.name });
        const rendered = FragmentQueryRenderer.renderWhere(fragments, fn, target, ROW_ALIAS);
        return { where: noted(rendered.where, fragments)!, bindings: rendered.bindings };
    }

    patchOne(model: FragmentModel, where?: string): GraphStatement {
        return new OracleWrites(this.graph).patchOne(model, where);
    }

    patchMany(model: FragmentModel): GraphStatement {
        return new OracleWrites(this.graph).patchMany(model);
    }

    fragmentBatch(groups: FragmentGroup[], options: SaveOptions<any>): GraphStatement {
        return new OracleWrites(this.graph).fragmentBatch(groups, options);
    }

    groups(
        model: FragmentModel,
        query: GroupQuery<any, any>,
        pathTargets: Map<string, IdentifiedFragment>
    ): GraphStatement {
        return new OracleGroups(this.graph).build(model, query, pathTargets);
    }

    related(from: MatchedNode, type: string, direction: Direction, target: FragmentModel): GraphStatement {
        return new OracleWrites(this.graph).related(from, type, direction, target);
    }

    relate(
        from: MatchedNode,
        to: MatchedNode,
        type: string,
        properties: Record<string, any>,
        mode: RelateMode
    ): GraphStatement {
        return new OracleWrites(this.graph).relate(from, to, type, properties, mode);
    }

    unrelate(from: MatchedNode, to: MatchedNode, type: string): GraphStatement {
        return new OracleWrites(this.graph).unrelate(from, to, type);
    }

    unrelateAll(from: MatchedNode, type: string, direction: Direction): GraphStatement {
        return new OracleWrites(this.graph).unrelateAll(from, type, direction);
    }

    storeStamps(): GraphStatement {
        return this.stampAndMarker.storeStamps();
    }

    assignStoreStamp(storeId: string, assignedAt: string, engine: string): GraphStatement {
        return this.stampAndMarker.assignStoreStamp(storeId, assignedAt, engine);
    }

    schemaMarker(property: 'version' | 'items'): GraphStatement {
        return this.stampAndMarker.schemaMarker(property);
    }

    schemaScopes(): GraphStatement {
        return this.stampAndMarker.schemaScopes()!;
    }

    markerItems(stored: string | null | undefined): string[] | undefined {
        return this.stampAndMarker.markerItems(stored);
    }

    recordSchemaMarker(scope: string, version: string | null, items: string): GraphStatement {
        return this.stampAndMarker.recordSchemaMarker(scope, version, items);
    }

    pruneSchemaMarkers(): GraphStatement {
        return this.stampAndMarker.pruneSchemaMarkers();
    }

    /** ORA-00060 (deadlock) and ORA-08177 (serialization) are another writer's doing: running again may succeed. */
    contended(failure: unknown): boolean {
        let cause: any = failure;
        for (let depth = 0; cause && depth < 10; depth++) {
            if (/ORA-(00060|08177)\b/.test(String(cause.message ?? ''))) {
                return true;
            }
            cause = cause.rootCause ?? cause.cause;
        }
        return false;
    }

    /** What the root a delete by `$id` takes meets: the id, `where`, and for a view the view's requirements. */
    private deletedWhere(target: TargetModel, where?: string): string | undefined {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const id = this.idPredicate(root);
        return this.rootWhere(target, where ? `${id} AND (${where})` : id);
    }

    /** A predicate over the root's row and, for a view, the view's requirements. */
    private rootWhere(target: TargetModel, where?: string): string | undefined {
        return target.kind === 'GRAPH_VIEW' ? this.viewWhere(target.model, where) : where;
    }

    private viewWhere(model: GraphViewModel, where?: string, depth: Record<string, number> = {}): string | undefined {
        const parts = [
            ...(where ? [`(${where})`] : []),
            ...new OracleViews(this.graph, depth).requirements(model, ROW_ALIAS)
        ];
        return parts.length ? parts.join(' AND ') : undefined;
    }

    /**
     * The nodes of the fragment's labels that meet `where`, as the row `n_`. A label `where` tests itself (`tested`) is
     * not tested again. Beside one, the others are tested in a form no index serves: Oracle takes a label's test for a
     * lookup of one row, and would read that label's nodes in place of the index `where` is read through.
     */
    private from(model: FragmentModel, where?: string, tested: string[] = []): string {
        const untested = model.labels.filter((it) => !tested.includes(it));
        const labels = !tested.length
            ? [hasLabels(ROW_ALIAS, untested)]
            : untested.length
            ? [`CASE WHEN ${hasLabels(ROW_ALIAS, untested)} THEN 1 END = 1`]
            : [];
        const tests = [...labels, ...(where ? [`(${where})`] : [])];
        return `FROM ${this.graph.nodes} ${ROW_ALIAS}\nWHERE ${tests.join(' AND ')}`;
    }

    /**
     * Deletes the nodes `where` selects, with their relationships, and returns how many: `{deleted}`. `byId` says `where`
     * finds the node by its id (see foundById).
     */
    private deleting(
        model: FragmentModel,
        where?: string,
        tested: string[] = [],
        byId: boolean = false
    ): GraphStatement {
        const deleted = hinted(`DELETE ${byId ? this.foundById(model, where) : this.from(model, where, tested)}`);
        return this.statement(`DECLARE
    v_deleted NUMBER;
    c SYS_REFCURSOR;
BEGIN
    ${deleted};
    v_deleted := SQL%ROWCOUNT;
    OPEN c FOR SELECT v_deleted AS "deleted" FROM dual;
    DBMS_SQL.RETURN_RESULT(c);
END;`);
    }

    /**
     * The node of the fragment's labels found by its id in `where` (see idPredicate), as the row `row` (`n_` unless given): each label told by
     * the labels' text ({@link carriesLabels}), so Oracle reads the index over the id for the one node, and not every node
     * of the first label, as drivine4j's `OracleSelect.hasId` narrows it.
     */
    private foundById(model: FragmentModel, where?: string, row: string = ROW_ALIAS): string {
        const tests = [carriesLabels(row, model.labels), ...(where ? [`(${where})`] : [])];
        return `FROM ${this.graph.nodes} ${row}\nWHERE ${tests.join(' AND ')}`;
    }

    /**
     * The statement `text`, with the hints the fragments in it ask for written after its first `SELECT` or `DELETE`, and
     * the stored functions they call said (see OracleFragments). A block hints each of its statements itself first.
     * `fragments`, a view's (see SqlViews), are written into it beside those noted in it: their hints, their calls, and
     * what they bind, bound.
     */
    private statement(text: string, fragments?: SqlFragments): GraphStatement {
        const made = called(hinted(text, fragments?.hints), this.graph.name, fragments);
        return new GraphStatement(made.text, fragments?.parameters ?? {}, made.calls);
    }

    /**
     * The node whose id is `$id`, compared as the shared module writes the comparison: the property's class and key with
     * the id's, which the index over the property of every node is made over and answers (see NodeIds). The id is bound
     * as the JSON text Oracle's layout holds it as, read `EXTENDED`, as a save finds the node (see IdKeyedStatement); the
     * comparison reads it more than once, so it is bound by name.
     */
    private idPredicate(model: FragmentModel, row: string = ROW_ALIAS): string {
        if (!model.nodeIdProperty) {
            throw new DrivineError(`${model.type.name} has no @NodeId property, so it can't be found by id.`);
        }
        return hasId('oracle', row, model.nodeIdProperty, 'JSON($id EXTENDED)');
    }

    private page(page: Page): string[] {
        return [
            ...(page.orderBy ? [`ORDER BY ${page.orderBy}`] : []),
            ...(page.skip !== undefined ? [`OFFSET ${page.skip} ROWS`] : []),
            ...(page.limit !== undefined ? [`FETCH NEXT ${page.limit} ROWS ONLY`] : [])
        ];
    }
}

