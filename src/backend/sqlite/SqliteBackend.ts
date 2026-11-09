import { Direction } from '@/annotation/Metadata';
import { MatchedNode } from '@/backend/EdgeStatements';
import { FragmentGroup } from '@/backend/FragmentBatchStatement';
import { CascadeDepthCheck, GraphBackend, MatchingSearch, NearestSearch, Page } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { PostgresSaveBuilder, storedKey } from '@/backend/postgres/PostgresSaveBuilder';
import { PostgresStatement } from '@/backend/postgres/PostgresStatement';
import { PostgresWrites } from '@/backend/postgres/PostgresWrites';
import { SaveStatement } from '@/backend/SaveStatement';
import { CascadeBeyond } from '@/backend/CascadeTargets';
import { beyondCount, keptTargets } from '@/backend/sql/SqlCascades';
import { CypherShorthand } from '@/backend/sql/CypherShorthand';
import { sqlText } from '@/backend/sql/SqlGraph';
import { SqliteGroups } from '@/backend/sqlite/SqliteGroups';
import {
    hasLabels,
    JSON_ROWS,
    labelArray,
    nodeDocument,
    numberOf,
    SqliteGraph,
    textOf
} from '@/backend/sqlite/SqliteGraph';
import { SqliteQueryRenderer } from '@/backend/sqlite/SqliteQueryRenderer';
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

/** The label of the node holding the store's identity: drivine4j's, so each library reads one identity. */
const STORE_LABEL = 'DrivineStore';

/** The label of the nodes recording what each schema owner applied: drivine4j's, so each reads one marker. */
const SCHEMA_MARKER = '_DrivineSchema';

/** The moment, in milliseconds since the epoch, as the graph engines' timestamp() gives it. */
const NOW_MILLIS = `CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)`;

/** What a statement over a fragment calls its node's row. A raw `where` is SQL over it. */
export const ROW_ALIAS = 'n';

/**
 * Statements for SQLite, over the tables of a SqliteGraph: drivine4j's store, so a file written from the JVM, from
 * Node and from Python is one. A load returns the rows the graph engines do, `{props, labels}` for a fragment, as JSON
 * text the connection reads (see JSON_ROWS). A raw `where` is an SQL predicate over the node's row, `n` (its `labels`,
 * `props` and `stamp`), in which a property of the node may be written as Cypher writes it, `n.name` (see `written`).
 *
 * A save, a patch and a relationship are the plan Postgres's write function carries out, carried out by `drivine_write`,
 * a function each connection registers (see SqlitePlanWriter). A delete that counts selects what it deletes and hands
 * it to `drivine_delete`: SQLite has no delete a query reads.
 *
 * The store is made on the connection provider's first connection, and by the object manager before its first
 * statement, for a backend of another graph than the provider's: see `ensuring`.
 */
export class SqliteBackend implements GraphBackend {
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
        return this.loadAllFragments(model, this.idPredicate(model));
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
        return this.loadAllViews(model, this.idPredicate(model.root), depth);
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
     * `drivine_delete`. Returns how many roots were deleted: `{deleted}`.
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
        // The roots are counted before anything is deleted: the left of the sum is worked out first.
        return new PostgresStatement(
            [
                `WITH ${orphans ? 'RECURSIVE ' : ''}cascade_roots AS (SELECT ${ROW_ALIAS}.nid ${this.from(
                    root,
                    filter
                )}),`,
                ...targets,
                `gone AS (${deleted})`,
                `SELECT (SELECT COUNT(*) FROM cascade_roots) + 0 * ` +
                    `drivine_delete(${sqlText(this.graph.name)}, (SELECT json_group_array(nid) FROM gone)) AS "deleted"`
            ].join('\n')
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
            statement: new PostgresStatement(beyondCount(roots, within, nodes))
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
        return json([`SELECT ${ROW_ALIAS}.props AS "props"`, this.from(model, this.idPredicate(model))].join('\n'));
    }

    foundStamp(model: FragmentModel): GraphStatement {
        return new PostgresStatement(
            [
                `SELECT COALESCE(${ROW_ALIAS}.stamp, '${Stamps.NEVER_STAMPED}') AS "found"`,
                this.from(model, this.idPredicate(model))
            ].join('\n')
        );
    }

    renderQuery<T>(fn: QueryFn<T>, target: TargetModel): RenderedQuery {
        return SqliteQueryRenderer.render(fn, target, (depth) => new SqliteViews(this.graph, depth), ROW_ALIAS);
    }

    written(predicate: string): string {
        return new CypherShorthand(ROW_ALIAS, ROW_ALIAS, textOf).rewrite(predicate);
    }

