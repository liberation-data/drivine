import { Direction } from '@/annotation/Metadata';
import { MatchedNode } from '@/backend/EdgeStatements';
import { FragmentGroup } from '@/backend/FragmentBatchStatement';
import { CascadeDepthCheck, GraphBackend, MatchingSearch, NearestSearch, Page } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { PostgresGroups } from '@/backend/postgres/PostgresGroups';
import { hasLabels, nodeDocument, numberOf, PostgresGraph, textOf } from '@/backend/postgres/PostgresGraph';
import { PostgresQueryRenderer } from '@/backend/postgres/PostgresQueryRenderer';
import { PostgresSaveBuilder, storedKey } from '@/backend/postgres/PostgresSaveBuilder';
import { PostgresSearch } from '@/backend/postgres/PostgresSearch';
import { PostgresStatement } from '@/backend/postgres/PostgresStatement';
import { PostgresViews } from '@/backend/postgres/PostgresViews';
import { PostgresWrites } from '@/backend/postgres/PostgresWrites';
import { SaveStatement } from '@/backend/SaveStatement';
import { beyondCount, keptTargets } from '@/backend/sql/SqlCascades';
import { CascadeBeyond } from '@/backend/CascadeTargets';
import { CATALOG_KINDS, catalogProperties } from '@/backend/sql/SqlCatalog';
import { sqlText } from '@/backend/sql/SqlGraph';
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

/** The label of the node holding the store's identity: drivine4j's, so both read one identity. */
const STORE_LABEL = 'DrivineStore';

/** The label of the nodes recording what each schema owner applied: drivine4j's, so both read one marker. */
const SCHEMA_MARKER = '_DrivineSchema';

/** The moment, in milliseconds since the epoch, as the graph engines' timestamp() gives it. */
const NOW_MILLIS = 'CAST(floor(extract(epoch FROM clock_timestamp()) * 1000) AS bigint)';

/** What a statement over a fragment calls its node's row. A raw `where` is SQL over it. */
export const ROW_ALIAS = 'n';

/**
 * Statements for Postgres, over the tables of a PostgresGraph: drivine4j's store, so a graph written from the JVM and
 * from Node is one. A load returns the rows the graph engines do, `{props, labels}` for a fragment, as `jsonb`. A raw
 * `where` is an SQL predicate over the node's row, `n` (its `labels`, `props` and `stamp`).
 *
 * The store is made by the object manager, before its first statement: see `ensuring`.
 */
export class PostgresBackend implements GraphBackend {
    constructor(readonly graph: PostgresGraph = new PostgresGraph()) {}

    get ensuring(): string {
        return this.graph.ensuring;
    }

    loadAllFragments(model: FragmentModel, where?: string, page: Page = {}): GraphStatement {
        return new PostgresStatement(
            [`SELECT ${nodeDocument(ROW_ALIAS)} AS "result"`, this.from(model, where), ...this.page(page)].join('\n')
        );
    }

    loadFragment(model: FragmentModel): GraphStatement {
        return this.loadAllFragments(model, this.idPredicate(model));
    }

    countFragments(model: FragmentModel, where?: string): GraphStatement {
        return new PostgresStatement(
            [`SELECT CAST(COUNT(*) AS integer) AS "count"`, this.from(model, where)].join('\n')
        );
    }

    loadAllViews(
        model: GraphViewModel,
        where?: string,
        depth: Record<string, number> = {},
        page: Page = {}
    ): GraphStatement {
        const views = new PostgresViews(this.graph, depth);
        return new PostgresStatement(
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
            [
                `SELECT CAST(COUNT(*) AS integer) AS "count"`,
                this.from(model.root, this.viewWhere(model, where, depth))
            ].join('\n')
        );
    }

