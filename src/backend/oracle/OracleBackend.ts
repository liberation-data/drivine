import { GraphBackend, MatchingSearch, NearestSearch, Page } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { hasLabels, jsonKey, nodeDocument, OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { OracleQueryRenderer } from '@/backend/oracle/OracleQueryRenderer';
import { OracleSaveBuilder } from '@/backend/oracle/OracleSaveBuilder';
import { OracleWrites } from '@/backend/oracle/OracleWrites';
import { OracleSearch } from '@/backend/oracle/OracleSearch';
import { OracleGroups } from '@/backend/oracle/OracleGroups';
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
 * and `stamp`).
 */
export class OracleBackend implements GraphBackend {
    constructor(readonly graph: OracleGraph = new OracleGraph()) {}

    loadAllFragments(model: FragmentModel, where?: string, page: Page = {}): GraphStatement {
        return new GraphStatement(
            [`SELECT ${nodeDocument(ROW_ALIAS)} AS "result"`, this.from(model, where), ...this.page(page)].join('\n')
        );
    }

    loadFragment(model: FragmentModel): GraphStatement {
        return this.loadAllFragments(model, this.idPredicate(model));
    }

    countFragments(model: FragmentModel, where?: string): GraphStatement {
        return new GraphStatement([`SELECT COUNT(*) AS "count"`, this.from(model, where)].join('\n'));
    }

    loadAllViews(
        model: GraphViewModel,
        where?: string,
        depth: Record<string, number> = {},
        page: Page = {}
    ): GraphStatement {
        const views = new OracleViews(this.graph, depth);
        return new GraphStatement(
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
        return new GraphStatement(
            [`SELECT COUNT(*) AS "count"`, this.from(model.root, this.viewWhere(model, where, depth))].join('\n')
        );
    }

    delete(target: TargetModel, where?: string, cascade: CascadeType = CascadeType.NONE): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const id = this.idPredicate(root);
        const filter = this.rootWhere(target, where ? `${id} AND (${where})` : id);
        if (cascade === CascadeType.NONE) {
            return this.deleting(root, filter);
        }
        if (target.kind !== 'GRAPH_VIEW') {
            throw new DrivineError(`A cascade follows a view's relationships. ${root.type.name} is a @NodeFragment.`);
        }
        const reached = new OracleViews(this.graph).cascaded(target.model, 'v_roots');
        const deletable =
            cascade === CascadeType.DELETE_ORPHAN
                ? ` AND NOT EXISTS (SELECT 1 FROM ${this.graph.edges} e WHERE e.src = x.nid OR e.dst = x.nid)`
                : '';
        return new GraphStatement(`DECLARE
    v_roots SYS.ODCINUMBERLIST;
    v_targets SYS.ODCINUMBERLIST := SYS.ODCINUMBERLIST();
    v_deleted NUMBER;
    c SYS_REFCURSOR;
BEGIN
    SELECT ${ROW_ALIAS}.nid BULK COLLECT INTO v_roots ${this.from(root, filter)};
    ${
        reached.length
            ? `SELECT DISTINCT nid BULK COLLECT INTO v_targets FROM (${reached.join('\n        UNION ALL ')});`
            : 'NULL;'
    }
    DELETE FROM ${this.graph.nodes} WHERE nid IN (SELECT column_value FROM TABLE(v_roots));
    v_deleted := SQL%ROWCOUNT;
    -- The roots' relationships went with them (the relationship table cascades), so an orphan is now one with none.
    DELETE FROM ${this.graph.nodes} x WHERE x.nid IN (SELECT column_value FROM TABLE(v_targets))${deletable};
    OPEN c FOR SELECT v_deleted AS "deleted" FROM dual;
    DBMS_SQL.RETURN_RESULT(c);
END;`);
    }

    deleteAll(target: TargetModel, where?: string): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        return this.deleting(root, this.rootWhere(target, where));
    }

    searchIndexTable(kind: 'VECTOR' | 'FULLTEXT', label: string, properties: string[]): GraphStatement {
        return new GraphStatement(
            `SELECT object_name AS "table" FROM ${this.graph.catalog} WHERE kind = $kind AND label = $label ` +
                `AND properties = $properties AND object_name IS NOT NULL`,
            { kind, label, properties: JSON.stringify(properties) }
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

    heldProperties(model: FragmentModel): GraphStatement {
        return new GraphStatement(
            [`SELECT ${ROW_ALIAS}.props AS "props"`, this.from(model, this.idPredicate(model))].join('\n')
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

    renderQuery<T>(fn: QueryFn<T>, target: TargetModel): RenderedQuery {
        return OracleQueryRenderer.render(fn, target, (depth) => new OracleViews(this.graph, depth), ROW_ALIAS);
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

    /** The nodes of the fragment's labels that meet `where`, as the row `n`. */
    private from(model: FragmentModel, where?: string): string {
        const labels = hasLabels(ROW_ALIAS, model.labels);
        return `FROM ${this.graph.nodes} ${ROW_ALIAS}\nWHERE ${labels}${where ? ` AND (${where})` : ''}`;
    }

    /** Deletes the nodes `where` selects, with their relationships, and returns how many: `{deleted}`. */
    private deleting(model: FragmentModel, where?: string): GraphStatement {
        return new GraphStatement(`DECLARE
    v_deleted NUMBER;
    c SYS_REFCURSOR;
BEGIN
    DELETE ${this.from(model, where)};
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
