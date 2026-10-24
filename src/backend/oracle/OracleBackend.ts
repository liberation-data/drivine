import { CascadeDepthCheck, GraphBackend, MatchingSearch, NearestSearch, Page } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { hasLabels, jsonKey, nodeDocument, OracleGraph, textOf } from '@/backend/oracle/OracleGraph';
import { CypherShorthand } from '@/backend/sql/CypherShorthand';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { beyondCount, keptTargets } from '@/backend/sql/SqlCascades';
import { CascadeBeyond } from '@/backend/CascadeTargets';
import { OracleQueryRenderer } from '@/backend/oracle/OracleQueryRenderer';
import { OracleSaveBuilder } from '@/backend/oracle/OracleSaveBuilder';
import { OracleWrites } from '@/backend/oracle/OracleWrites';
import { OracleSearch } from '@/backend/oracle/OracleSearch';
import { OracleGroups } from '@/backend/oracle/OracleGroups';
import { recordedAs } from '@/backend/oracle/OracleSchemaGrammar';
import { catalogProperties } from '@/backend/sql/SqlCatalog';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
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

/** The label of the node holding the store's identity: drivine4j's, so both read one identity. */
const STORE_LABEL = 'DrivineStore';

/** The label of the nodes recording what each schema owner applied: drivine4j's, so both read one marker. */
const SCHEMA_MARKER = '_DrivineSchema';

/** What a marker's inventory is kept behind, as drivine4j keeps it: Oracle has no empty string. */
const ITEMS_MARK = 'items:';

/** The moment, in milliseconds since the epoch, as the graph engines' timestamp() gives it. */
const NOW_MILLIS = "ROUND((CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE) - DATE '1970-01-01') * 86400000)";

/** The newest marker first, then the one made later, so the marker read, written and kept are one. */
const NEWEST_FIRST = (alias: string): string =>
    `JSON_VALUE(${alias}.props, '$.appliedAt' RETURNING NUMBER) DESC NULLS LAST, ${alias}.nid DESC`;

/** What a statement over a fragment calls its node's row. A raw `where` is SQL over it. */
export const ROW_ALIAS = 'n';

/**
 * Statements for Oracle, over the tables of an OracleGraph. A load returns the rows the graph engines do, `{props,
 * labels}` for a fragment, as JSON. A raw `where` is an SQL predicate over the node's row, `n` (its `labels`, `props`
 * and `stamp`), in which a property of the node may be written as Cypher writes it, `n.name` (see `written`).
 */
export class OracleBackend implements GraphBackend {
    constructor(readonly graph: OracleGraph = new OracleGraph()) {}

    loadAllFragments(model: FragmentModel, where?: string, page: Page = {}, tested: string[] = []): GraphStatement {
        return new GraphStatement(
            [`SELECT ${nodeDocument(ROW_ALIAS)} AS "result"`, this.from(model, where, tested), ...this.page(page)].join(
                '\n'
            )
        );
    }

    loadFragment(model: FragmentModel): GraphStatement {
        return this.loadAllFragments(model, this.idPredicate(model));
    }

    countFragments(model: FragmentModel, where?: string, tested: string[] = []): GraphStatement {
        return new GraphStatement([`SELECT COUNT(*) AS "count"`, this.from(model, where, tested)].join('\n'));
    }

    loadAllViews(
        model: GraphViewModel,
        where?: string,
        depth: Record<string, number> = {},
        page: Page = {},
        tested: string[] = []
    ): GraphStatement {
        const views = new OracleViews(this.graph, depth);
        return new GraphStatement(
            [
                `SELECT ${views.document(model, ROW_ALIAS)} AS "result"`,
                this.from(model.root, this.viewWhere(model, where, depth), tested),
                ...this.page(page)
            ].join('\n')
        );
    }

    loadView(model: GraphViewModel, depth: Record<string, number> = {}): GraphStatement {
        return this.loadAllViews(model, this.idPredicate(model.root), depth);
    }

    countViews(
        model: GraphViewModel,
        where?: string,
        depth: Record<string, number> = {},
        tested: string[] = []
    ): GraphStatement {
        return new GraphStatement(
            [`SELECT COUNT(*) AS "count"`, this.from(model.root, this.viewWhere(model, where, depth), tested)].join(
                '\n'
            )
        );
    }

