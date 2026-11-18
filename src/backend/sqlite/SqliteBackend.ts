import { ModuleStore, StampAndMarker } from '@/backend/StoreStatements';
import { Direction } from '@/annotation/Metadata';
import { MatchedNode } from '@/backend/EdgeStatements';
import { FragmentGroup } from '@/backend/FragmentBatchStatement';
import { CascadeDepthCheck, GraphBackend, MatchingSearch, NearestSearch, Page } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { PostgresSaveBuilder } from '@/backend/postgres/PostgresSaveBuilder';
import { PostgresStatement } from '@/backend/postgres/PostgresStatement';
import { PostgresWrites } from '@/backend/postgres/PostgresWrites';
import { SaveStatement } from '@/backend/SaveStatement';
import { CascadeBeyond } from '@/backend/CascadeTargets';
import { beyondCount, keptTargets } from '@/backend/sql/SqlCascades';
import { CypherShorthand } from '@/backend/sql/CypherShorthand';
import { sqlText } from '@/backend/sql/SqlGraph';
import { hasId } from '@/backend/sql/NodeIds';
import { writeLayout } from '@/cypher/ValueLayout';
import { SqliteGroups } from '@/backend/sqlite/SqliteGroups';
import { hasLabels, JSON_ROWS, nodeDocument, SqliteGraph, textOf } from '@/backend/sqlite/SqliteGraph';
import { DSL_ROW, FragmentQueryRenderer } from '@/backend/sql/FragmentQueryRenderer';
import { SqlFragments } from '@/cypher/SqlFragments';
import { SqliteSearch } from '@/backend/sqlite/SqliteSearch';
import { SqliteViews } from '@/backend/sqlite/SqliteViews';
import { sqliteContended } from '@/connection/sqlite/SqliteDriver';
import { DrivineError } from '@/DrivineError';
import { RenderedQuery } from '@/dsl/QueryRenderer';
import { QueryFn, WhereFn } from '@/dsl/Refs';
import { CascadeType } from '@/manager/CascadeType';
import { GroupQuery } from '@/manager/Groups';
import { RelateMode } from '@/manager/NodeRef';
import { SaveOptions } from '@/manager/SaveOptions';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { ModelRegistry } from '@/model/ModelRegistry';
import { TargetModel } from '@/model/RelationshipModel';
import { Stamps } from '@/model/Stamps';

/** What a read of the query DSL calls its root's row (see DSL_ROW). A raw `where` is SQL over `n`, which `written` reads as it. */
export const ROW_ALIAS = DSL_ROW;

/** What the statements that read a node by its id alone call its row. */
const NODE_ROW = 'n';

/**
 * Statements for SQLite, over the tables of a SqliteGraph: drivine4j's store, so a file written from the JVM, from
 * Node and from Python is one. A load returns the rows the graph engines do, `{props, labels}` for a fragment, as JSON
 * text the connection reads (see JSON_ROWS). A raw `where` is an SQL predicate over the node's row, `n` (its `labels`,
 * `props` and `stamp`), in which a property of the node may be written as Cypher writes it, `n.name` (see `written`).
 * A filter, a seek and an order of the query DSL are the shared module's SQL (FragmentQueryRenderer), over the row
 * `n_`.
 *
 * A save, a patch and a relationship are the plan Postgres's write function carries out, carried out by `drivine_write`,
 * a function each connection registers (see SqlitePlanWriter). A delete that counts selects what it deletes and hands
 * it to `drivine_delete`: SQLite has no delete a query reads.
 *
 * The store is made on the connection provider's first connection, and by the object manager before its first
 * statement, for a backend of another graph than the provider's: see `ensuring`.
 */
export class SqliteBackend implements GraphBackend {
    /** The store's stamp and schema marker, the shared module's statements. */
    private readonly stampAndMarker = new StampAndMarker(
        'sqlite',
        this.graph.name,
        (text, bindings) => new PostgresStatement(text, bindings)
    );

    get moduleStore(): { store: ModuleStore; graph?: string } {
        return { store: 'sqlite', graph: this.graph.name };
    }

    constructor(readonly graph: SqliteGraph = new SqliteGraph()) {}

    get ensuring(): string {
        return this.graph.ensuring;
    }

    loadAllFragments(model: FragmentModel, where?: string, page: Page = {}): GraphStatement {
        return json(
            [`SELECT ${nodeDocument(ROW_ALIAS)} AS "result"`, this.from(model, where), ...this.page(page)].join('\n')
        );
    }

