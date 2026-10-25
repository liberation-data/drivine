import { CascadeDepthCheck, GraphBackend, MatchingSearch, NearestSearch, Page } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { fragment, ViewProjector } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import { TargetModel } from '@/model/RelationshipModel';
import { CascadeType } from '@/manager/CascadeType';
import { Cascade, CascadeBeyond, CascadeTargets } from '@/backend/CascadeTargets';
import { SaveStatementBuilder } from '@/backend/SaveStatementBuilder';
import { SaveStatement } from '@/backend/SaveStatement';
import { STAMP } from '@/backend/CypherStamps';
import { Stamps } from '@/model/Stamps';
import { SaveOptions } from '@/manager/SaveOptions';
import { ModelRegistry } from '@/model/ModelRegistry';
import { QueryRenderer, RenderedQuery } from '@/dsl/QueryRenderer';
import { QueryFn, WhereFn } from '@/dsl/Refs';
import { PatchStatements } from '@/backend/PatchStatements';
import { FragmentBatchStatement, FragmentGroup } from '@/backend/FragmentBatchStatement';
import { GroupStatement } from '@/backend/GroupStatement';
import { GroupQuery } from '@/manager/Groups';
import { EdgeStatements, MatchedNode } from '@/backend/EdgeStatements';
import { Direction } from '@/annotation/Metadata';
import { RelateMode } from '@/manager/NodeRef';

/** The label of the node holding the store's identity: drivine4j's, so both read one identity. */
const STORE_LABEL = 'DrivineStore';

/** The label of the nodes recording what each schema owner applied: drivine4j's, so both read one marker. */
const SCHEMA_MARKER = '_DrivineSchema';

/** How many times its limit a full-text search asks its index for, when something drops hits after the index. */
export const FULL_TEXT_FILTERED_OVER_FETCH = 10;

/**
 * The most hits a full-text search asks its index for, however large its limit: the largest a Java int holds, as
 * drivine4j's limit is one.
 */
export const FULL_TEXT_INDEX_LIMIT_CEILING = 2_147_483_647;

/**
 * How many hits the full-text index may yield to a search that returns `limit` rows. Where nothing drops a hit after
 * the index, the best `limit` hits are the answer. Where a filter does, the index is asked for
 * FULL_TEXT_FILTERED_OVER_FETCH times as many and the filter chooses among them, so a filter that passes fewer than one
 * in ten of the best hits can return fewer than `limit` rows while the index holds more that pass it.
 */
export function fullTextIndexLimit(limit: number, filtered: boolean): number {
    return Math.min(filtered ? limit * FULL_TEXT_FILTERED_OVER_FETCH : limit, FULL_TEXT_INDEX_LIMIT_CEILING);
}

/** What a statement over a fragment calls its node. Filters are written against it. */
export const NODE_ALIAS = 'n';

export class CypherBackend implements GraphBackend {
    constructor(readonly grammar: CypherGrammar) {}

    loadAllFragments(model: FragmentModel, where?: string, page: Page = {}): GraphStatement {
        return new GraphStatement(
            [this.match(model), this.where(where), this.projectFragment(), this.page(page)].join('')
        );
    }

    loadFragment(model: FragmentModel): GraphStatement {
        return this.loadAllFragments(model, this.idPredicate(model));
    }

    countFragments(model: FragmentModel, where?: string): GraphStatement {
        return new GraphStatement(
            [this.match(model), this.where(where), `\nRETURN count(${NODE_ALIAS}) AS count`].join('')
        );
    }

    loadAllViews(
        model: GraphViewModel,
        where?: string,
        depth: Record<string, number> = {},
        page: Page = {}
    ): GraphStatement {
        const projection = new ViewProjector(this.grammar, depth).project(model, NODE_ALIAS);
        return new GraphStatement(
            [
                this.match(model.root),
                this.viewWhere(model, where, depth),
                ...projection.calls.map((it) => `\n${it}`),
                `\nRETURN ${projection.expression} AS result`,
                this.page(page)
            ].join('')
        );
    }

