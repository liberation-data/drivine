import { GraphBackend, MatchingSearch, NearestSearch, Page } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { hasLabels, jsonKey, nodeDocument, OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { OracleQueryRenderer } from '@/backend/oracle/OracleQueryRenderer';
import { OracleSaveBuilder } from '@/backend/oracle/OracleSaveBuilder';
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

/** What a statement over a fragment calls its node's row. A raw `where` is SQL over it. */
export const ROW_ALIAS = 'n';

/**
 * Statements for Oracle, over the tables of an OracleGraph. A load returns the rows the graph engines do, `{props,
 * labels}` for a fragment, as JSON. A raw `where` is an SQL predicate over the node's row, `n` (its `labels`, `props`
 * and `stamp`). What isn't written for Oracle yet says so.
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
        if (cascade !== CascadeType.NONE) {
            return this.notYet('A cascading delete');
        }
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const id = this.idPredicate(root);
        return this.deleting(root, this.rootWhere(target, where ? `${id} AND (${where})` : id));
    }

    deleteAll(target: TargetModel, where?: string): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        return this.deleting(root, this.rootWhere(target, where));
    }

    nearest(_target: TargetModel, _search: NearestSearch): GraphStatement {
        return this.notYet('loadNearest');
    }

    matching(_target: TargetModel, _search: MatchingSearch): GraphStatement {
        return this.notYet('loadMatching');
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

    patchOne(_model: FragmentModel, _where?: string): GraphStatement {
        return this.notYet('patch');
    }

    patchMany(_model: FragmentModel): GraphStatement {
        return this.notYet('patchAll');
    }

    fragmentBatch(_groups: FragmentGroup[], _options: SaveOptions<any>): GraphStatement {
        return this.notYet('saveAll');
    }

    groups(_model: FragmentModel, _query: GroupQuery<any, any>, _targets: Map<string, FragmentModel>): GraphStatement {
        return this.notYet('A grouped read');
    }

    related(_from: MatchedNode, _type: string, _direction: Direction, _target: FragmentModel): GraphStatement {
        return this.notYet('edges.loadRelated');
    }

    relate(
        _from: MatchedNode,
        _to: MatchedNode,
        _type: string,
        _props: Record<string, any>,
        _mode: RelateMode
    ): GraphStatement {
        return this.notYet('edges.relate');
    }

    unrelate(_from: MatchedNode, _to: MatchedNode, _type: string): GraphStatement {
        return this.notYet('edges.unrelate');
    }

    unrelateAll(_from: MatchedNode, _type: string, _direction: Direction): GraphStatement {
        return this.notYet('edges.unrelateAll');
    }

    storeStamps(): GraphStatement {
        return this.notYet('The store identity');
    }

    assignStoreStamp(): GraphStatement {
        return this.notYet('The store identity');
    }

    schemaVersion(): GraphStatement {
        return this.notYet('The schema marker');
    }

    recordSchemaVersion(): GraphStatement {
        return this.notYet('The schema marker');
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

    private notYet(what: string): GraphStatement {
        throw this.unsupported(what);
    }

    private unsupported(what: string): DrivineError {
        return new DrivineError(`${what} is not available on Oracle yet.`);
    }
}