    loadFragment(model: FragmentModel): GraphStatement {
        return this.byId(this.loadAllFragments(model, this.idPredicate(model)));
    }

    countFragments(model: FragmentModel, where?: string): GraphStatement {
        return new PostgresStatement([`SELECT COUNT(*) AS "count"`, this.from(model, where)].join('\n'));
    }

    loadAllViews(
        model: GraphViewModel,
        where?: string,
        depth: Record<string, number> = {},
        page: Page = {}
    ): GraphStatement {
        const views = new SqliteViews(this.graph, depth);
        return json(
            [
                `SELECT ${views.document(model, ROW_ALIAS)} AS "result"`,
                this.from(model.root, this.viewWhere(model, where, depth)),
                ...this.page(page)
            ].join('\n')
        );
    }

    loadView(model: GraphViewModel, depth: Record<string, number> = {}): GraphStatement {
        return this.byId(this.loadAllViews(model, this.idPredicate(model.root), depth));
    }

    countViews(model: GraphViewModel, where?: string, depth: Record<string, number> = {}): GraphStatement {
        return new PostgresStatement(
            [`SELECT COUNT(*) AS "count"`, this.from(model.root, this.viewWhere(model, where, depth))].join('\n')
        );
    }

    /**
     * Deletes the root with id `$id` that meets `where`, and for a cascade the nodes a load of the view reaches from it
     * through the relationships a save writes (see SqlViews.cascade): every one, or with `DELETE_ORPHAN` those not kept
     * (see keptTargets). Every node is selected before any is deleted, so what is kept is read first, and handed to
     * `drivine_delete`. Returns how many nodes were deleted, the roots and what the cascade took (#562): `{deleted}`.
     */
    delete(target: TargetModel, where?: string, cascade: CascadeType = CascadeType.NONE): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const filter = this.deletedWhere(target, where);
        if (cascade === CascadeType.NONE) {
            return this.byId(this.deleting(root, filter));
        }
        if (target.kind !== 'GRAPH_VIEW') {
            throw new DrivineError(`A cascade follows a view's relationships. ${root.type.name} is a @NodeFragment.`);
        }
        const cascaded = new SqliteViews(this.graph).cascade(target.model, 'n.nid IN (SELECT nid FROM cascade_roots)');
        const orphans = cascade === CascadeType.DELETE_ORPHAN && cascaded.reached.length > 0;
        // Read both ways round where it follows a relationship of either direction (#588).
        const kept = keptTargets(this.graph, cascaded.followed, 'UNION', true);
        const targets = cascaded.reached.length
            ? [
                  `cascade_targets AS (SELECT DISTINCT t.nid FROM (${cascaded.reached.join('\n    UNION ALL ')}) t ` +
                      `WHERE t.nid NOT IN (SELECT nid FROM cascade_roots)),`,
                  ...(orphans
                      ? [
                            `cascade_all AS (SELECT nid FROM cascade_roots UNION SELECT nid FROM cascade_targets),`,
                            `cascade_kept (nid) AS (\n    ${kept}),`
                        ]
                      : [])
              ]
            : [];
        const deleted = cascaded.reached.length
            ? `SELECT nid FROM cascade_roots UNION SELECT nid FROM cascade_targets` +
              `${orphans ? ' WHERE nid NOT IN (SELECT nid FROM cascade_kept)' : ''}`
            : 'SELECT nid FROM cascade_roots';
        // Every node deleted is counted, the roots and what the cascade took, as drivine4j counts them (#562).
        return this.byId(
            new PostgresStatement(
                [
                    `WITH ${orphans ? 'RECURSIVE ' : ''}cascade_roots AS (SELECT ${ROW_ALIAS}.nid ${this.from(
                        root,
                        filter
                    )}),`,
                    ...targets,
                    `gone AS (${deleted})`,
                    `SELECT drivine_delete(${sqlText(
                        this.graph.name
                    )}, (SELECT json_group_array(nid) FROM gone)) AS "deleted"`
                ].join('\n')
            )
        );
    }

    cascadeDepthChecks(target: TargetModel, where?: string): CascadeDepthCheck[] {
        if (target.kind !== 'GRAPH_VIEW') {
            return [];
        }
        const roots = `SELECT ${ROW_ALIAS}.nid ${this.from(target.model.root, this.deletedWhere(target, where))}`;
        const cascaded = new SqliteViews(this.graph).cascade(target.model, 'n.nid IN (SELECT nid FROM cascade_roots)');
        return cascaded.beyond.map(({ view, field, maxDepth, nodes, within }: CascadeBeyond) => ({
            view,
            field,
            maxDepth,
            statement: this.byId(new PostgresStatement(beyondCount(roots, within, nodes)))
        }));
    }

    deleteAll(target: TargetModel, where?: string): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        return this.deleting(root, this.rootWhere(target, where));
    }

    nearest(target: TargetModel, search: NearestSearch): GraphStatement {
        return json(new SqliteSearch(this.graph).nearest(target, search));
    }

    matching(target: TargetModel, search: MatchingSearch): GraphStatement {
        return json(new SqliteSearch(this.graph).matching(target, search));
    }

    save(
        target: TargetModel,
        object: any,
        options?: SaveOptions<any>,
        createOnly?: boolean,
        registry?: ModelRegistry
    ): SaveStatement {
        return new PostgresSaveBuilder(this.graph, registry).build(target, object, options, createOnly);
    }

    heldProperties(model: FragmentModel): GraphStatement {
        return this.byId(
            json(
                [
                    `SELECT ${NODE_ROW}.props AS "props"`,
                    this.from(model, this.idPredicate(model, NODE_ROW), NODE_ROW)
                ].join('\n')
            )
        );
    }

    foundStamp(model: FragmentModel): GraphStatement {
        return this.byId(
            new PostgresStatement(
                [
                    `SELECT COALESCE(${NODE_ROW}.stamp, '${Stamps.NEVER_STAMPED}') AS "found"`,
                    this.from(model, this.idPredicate(model, NODE_ROW), NODE_ROW)
                ].join('\n')
            )
        );
    }

    renderQuery<T>(fn: QueryFn<T>, target: TargetModel): RenderedQuery {
        return FragmentQueryRenderer.render(
            new SqlFragments('sqlite', { name: this.graph.name }),
            fn,
            target,
            ROW_ALIAS
        );
    }

    /** A raw `where`, over `n`, read over the row a read calls its root, `n_` (see CypherShorthand). */
    written(predicate: string): string {
        return new CypherShorthand(NODE_ROW, ROW_ALIAS, textOf).rewrite(predicate);
    }

    renderWhere<T>(fn: WhereFn<T>, target: TargetModel): { where: string; bindings: Record<string, any> } {
        return FragmentQueryRenderer.renderWhere(
            new SqlFragments('sqlite', { name: this.graph.name }),
            fn,
            target,
            ROW_ALIAS
        );
    }

    patchOne(model: FragmentModel, where?: string): GraphStatement {
        return new PostgresWrites(this.graph).patchOne(model, where);
    }

    patchMany(model: FragmentModel): GraphStatement {
        return new PostgresWrites(this.graph).patchMany(model);
    }

    fragmentBatch(groups: FragmentGroup[], options: SaveOptions<any>): GraphStatement {
        return new PostgresWrites(this.graph).fragmentBatch(groups, options);
    }

    groups(model: FragmentModel, query: GroupQuery<any, any>, pathTargets: Map<string, FragmentModel>): GraphStatement {
        return json(new SqliteGroups(this.graph).build(model, query, pathTargets));
    }

    /** The nodes of the target's labels one relationship of the type leads to from the node `from` names, each once. */
    related(from: MatchedNode, type: string, direction: Direction, target: FragmentModel): GraphStatement {
        if (!type?.trim()) {
            throw new DrivineError('A relationship needs a type.');
        }
        if (!from.model.nodeIdProperty) {
            throw new DrivineError(
                `${from.model.type.name} has no @NodeId property, so a node of it can't be referred to by id.`
            );
        }
        const join =
            direction === Direction.INCOMING
                ? 'e.dst = a.nid AND x.nid = e.src'
                : direction === Direction.UNDIRECTED
                ? '((e.src = a.nid AND x.nid = e.dst) OR (e.dst = a.nid AND x.nid = e.src))'
                : 'e.src = a.nid AND x.nid = e.dst';
        const labels = [...new Set([...from.model.labels, ...(from.labels ?? [])])];
        // The node it is from found by its id's JSON, as the index over the id is made (see NodeIds), bound by name: the
        // comparison reads it more than once.
        return json(
            `SELECT ${nodeDocument('n')} AS "result" FROM ${this.graph.nodes} n WHERE n.nid IN (` +
                `SELECT x.nid FROM ${this.graph.nodes} a JOIN ${this.graph.edges} e ON e.type = CAST($x_type AS TEXT) ` +
                `JOIN ${this.graph.nodes} x ON ${join} WHERE ${hasId(
                    'sqlite',
                    'a',
                    from.model.nodeIdProperty,
                    '$x_from'
                )} AND ${hasLabels('a', labels)} AND ${hasLabels('x', target.labels)})`,
            { x_type: type, x_from: idJson(from.id) }
        );
    }

    relate(
        from: MatchedNode,
        to: MatchedNode,
        type: string,
        properties: Record<string, any>,
        mode: RelateMode
    ): GraphStatement {
        return new PostgresWrites(this.graph).relate(from, to, type, properties, mode);
    }

    unrelate(from: MatchedNode, to: MatchedNode, type: string): GraphStatement {
        return new PostgresWrites(this.graph).unrelate(from, to, type);
    }

    unrelateAll(from: MatchedNode, type: string, direction: Direction): GraphStatement {
        return new PostgresWrites(this.graph).unrelateAll(from, type, direction);
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

    /**
     * The file was locked by another connection for longer than the connection waits (`SQLITE_BUSY`), or a table by
     * another statement (`SQLITE_LOCKED`): running again may succeed.
     */
    contended(failure: unknown): boolean {
        let cause: any = failure;
        for (let depth = 0; cause && depth < 10; depth++) {
            if (sqliteContended(cause)) {
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
            ...new SqliteViews(this.graph, depth).requirements(model, ROW_ALIAS)
        ];
        return parts.length ? parts.join(' AND ') : undefined;
    }

    /** The nodes of the fragment's labels that meet `where`, as the row `row`. */
    private from(model: FragmentModel, where?: string, row: string = ROW_ALIAS): string {
        const tests = [hasLabels(row, model.labels), ...(where ? [`(${where})`] : [])];
        return `FROM ${this.graph.nodes} ${row}\nWHERE ${tests.join(' AND ')}`;
    }

    /**
     * Deletes the nodes `where` selects, with their relationships, and returns how many: `{deleted}`. SQLite has no
     * delete a query reads, so they are selected first and handed to `drivine_delete`.
     */
    private deleting(model: FragmentModel, where?: string): GraphStatement {
        return new PostgresStatement(
            `SELECT drivine_delete(${sqlText(this.graph.name)}, (SELECT json_group_array(${ROW_ALIAS}.nid) ` +
                `${this.from(model, where)})) AS "deleted"`
        );
    }

    /** `statement`, which finds a node by `$id`, binding the id as the JSON text the node holds it as (see idJson). */
    private byId(statement: GraphStatement): GraphStatement {
        return PostgresStatement.of(statement).keyingId(idJson);
    }

    /**
     * The node whose id is `$id`, the JSON text the node holds it as, as `byId` binds it: the property's class and key
     * compared with the id's, as the shared module writes the comparison, which the index over the id answers (see
     * NodeIds). It reads `$id` more than once, which is bound by name.
     */
    private idPredicate(model: FragmentModel, row: string = ROW_ALIAS): string {
        if (!model.nodeIdProperty) {
            throw new DrivineError(`${model.type.name} has no @NodeId property, so it can't be found by id.`);
        }
        return hasId('sqlite', row, model.nodeIdProperty, '$id');
    }

    /** SQLite pages with `LIMIT … OFFSET …`, and an offset needs a limit before it: -1 for none. */
    private page(page: Page): string[] {
        return [
            ...(page.orderBy ? [`ORDER BY ${page.orderBy}`] : []),
            ...(page.limit !== undefined || page.skip !== undefined
                ? [`LIMIT ${page.limit ?? -1}${page.skip !== undefined ? ` OFFSET ${page.skip}` : ''}`]
                : [])
        ];
    }
}

/** A statement whose text values are each JSON, so the connection reads them as the values they are: see JSON_ROWS. */
function json(statement: string | GraphStatement, bindings?: Record<string, any>): PostgresStatement {
    return typeof statement === 'string'
        ? new PostgresStatement(`${JSON_ROWS}\n${statement}`, bindings)
        : new PostgresStatement(`${JSON_ROWS}\n${statement.text}`, statement.bindings);
}

/** An id as the JSON text a node on SQLite holds it as, as a save writes it (see writeLayout): what finds the node. */
function idJson(id: unknown): string {
    return writeLayout(id, 'sqlite');
}