    renderWhere<T>(fn: WhereFn<T>, target: TargetModel): { where: string; bindings: Record<string, any> } {
        return SqliteQueryRenderer.renderWhere(fn, target, new SqliteViews(this.graph), ROW_ALIAS);
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
        return json(
            `SELECT ${nodeDocument('n')} AS "result" FROM ${this.graph.nodes} n WHERE n.nid IN (` +
                `SELECT x.nid FROM ${this.graph.nodes} a JOIN ${this.graph.edges} e ON e.type = CAST($x_type AS TEXT) ` +
                `JOIN ${this.graph.nodes} x ON ${join} WHERE ${hasLabels('a', labels)} AND ` +
                `${textOf('a', from.model.nodeIdProperty)} = CAST($x_from AS TEXT) AND ${hasLabels(
                    'x',
                    target.labels
                )})`,
            { x_type: type, x_from: storedKey(from.id) }
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
        return json(
            `SELECT json_object('id', ${textOf('n', 'storeId')}, 'assignedAt', ${textOf('n', 'assignedAt')}) ` +
                `AS "stamp" FROM ${this.graph.nodes} n WHERE ${hasLabels('n', [STORE_LABEL])} ` +
                `ORDER BY ${textOf('n', 'assignedAt')}, ${textOf('n', 'storeId')}`
        );
    }

    /** Mints the stamp unless it is there; the uniqueness constraint on its key turns away a racing writer's. */
    assignStoreStamp(): GraphStatement {
        return new PostgresStatement(
            `INSERT INTO ${this.graph.nodes} (labels, props) SELECT ${labelArray(STORE_LABEL)}, ` +
                `json_object('key', CAST($key AS TEXT), 'storeId', CAST($storeId AS TEXT), ` +
                `'assignedAt', CAST($assignedAt AS TEXT), 'engine', CAST($engine AS TEXT)) ` +
                `WHERE NOT EXISTS (SELECT 1 FROM ${this.graph.nodes} n WHERE ${hasLabels('n', [STORE_LABEL])} ` +
                `AND ${textOf('n', 'key')} = CAST($key AS TEXT))`
        );
    }

    schemaMarker(property: 'version' | 'items'): GraphStatement {
        return new PostgresStatement(
            `SELECT ${textOf('n', property)} AS "value" FROM ${this.graph.nodes} n WHERE ${this.marker('n')} ` +
                `ORDER BY ${this.newestFirst('n')} LIMIT 1`
        );
    }

    schemaScopes(): GraphStatement {
        return new PostgresStatement(
            `SELECT DISTINCT ${textOf('n', 'scope')} AS "scope" FROM ${this.graph.nodes} n WHERE ${hasLabels('n', [
                SCHEMA_MARKER
            ])}`
        );
    }

    /** SQLite keeps an empty string apart from null, so an inventory is kept as it is, as drivine4j keeps it. */
    markerItems(stored: string | null | undefined): string[] | undefined {
        return stored == null ? undefined : stored === '' ? [] : stored.split('\n');
    }

    /**
     * The newest marker of the scope is written, and one is made where there is none: the row is inserted with the
     * `nid` of the marker found, or none, and a marker that is there is written instead, as drivine4j writes it. A merge
     * patch leaves out what is null, so a version that is null removes the one the marker had.
     */
    recordSchemaMarker(): GraphStatement {
        const written = `'version', CAST($version AS TEXT), 'items', CAST($items AS TEXT), 'appliedAt', ${NOW_MILLIS}`;
        return new PostgresStatement(
            `INSERT INTO ${this.graph.nodes} (nid, labels, props) ` +
                `SELECT (SELECT m.nid FROM ${this.graph.nodes} m WHERE ${this.marker('m')} ` +
                `ORDER BY ${this.newestFirst('m')} LIMIT 1), ${labelArray(SCHEMA_MARKER)}, ` +
                `json_patch('{}', json_object('scope', CAST($scope AS TEXT), ${written})) WHERE 1 ` +
                `ON CONFLICT (nid) DO UPDATE SET props = json_patch(props, json_object(${written}))`
        );
    }

    pruneSchemaMarkers(): GraphStatement {
        return new PostgresStatement(
            `DELETE FROM ${this.graph.nodes} WHERE nid IN (SELECT nid FROM (SELECT n.nid, row_number() OVER (ORDER BY ` +
                `${this.newestFirst('n')}) AS position FROM ${this.graph.nodes} n WHERE ${this.marker('n')}) ranked ` +
                `WHERE position > 1)`
        );
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

    /** The markers of the owner bound as `$scope`. */
    private marker(alias: string): string {
        return `${hasLabels(alias, [SCHEMA_MARKER])} AND ${textOf(alias, 'scope')} = CAST($scope AS TEXT)`;
    }

    /** The marker applied last first, then the one made later, so the marker read, written and kept are one. */
    private newestFirst(alias: string): string {
        return `${numberOf(alias, 'appliedAt')} DESC NULLS LAST, ${alias}.nid DESC`;
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

    /** The nodes of the fragment's labels that meet `where`, as the row `n`. */
    private from(model: FragmentModel, where?: string): string {
        const tests = [hasLabels(ROW_ALIAS, model.labels), ...(where ? [`(${where})`] : [])];
        return `FROM ${this.graph.nodes} ${ROW_ALIAS}\nWHERE ${tests.join(' AND ')}`;
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

    /**
     * The node whose id is `$id`, read as text, as a uniqueness constraint over the id holds it and as drivine4j finds a
     * node: a number is its JSON text.
     */
    private idPredicate(model: FragmentModel): string {
        if (!model.nodeIdProperty) {
            throw new DrivineError(`${model.type.name} has no @NodeId property, so it can't be found by id.`);
        }
        return `${textOf(ROW_ALIAS, model.nodeIdProperty)} = CAST($id AS TEXT)`;
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