    /**
     * Deletes the root with id `$id` that meets `where`, and for a cascade the nodes a load of the view reaches from it
     * through the relationships a save writes (see SqlViews.cascade): every one, or with `DELETE_ORPHAN` those not kept
     * (see keptTargets), which are read before anything is deleted. Returns how many roots were deleted: `{deleted}`.
     */
    delete(target: TargetModel, where?: string, cascade: CascadeType = CascadeType.NONE): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const filter = this.deletedWhere(target, where);
        if (cascade === CascadeType.NONE) {
            return this.deleting(root, filter);
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
                  `    cascade_kept (nid) AS (\n    ${keptTargets(this.graph, cascaded.followed, 'UNION ALL')}`,
                  `    ) CYCLE nid SET looped TO 'Y' DEFAULT 'N'`,
                  `    SELECT nid BULK COLLECT INTO v_targets FROM cascade_targets WHERE nid NOT IN (SELECT nid FROM cascade_kept);`
              ].join('\n')
            : `SELECT DISTINCT nid BULK COLLECT INTO v_targets FROM (${reached});`;
        return new GraphStatement(`DECLARE
    v_roots SYS.ODCINUMBERLIST;
    v_targets SYS.ODCINUMBERLIST := SYS.ODCINUMBERLIST();
    v_deleted NUMBER;
    c SYS_REFCURSOR;
BEGIN
    SELECT ${ROW_ALIAS}.nid BULK COLLECT INTO v_roots ${this.from(root, filter)};
    ${targets}
    DELETE FROM ${this.graph.nodes} WHERE nid IN (SELECT column_value FROM TABLE(v_roots));
    v_deleted := SQL%ROWCOUNT;
    DELETE FROM ${this.graph.nodes} x WHERE x.nid IN (SELECT column_value FROM TABLE(v_targets));
    OPEN c FOR SELECT v_deleted AS "deleted" FROM dual;
    DBMS_SQL.RETURN_RESULT(c);
END;`);
    }

    cascadeDepthChecks(target: TargetModel, where?: string): CascadeDepthCheck[] {
        if (target.kind !== 'GRAPH_VIEW') {
            return [];
        }
        const roots = `SELECT ${ROW_ALIAS}.nid ${this.from(target.model.root, this.deletedWhere(target, where))}`;
        const cascaded = new OracleViews(this.graph).cascade(target.model, 'n.nid IN (SELECT nid FROM cascade_roots)');
        return cascaded.beyond.map(({ view, field, maxDepth, nodes, within }: CascadeBeyond) => ({
            view,
            field,
            maxDepth,
            statement: new GraphStatement(beyondCount(roots, within, nodes))
        }));
    }

    deleteAll(target: TargetModel, where?: string, tested: string[] = []): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        return this.deleting(root, this.rootWhere(target, where), tested);
    }

    /** The table a search index was made over, recorded as drivine4j records it or as this library did before. */
    searchIndexTable(kind: 'VECTOR' | 'FULLTEXT', label: string, properties: string[]): GraphStatement {
        const [recorded, earlier] = recordedAs(kind);
        return new GraphStatement(
            `SELECT object_name AS "table" FROM ${this.graph.catalog} WHERE kind IN ($kind, $earlier) ` +
                `AND label = $label AND properties = $properties AND object_name IS NOT NULL`,
            { kind: recorded, earlier, label, properties: catalogProperties(properties) }
        );
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
        return new GraphStatement(
            [
                `SELECT JSON_TRANSFORM(${ROW_ALIAS}.props, KEEP '$') AS "props"`,
                this.from(model, this.idPredicate(model))
            ].join('\n')
        );
    }

    foundStamp(model: FragmentModel): GraphStatement {
        return new GraphStatement(
            [
                `SELECT NVL(${ROW_ALIAS}.stamp, '${Stamps.NEVER_STAMPED}') AS "found"`,
                this.from(model, this.idPredicate(model))
            ].join('\n')
        );
    }

    renderQuery<T>(fn: QueryFn<T>, target: TargetModel, indexed: SchemaItem[] = []): RenderedQuery {
        return OracleQueryRenderer.render(
            fn,
            target,
            (depth) => new OracleViews(this.graph, depth),
            ROW_ALIAS,
            indexed
        );
    }

    written(predicate: string): string {
        return new CypherShorthand(ROW_ALIAS, ROW_ALIAS, textOf).rewrite(predicate);
    }

    renderWhere<T>(fn: WhereFn<T>, target: TargetModel): { where: string; bindings: Record<string, any> } {
        return OracleQueryRenderer.renderWhere(fn, target, new OracleViews(this.graph), ROW_ALIAS);
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

    groups(model: FragmentModel, query: GroupQuery<any, any>, pathTargets: Map<string, FragmentModel>): GraphStatement {
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
        return new GraphStatement(
            `SELECT JSON_OBJECT('id' VALUE JSON_VALUE(n.props, '$.storeId'), 'assignedAt' VALUE JSON_VALUE(n.props, '$.assignedAt') ` +
                `RETURNING JSON) AS "stamp" FROM ${this.graph.nodes} n WHERE ${hasLabels('n', [STORE_LABEL])} ` +
                `ORDER BY JSON_VALUE(n.props, '$.assignedAt'), JSON_VALUE(n.props, '$.storeId')`
        );
    }

    /** Mints the stamp unless it is there; the uniqueness constraint on its key turns away a racing writer's. */
    assignStoreStamp(): GraphStatement {
        return new GraphStatement(
            `INSERT INTO ${this.graph.nodes} (labels, props) SELECT JSON('["${STORE_LABEL}"]'), ` +
                `JSON_OBJECT('key' VALUE $key, 'storeId' VALUE $storeId, 'assignedAt' VALUE $assignedAt, 'engine' VALUE $engine) ` +
                `FROM dual WHERE NOT EXISTS (SELECT 1 FROM ${this.graph.nodes} n WHERE ${hasLabels('n', [
                    STORE_LABEL
                ])} ` +
                `AND JSON_VALUE(n.props, '$.key') = $key)`
        );
    }

    /** An inventory is kept behind 'items:', so an empty one reads back empty, not absent (drivine4j's mark). */
    schemaMarker(property: 'version' | 'items'): GraphStatement {
        return new GraphStatement(
            `SELECT JSON_VALUE(n.props, '$.${property}' RETURNING CLOB) AS "value" ` +
                `FROM ${this.graph.nodes} n WHERE ${this.marker('n')} ORDER BY ${NEWEST_FIRST(
                    'n'
                )} FETCH FIRST 1 ROWS ONLY`
        );
    }

    /** The inventory behind its mark: stripped here, as SQL would make an empty one null. */
    markerItems(stored: string | null | undefined): string[] | undefined {
        if (stored == null || !stored.startsWith(ITEMS_MARK)) {
            return undefined;
        }
        const items = stored.slice(ITEMS_MARK.length);
        return items === '' ? [] : items.split('\n');
    }

    /**
     * The marker found by a query and matched by its id: matched by its scope, the MERGE would update the column it
     * matches on, which Oracle refuses (ORA-38104). Where a race left several, the newest is written.
     */
    recordSchemaMarker(): GraphStatement {
        return new GraphStatement(
            `MERGE INTO ${this.graph.nodes} n USING (SELECT (SELECT m.nid FROM ${
                this.graph.nodes
            } m WHERE ${this.marker('m')} ORDER BY ${NEWEST_FIRST(
                'm'
            )} FETCH FIRST 1 ROWS ONLY) AS nid FROM dual) found ON (n.nid = found.nid) ` +
                `WHEN MATCHED THEN UPDATE SET n.props = JSON_MERGEPATCH(n.props, JSON_OBJECT('version' VALUE $version, ` +
                `'items' VALUE '${ITEMS_MARK}' || $items, 'appliedAt' VALUE ${NOW_MILLIS})) ` +
                `WHEN NOT MATCHED THEN INSERT (labels, props) VALUES (JSON('["${SCHEMA_MARKER}"]'), JSON_OBJECT('scope' ` +
                `VALUE $scope, 'version' VALUE $version, 'items' VALUE '${ITEMS_MARK}' || $items, 'appliedAt' VALUE ` +
                `${NOW_MILLIS} ABSENT ON NULL))`
        );
    }

    pruneSchemaMarkers(): GraphStatement {
        return new GraphStatement(
            `DELETE FROM ${this.graph.nodes} WHERE nid IN (SELECT nid FROM (SELECT n.nid, ROW_NUMBER() OVER (ORDER BY ` +
                `${NEWEST_FIRST('n')}) AS position FROM ${this.graph.nodes} n WHERE ${this.marker(
                    'n'
                )}) WHERE position > 1)`
        );
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

    /** The markers of the owner bound as `$scope`. */
    private marker(alias: string): string {
        return `${hasLabels(alias, [SCHEMA_MARKER])} AND JSON_VALUE(${alias}.props, '$.scope') = $scope`;
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
     * The nodes of the fragment's labels that meet `where`, as the row `n`. A label `where` tests itself (`tested`) is
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

    /** Deletes the nodes `where` selects, with their relationships, and returns how many: `{deleted}`. */
    private deleting(model: FragmentModel, where?: string, tested: string[] = []): GraphStatement {
        return new GraphStatement(`DECLARE
    v_deleted NUMBER;
    c SYS_REFCURSOR;
BEGIN
    DELETE ${this.from(model, where, tested)};
    v_deleted := SQL%ROWCOUNT;
    OPEN c FOR SELECT v_deleted AS "deleted" FROM dual;
    DBMS_SQL.RETURN_RESULT(c);
END;`);
    }

    /** The node whose id is `$id`, compared as JSON compares, so a number is not taken for text. */
    private idPredicate(model: FragmentModel): string {
        if (!model.nodeIdProperty) {
            throw new DrivineError(`${model.type.name} has no @NodeId property, so it can't be found by id.`);
        }
        return `JSON_EXISTS(${ROW_ALIAS}.props, '$?(@${jsonKey(
            model.nodeIdProperty
        )} == $id__)' PASSING $id AS "id__")`;
    }

    private page(page: Page): string[] {
        return [
            ...(page.orderBy ? [`ORDER BY ${page.orderBy}`] : []),
            ...(page.skip !== undefined ? [`OFFSET ${page.skip} ROWS`] : []),
            ...(page.limit !== undefined ? [`FETCH NEXT ${page.limit} ROWS ONLY`] : [])
        ];
    }
}