    /**
     * Deletes the root with id `$id` that meets `where`, and for a cascade the nodes a load of the view reaches from it
     * through the relationships a save writes (see SqlViews.cascade): every one, or with `DELETE_ORPHAN` those not kept
     * (see keptTargets). Postgres runs a statement's deletes on one snapshot, so what is kept is read before anything
     * is deleted. Returns how many roots were deleted: `{deleted}`.
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
        const cascaded = new PostgresViews(this.graph).cascade(
            target.model,
            'n.nid IN (SELECT nid FROM cascade_roots)'
        );
        const orphans = cascade === CascadeType.DELETE_ORPHAN && cascaded.reached.length > 0;
        const targets = cascaded.reached.length
            ? [
                  `cascade_targets AS (SELECT DISTINCT t.nid FROM (${cascaded.reached.join('\n    UNION ALL ')}) t ` +
                      `WHERE t.nid NOT IN (SELECT nid FROM cascade_roots)),`,
                  ...(orphans
                      ? [
                            `cascade_all AS (SELECT nid FROM cascade_roots UNION SELECT nid FROM cascade_targets),`,
                            `cascade_kept (nid) AS (\n    ${keptTargets(this.graph, cascaded.followed, 'UNION')}),`
                        ]
                      : []),
                  `deleted_targets AS (DELETE FROM ${this.graph.nodes} x WHERE x.nid IN (SELECT nid FROM cascade_targets)` +
                      `${orphans ? ' AND x.nid NOT IN (SELECT nid FROM cascade_kept)' : ''} RETURNING 1),`
              ]
            : [];
        return new PostgresStatement(
            [
                `WITH ${orphans ? 'RECURSIVE ' : ''}cascade_roots AS (SELECT ${ROW_ALIAS}.nid ${this.from(
                    root,
                    filter
                )}),`,
                ...targets,
                `deleted AS (DELETE FROM ${this.graph.nodes} WHERE nid IN (SELECT nid FROM cascade_roots) RETURNING 1)`,
                `SELECT CAST(COUNT(*) AS integer) AS "deleted" FROM deleted`
            ].join('\n')
        );
    }

    cascadeDepthChecks(target: TargetModel, where?: string): CascadeDepthCheck[] {
        if (target.kind !== 'GRAPH_VIEW') {
            return [];
        }
        const roots = `SELECT ${ROW_ALIAS}.nid ${this.from(target.model.root, this.deletedWhere(target, where))}`;
        const cascaded = new PostgresViews(this.graph).cascade(
            target.model,
            'n.nid IN (SELECT nid FROM cascade_roots)'
        );
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

    /**
     * Whether a search index was made, which is over the node table: the size of the embeddings a vector index holds,
     * and the name of a full-text index. One row, or none when the index was not made, or was dropped by hand.
     */
    searchIndexTable(kind: 'VECTOR' | 'FULLTEXT', label: string, properties: string[]): GraphStatement {
        const made = kind === 'VECTOR' ? `details ->> 'dimensions'` : 'object_name';
        return new PostgresStatement(
            `SELECT ${made} AS "table" FROM ${this.graph.catalog} WHERE kind = CAST($kind AS text) ` +
                `AND label = CAST($label AS text) AND properties = CAST($properties AS text) ` +
                `AND object_name IS NOT NULL AND to_regclass(object_name) IS NOT NULL`,
            { kind: CATALOG_KINDS[kind], label, properties: catalogProperties(properties) }
        );
    }

    nearest(target: TargetModel, search: NearestSearch): GraphStatement {
        return PostgresStatement.of(new PostgresSearch(this.graph).nearest(target, search));
    }

    matching(target: TargetModel, search: MatchingSearch): GraphStatement {
        return PostgresStatement.of(new PostgresSearch(this.graph).matching(target, search));
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
        return new PostgresStatement(
            [`SELECT ${ROW_ALIAS}.props AS "props"`, this.from(model, this.idPredicate(model))].join('\n')
        );
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
        return PostgresQueryRenderer.render(fn, target, (depth) => new PostgresViews(this.graph, depth), ROW_ALIAS);
    }