    loadView(model: GraphViewModel, depth: Record<string, number> = {}): GraphStatement {
        return this.loadAllViews(model, this.idPredicate(model.root), depth);
    }

    countViews(model: GraphViewModel, where?: string, depth: Record<string, number> = {}): GraphStatement {
        return new GraphStatement(
            [
                this.match(model.root),
                this.viewWhere(model, where, depth),
                `\nRETURN count(${NODE_ALIAS}) AS count`
            ].join('')
        );
    }

    delete(target: TargetModel, where?: string, cascade: CascadeType = CascadeType.NONE): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const head = this.deleted(target, where);
        if (cascade === CascadeType.NONE) {
            return new GraphStatement(`${head}\nDETACH DELETE ${NODE_ALIAS}\nRETURN count(*) AS deleted`);
        }
        if (target.kind !== 'GRAPH_VIEW') {
            throw new DrivineError(`A cascade follows a view's relationships. ${root.type.name} is a @NodeFragment.`);
        }
        if (cascade === CascadeType.DELETE_ORPHAN && this.grammar.orphanDeleteLimit) {
            throw new DrivineError(
                `CascadeType.DELETE_ORPHAN is not available on ${this.grammar.engine}: ${this.grammar.orphanDeleteLimit}.`
            );
        }
        const cascaded: Cascade = new CascadeTargets(this.grammar).cascade(target.model, NODE_ALIAS);
        const holders: string = cascaded.holders('t');
        // WITH before the list: FalkorDB errors on a WHERE and a projection that both hold comprehensions
        // (FalkorDB/FalkorDB#3387).
        const targets = [`\nWITH ${NODE_ALIAS}`, `\nWITH ${NODE_ALIAS}, ${cascaded.targets} AS targets`];
        if (cascade === CascadeType.DELETE_ALL) {
            return new GraphStatement(
                [
                    head,
                    ...targets,
                    `\nDETACH DELETE ${NODE_ALIAS}`,
                    `\nWITH targets`,
                    `\nFOREACH (t IN targets | DETACH DELETE t)`,
                    `\nRETURN count(*) AS deleted`
                ].join('')
            );
        }
        // A node is kept when a node outside the cascade refers to it, or when it is one step of a relationship the
        // cascade follows below a kept one: a kept message keeps its attachments, and its session is still deleted.
        // What is kept is read before anything is deleted, so a node's relationships to others the cascade takes do
        // not keep it. Holders chain through the targets (a part of two sessions starts a second run of levels), so the
        // walk takes as many steps as there are targets; `found` is what is kept, and how much of it the step before
        // had: each step reads holders among the newly kept only, and once one keeps nothing new the rest pass it on.
        return new GraphStatement(
            [
                head,
                ...targets,
                // A node reached by two paths, or the root reached again, is in the targets once, and the root not at all.
                `\nWITH ${NODE_ALIAS}, reduce(seen = [], t IN targets | ` +
                    `CASE WHEN t IN seen OR t = ${NODE_ALIAS} THEN seen ELSE seen + t END) AS targets`,
                `\nWITH ${NODE_ALIAS}, targets, ` +
                    `[t IN targets WHERE any(m IN [(t)--(m) | m] WHERE m <> ${NODE_ALIAS} AND NOT m IN targets)] AS kept`,
                `\nWITH ${NODE_ALIAS}, targets, reduce(found = [kept, 0], step IN range(1, size(targets)) | ` +
                    `CASE WHEN found[1] = size(found[0]) THEN found ELSE [found[0] + [t IN targets WHERE NOT t IN found[0] ` +
                    `AND any(h IN ${holders} WHERE h IN found[0][found[1]..])], size(found[0])] END)[0] AS kept`,
                `\nWITH ${NODE_ALIAS}, [t IN targets WHERE NOT t IN kept] AS orphans`,
                `\nDETACH DELETE ${NODE_ALIAS}`,
                `\nWITH orphans`,
                `\nFOREACH (t IN orphans | DETACH DELETE t)`,
                `\nRETURN count(*) AS deleted`
            ].join('')
        );
    }

    cascadeDepthChecks(target: TargetModel, where?: string): CascadeDepthCheck[] {
        if (target.kind !== 'GRAPH_VIEW') {
            return [];
        }
        const cascaded = new CascadeTargets(this.grammar).cascade(target.model, NODE_ALIAS);
        return cascaded.beyond.map(({ view, field, maxDepth, nodes, within }: CascadeBeyond) => ({
            view,
            field,
            maxDepth,
            statement: new GraphStatement(
                [
                    this.deleted(target, where),
                    `\nWITH ${NODE_ALIAS}`,
                    `\nWITH ${NODE_ALIAS}, ${within.join(' + ')} AS levels, ${nodes} AS beyond`,
                    `\nUNWIND beyond AS b`,
                    `\nWITH ${NODE_ALIAS}, levels, b WHERE NOT b IN levels AND b <> ${NODE_ALIAS}`,
                    `\nRETURN count(DISTINCT b) AS beyond`
                ].join('')
            )
        }));
    }

    deleteAll(target: TargetModel, where?: string): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        return new GraphStatement(
            [
                this.match(root),
                this.rootWhere(target, where),
                `\nDETACH DELETE ${NODE_ALIAS}\nRETURN count(*) AS deleted`
            ].join('')
        );
    }

    nearest(target: TargetModel, search: NearestSearch): GraphStatement {
        const { call, score }: { call: string; score: string } = this.grammar.vectorSearch(
            search.label,
            search.property,
            search.similarity
        );
        return this.scored(
            target,
            [call.replace('$_k', String(search.k)), `WITH ${NODE_ALIAS}, ${score} AS _score`],
            search
        );
    }

    /**
     * Scaled by the best hit, so the scale is [0, 1] on every engine; a best score of 0 (FalkorDB) gives each 1.
     *
     * Every hit is collected to find the best, and each row after carries the collection, so the number of hits, not
     * the limit, is what a search costs, and a common word matches most of a corpus. So the hits are cut to the best
     * `fullTextIndexLimit` before they are collected, on every engine, and an engine whose call takes a limit is given
     * it too. The cut keeps the best score, so the scale is the same as with every hit.
     *
     * The cut's sort stays even where the call yields its hits best first: `collect` keeps the order it is given and
     * `UNWIND` the order of the list, so the rows come out best first, and a fragment's limit takes no sort of its own.
     */
    matching(target: TargetModel, search: MatchingSearch): GraphStatement {
        const indexLimit = fullTextIndexLimit(search.limit, this.filtersAfterSearch(target, search.where));
        const head = [
            this.grammar.fullTextSearch(search.label, search.properties, indexLimit),
            'WITH node, score',
            'ORDER BY score DESC',
            `LIMIT ${indexLimit}`,
            'WITH collect({node: node, score: score}) AS _hits, max(score) AS _best',
            'UNWIND _hits AS _hit',
            `WITH _hit.node AS ${NODE_ALIAS}, CASE WHEN _best > 0 THEN _hit.score / _best ELSE 1.0 END AS _score`
        ];
        return this.scored(target, head, search, true);
    }

    save(
        target: TargetModel,
        object: any,
        options?: SaveOptions<any>,
        createOnly?: boolean,
        registry?: ModelRegistry
    ): SaveStatement {
        return new SaveStatementBuilder(this.grammar, registry).build(target, object, options, createOnly);
    }

    heldProperties(model: FragmentModel): GraphStatement {
        return new GraphStatement(
            `${this.match(model)}\nWHERE ${this.idPredicate(model)}\nRETURN properties(${NODE_ALIAS}) AS props`
        );
    }

    foundStamp(model: FragmentModel): GraphStatement {
        return new GraphStatement(
            `${this.match(model)}\nWHERE ${this.idPredicate(model)}\nRETURN coalesce(${NODE_ALIAS}.${STAMP}, '${
                Stamps.NEVER_STAMPED
            }') AS found`
        );
    }

    renderQuery<T>(fn: QueryFn<T>, target: TargetModel): RenderedQuery {
        return QueryRenderer.render(fn, target, this.grammar, NODE_ALIAS);
    }

    written(predicate: string): string {
        return predicate;
    }

    renderWhere<T>(fn: WhereFn<T>, target: TargetModel): { where: string; bindings: Record<string, any> } {
        return QueryRenderer.renderWhere(fn, target, this.grammar, NODE_ALIAS);
    }

    patchOne(model: FragmentModel, where?: string): GraphStatement {
        return PatchStatements.one(model, this.grammar, where);
    }

    patchMany(model: FragmentModel): GraphStatement {
        return PatchStatements.many(model, this.grammar);
    }

    fragmentBatch(groups: FragmentGroup[], options: SaveOptions<any>): GraphStatement {
        return FragmentBatchStatement.build(groups, options, this.grammar);
    }

    groups(model: FragmentModel, query: GroupQuery<any, any>, pathTargets: Map<string, FragmentModel>): GraphStatement {
        return GroupStatement.build(
            model,
            GroupStatement.resolved(model, query, new QueryRenderer(this.grammar)),
            pathTargets
        );
    }

    related(from: MatchedNode, type: string, direction: Direction, target: FragmentModel): GraphStatement {
        return EdgeStatements.related(from, type, direction, target);
    }

    relate(
        from: MatchedNode,
        to: MatchedNode,
        type: string,
        properties: Record<string, any>,
        mode: RelateMode
    ): GraphStatement {
        return EdgeStatements.relate(from, to, type, properties, mode);
    }

    unrelate(from: MatchedNode, to: MatchedNode, type: string): GraphStatement {
        return EdgeStatements.unrelate(from, to, type);
    }

    unrelateAll(from: MatchedNode, type: string, direction: Direction): GraphStatement {
        return EdgeStatements.unrelateAll(from, type, direction);
    }

    storeStamps(): GraphStatement {
        return new GraphStatement(
            `MATCH (s:${STORE_LABEL}) RETURN {id: s.storeId, assignedAt: s.assignedAt} AS stamp ORDER BY stamp.assignedAt, stamp.id`
        );
    }

    assignStoreStamp(): GraphStatement {
        return new GraphStatement(
            `MERGE (s:${STORE_LABEL} {key: $key}) ON CREATE SET s.storeId = $storeId, s.assignedAt = $assignedAt, s.engine = $engine`
        );
    }

    schemaMarker(property: 'version' | 'items'): GraphStatement {
        return new GraphStatement(
            `MATCH (m:${SCHEMA_MARKER} {scope: $scope}) RETURN m.${property} ORDER BY m.appliedAt DESC LIMIT 1`
        );
    }

    markerItems(stored: string | null | undefined): string[] | undefined {
        return stored == null ? undefined : stored === '' ? [] : stored.split('\n');
    }

    recordSchemaMarker(): GraphStatement {
        return new GraphStatement(
            `MERGE (m:${SCHEMA_MARKER} {scope: $scope}) SET m.version = $version, m.items = $items, m.appliedAt = timestamp()`
        );
    }

    pruneSchemaMarkers(): GraphStatement {
        return new GraphStatement(
            `MATCH (m:${SCHEMA_MARKER} {scope: $scope}) WITH m ORDER BY m.appliedAt DESC SKIP 1 DELETE m`
        );
    }

    contended(failure: unknown): boolean {
        // The driver's error is the root cause of the DrivineError the persistence manager throws.
        let cause: any = failure;
        for (let depth = 0; cause && depth < 10; depth++) {
            if (this.grammar.contended(cause)) {
                return true;
            }
            cause = cause.rootCause ?? cause.cause;
        }
        return false;
    }

    /**
     * Whether something drops a hit after the search: a caller's `where`, or a view's requirements. A threshold keeps
     * the best hits, as the index's limit does, so it is not counted.
     */
    private filtersAfterSearch(target: TargetModel, where?: string): boolean {
        return (
            !!where ||
            (target.kind === 'GRAPH_VIEW' &&
                new ViewProjector(this.grammar).requirements(target.model, NODE_ALIAS).length > 0)
        );
    }

    /**
     * The tail of a scored search: filter after the search, project, order by score, trim.
     *
     * With `limitFirst`, a fragment is trimmed before it is projected, so its properties are read only for the rows
     * returned. That limit takes no sort of its own, so the head must yield its rows best first: a sort there would
     * hold each row, and each row of a full-text search carries the hits the head collected.
     */
    private scored(
        target: TargetModel,
        head: string[],
        search: { where?: string; threshold?: boolean; limit?: number; depth?: Record<string, number> },
        limitFirst: boolean = false
    ): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const filters = [
            `${NODE_ALIAS}${labelExpression(root.labels)}`,
            ...(search.threshold ? ['_score >= $_threshold'] : []),
            ...(search.where ? [`(${search.where})`] : []),
            ...(target.kind === 'GRAPH_VIEW'
                ? new ViewProjector(this.grammar, search.depth).requirements(target.model, NODE_ALIAS)
                : [])
        ];
        const projection =
            target.kind === 'GRAPH_VIEW'
                ? new ViewProjector(this.grammar, search.depth).project(target.model, NODE_ALIAS)
                : { calls: [], expression: fragment(NODE_ALIAS) };
        const trimmed = search.limit !== undefined ? [`LIMIT ${search.limit}`] : [];
        const early = limitFirst && target.kind === 'NODE_FRAGMENT';
        return new GraphStatement(
            [
                ...head,
                // A MATCH of the bound node holds the filter: Memgraph takes no existence check in a WITH's WHERE.
                `MATCH (${NODE_ALIAS}) WHERE ${filters.join(' AND ')}`,
                ...(early && trimmed.length ? [`WITH ${NODE_ALIAS}, _score`, ...trimmed] : []),
                ...projection.calls,
                `RETURN {value: ${projection.expression}, score: _score} AS result`,
                'ORDER BY result.score DESC',
                ...(early ? [] : trimmed)
            ].join('\n')
        );
    }

    /** The match of the root a delete by `$id` takes, if it meets `where`, and for a view the view's requirements. */
    private deleted(target: TargetModel, where?: string): string {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const id = this.idPredicate(root);
        return [this.match(root), this.rootWhere(target, where ? `${id} AND (${where})` : id)].join('');
    }

    private rootWhere(target: TargetModel, where?: string): string {
        return target.kind === 'GRAPH_VIEW' ? this.viewWhere(target.model, where) : this.where(where);
    }

    private viewWhere(model: GraphViewModel, where?: string, depth: Record<string, number> = {}): string {
        const requirements = new ViewProjector(this.grammar, depth).requirements(model, NODE_ALIAS);
        if (!requirements.length) {
            return this.where(where);
        }
        // Parentheses only where needed: FalkorDB 6 plans a WHERE worse with ones it doesn't need.
        return this.where([...(where ? [`(${where})`] : []), ...requirements].join(' AND '));
    }

    /** The order, written over the root, and the counts as literals: a JS number goes over Bolt as a float. */
    private page(page: Page): string {
        return [
            page.orderBy ? `\nORDER BY ${page.orderBy}` : '',
            page.skip !== undefined ? `\nSKIP ${page.skip}` : '',
            page.limit !== undefined ? `\nLIMIT ${page.limit}` : ''
        ].join('');
    }

    private match(model: FragmentModel): string {
        return `MATCH (${NODE_ALIAS}${labelExpression(model.labels)})`;
    }

    private where(predicate?: string): string {
        return predicate ? `\nWHERE ${predicate}` : '';
    }

    /**
     * The whole node: TypeScript keeps no list of a class's properties to name them by. Labels are returned apart
     * from the properties, so a property called `labels` can't be mistaken for them.
     */
    private projectFragment(): string {
        return `\nRETURN ${fragment(NODE_ALIAS)} AS result`;
    }

    private idPredicate(model: FragmentModel): string {
        if (!model.nodeIdProperty) {
            throw new DrivineError(`${model.type.name} has no @NodeId property, so it can't be loaded by id.`);
        }
        return `${NODE_ALIAS}.${quoteName(model.nodeIdProperty)} = $id`;
    }
}