    renderWhere<T>(fn: WhereFn<T>, target: TargetModel): { where: string; bindings: Record<string, any> } {
        return PostgresQueryRenderer.renderWhere(fn, target, new PostgresViews(this.graph), ROW_ALIAS);
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
        return PostgresStatement.of(new PostgresGroups(this.graph).build(model, query, pathTargets));
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
        return new PostgresStatement(
            `SELECT ${nodeDocument('n')} AS "result" FROM ${this.graph.nodes} n WHERE n.nid IN (` +
                `SELECT x.nid FROM ${this.graph.nodes} a JOIN ${this.graph.edges} e ON e.type = CAST($x_type AS text) ` +
                `JOIN ${this.graph.nodes} x ON ${join} WHERE ${hasLabels('a', labels)} AND ` +
                `${textOf('a', from.model.nodeIdProperty)} = CAST($x_from AS text) AND ${hasLabels(
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
        return new PostgresStatement(
            `SELECT jsonb_build_object('id', ${textOf('n', 'storeId')}, 'assignedAt', ${textOf('n', 'assignedAt')}) ` +
                `AS "stamp" FROM ${this.graph.nodes} n WHERE ${hasLabels('n', [STORE_LABEL])} ` +
                `ORDER BY ${textOf('n', 'assignedAt')}, ${textOf('n', 'storeId')}`
        );
    }

    /** Mints the stamp unless it is there; the uniqueness constraint on its key turns away a racing writer's. */
    assignStoreStamp(): GraphStatement {
        return new PostgresStatement(
            `INSERT INTO ${this.graph.nodes} (labels, props) SELECT ${sqlText(`["${STORE_LABEL}"]`)}, ` +
                `jsonb_build_object('key', CAST($key AS text), 'storeId', CAST($storeId AS text), ` +
                `'assignedAt', CAST($assignedAt AS text), 'engine', CAST($engine AS text)) ` +
                `WHERE NOT EXISTS (SELECT 1 FROM ${this.graph.nodes} n WHERE ${hasLabels('n', [STORE_LABEL])} ` +
                `AND ${textOf('n', 'key')} = CAST($key AS text))`
        );
    }

    schemaMarker(property: 'version' | 'items'): GraphStatement {
        return new PostgresStatement(
            `SELECT ${textOf('n', property)} AS "value" FROM ${this.graph.nodes} n WHERE ${this.marker('n')} ` +
                `ORDER BY ${this.newestFirst('n')} LIMIT 1`
        );
    }

    /** Postgres keeps an empty string apart from null, so an inventory is kept as it is, as drivine4j keeps it. */
    markerItems(stored: string | null | undefined): string[] | undefined {
        return stored == null ? undefined : stored === '' ? [] : stored.split('\n');
    }

    /** The newest marker of the scope is written, and one is made where there is none. */
    recordSchemaMarker(): GraphStatement {
        const written = `'version', CAST($version AS text), 'items', CAST($items AS text), 'appliedAt', ${NOW_MILLIS}`;
        return new PostgresStatement(
            `WITH found AS (SELECT m.nid FROM ${this.graph.nodes} m WHERE ${this.marker('m')} ` +
                `ORDER BY ${this.newestFirst('m')} LIMIT 1), ` +
                `written AS (UPDATE ${this.graph.nodes} n SET props = jsonb_strip_nulls(n.props || jsonb_build_object(${written})) ` +
                `FROM found WHERE n.nid = found.nid RETURNING n.nid) ` +
                `INSERT INTO ${this.graph.nodes} (labels, props) SELECT ${sqlText(`["${SCHEMA_MARKER}"]`)}, ` +
                `jsonb_strip_nulls(jsonb_build_object('scope', CAST($scope AS text), ${written})) ` +
                `WHERE NOT EXISTS (SELECT 1 FROM found)`
        );
    }

    pruneSchemaMarkers(): GraphStatement {
        return new PostgresStatement(
            `DELETE FROM ${this.graph.nodes} WHERE nid IN (SELECT nid FROM (SELECT n.nid, row_number() OVER (ORDER BY ` +
                `${this.newestFirst('n')}) AS position FROM ${this.graph.nodes} n WHERE ${this.marker('n')}) ranked ` +
                `WHERE position > 1)`
        );
    }

    /** A serialization failure (40001) or a deadlock (40P01) is another writer's doing: running again may succeed. */
    contended(failure: unknown): boolean {
        let cause: any = failure;
        for (let depth = 0; cause && depth < 10; depth++) {
            if (cause.code === '40001' || cause.code === '40P01') {
                return true;
            }
            cause = cause.rootCause ?? cause.cause;
        }
        return false;
    }

    /** The markers of the owner bound as `$scope`. */
    private marker(alias: string): string {
        return `${hasLabels(alias, [SCHEMA_MARKER])} AND ${textOf(alias, 'scope')} = CAST($scope AS text)`;
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
            ...new PostgresViews(this.graph, depth).requirements(model, ROW_ALIAS)
        ];
        return parts.length ? parts.join(' AND ') : undefined;
    }

    /** The nodes of the fragment's labels that meet `where`, as the row `n`. */
    private from(model: FragmentModel, where?: string): string {
        const tests = [hasLabels(ROW_ALIAS, model.labels), ...(where ? [`(${where})`] : [])];
        return `FROM ${this.graph.nodes} ${ROW_ALIAS}\nWHERE ${tests.join(' AND ')}`;
    }

    /** Deletes the nodes `where` selects, with their relationships, and returns how many: `{deleted}`. */
    private deleting(model: FragmentModel, where?: string): GraphStatement {
        return new PostgresStatement(
            `WITH deleted AS (DELETE ${this.from(model, where)} RETURNING 1)\n` +
                `SELECT CAST(COUNT(*) AS integer) AS "deleted" FROM deleted`
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
        return `${textOf(ROW_ALIAS, model.nodeIdProperty)} = CAST($id AS text)`;
    }

    private page(page: Page): string[] {
        return [
            ...(page.orderBy ? [`ORDER BY ${page.orderBy}`] : []),
            ...(page.skip !== undefined ? [`OFFSET ${page.skip} ROWS`] : []),
            ...(page.limit !== undefined ? [`FETCH NEXT ${page.limit} ROWS ONLY`] : [])
        ];
    }
}
