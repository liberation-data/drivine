import { GroupStatement } from '@/backend/GroupStatement';
import { GraphStatement } from '@/backend/GraphStatement';
import { DrivineError } from '@/DrivineError';
import { GraphObjectMapper } from '@/mapper/GraphObjectMapper';
import { FragmentModel } from '@/model/FragmentModel';
import { ModelRegistry } from '@/model/ModelRegistry';
import { ClassRef, ClassType } from '@/query/QuerySpecification';
import { GroupAggregate, GroupKey, GroupQuery, GroupRow, count, key } from '@/manager/Groups';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { NODE_ALIAS } from '@/backend/CypherBackend';
import { scopeOf } from '@/dsl/ModelScope';
import { REF_PATH } from '@/dsl/OrderExpressions';
import { rootRefs } from '@/dsl/QueryRefs';
import { QueryRenderer, rootProperty } from '@/dsl/QueryRenderer';
import { allOfOne, RootRefs, Where } from '@/dsl/Refs';

function fragmentOf(model: FragmentModel): { kind: 'NODE_FRAGMENT'; model: FragmentModel } {
    return { kind: 'NODE_FRAGMENT', model };
}

function pathOf(ref: unknown): readonly string[] {
    const path = (ref as any)?.[REF_PATH];
    if (!path) {
        throw new DrivineError('A group key or aggregate takes a property: its stored name, or a reference to it.');
    }
    return path;
}

/**
 * Grouped reads: the nodes of a fragment grouped by keys, with numbers about each group, in one statement, so nothing
 * is loaded to be tallied in the application. A group exists because a node is in it; ties in an order are broken by
 * the keys.
 */
export class GroupOperations {
    constructor(
        private readonly registry: ModelRegistry,
        private readonly query: (statement: GraphStatement) => Promise<any[]>,
        private readonly mapper: GraphObjectMapper,
        private readonly grammar: CypherGrammar
    ) {}

    /**
     * The groups of the source's nodes. Give the query as a function of the source's references for typed keys,
     * aggregates and conditions: `q => ({keys: {page: key(q.page)}, aggregates: {votes: count(q.helpful.eq(true))}})`.
     */
    async load<T, K extends Record<string, GroupKey>, A extends Record<string, GroupAggregate> = Record<string, never>>(
        source: ClassRef<T>,
        spec: GroupQuery<K, A> | ((q: RootRefs<T>) => GroupQuery<K, A>)
    ): Promise<GroupRow<K, A>[]> {
        const model = this.registry.fragment(source as ClassType);
        const query = this.resolved(
            model,
            typeof spec === 'function' ? spec(rootRefs<T>(scopeOf(fragmentOf(model)))) : spec
        );
        const targets = new Map<string, FragmentModel>();
        for (const [name, groupKey] of Object.entries(query.keys as Record<string, GroupKey>)) {
            if (groupKey.kind === 'path') {
                if (!groupKey.hops.length) {
                    throw new DrivineError(`The path key ${name} needs at least one hop.`);
                }
                targets.set(name, this.registry.fragment(groupKey.target as ClassType));
            }
        }
        const rows = await this.query(GroupStatement.build(model, query, targets));
        const keyNames = Object.keys(query.keys);
        const aggregateNames = Object.keys(query.aggregates ?? {});
        return rows.map((row) => {
            const result: any = {};
            keyNames.forEach((name, i) => {
                const target = targets.get(name);
                result[name] = target ? this.mapper.fragment(target, row[`k${i}`]) : row[`k${i}`] ?? undefined;
            });
            aggregateNames.forEach((name, i) => (result[name] = row[`a${i}`] ?? undefined));
            return result;
        });
    }

    /** For each value of a property, how many nodes hold it. Nodes without it are counted under undefined. */
    async countBy(
        source: ClassRef,
        property: string,
        where?: string,
        bindings?: Record<string, any>
    ): Promise<Map<any, number>> {
        const rows = await this.load(source, {
            where,
            bindings,
            keys: { value: key(property) },
            aggregates: { count: count() }
        });
        return new Map(rows.map((it) => [it.value, it.count ?? 0]));
    }

    /** The query with its references as stored names and its conditions as Cypher over `n`, values bound. */
    private resolved(model: FragmentModel, query: GroupQuery<any, any>): GroupQuery<any, any> {
        const scope = scopeOf(fragmentOf(model));
        const renderer = new QueryRenderer(this.grammar);
        const name = (property: unknown, what: string): string =>
            typeof property === 'string' ? property : rootProperty(pathOf(property), scope, what);
        const cypher = (where: string | Where | undefined): string | undefined =>
            where === undefined || typeof where === 'string'
                ? where
                : renderer.where(allOfOne(where), scope, NODE_ALIAS);
        const keys = Object.fromEntries(
            Object.entries(query.keys as Record<string, GroupKey>).map(([it, groupKey]) => [
                it,
                groupKey.kind === 'property'
                    ? { ...groupKey, property: name(groupKey.property, 'A group key') }
                    : groupKey
            ])
        );
        const aggregates = Object.fromEntries(
            Object.entries((query.aggregates ?? {}) as Record<string, GroupAggregate>).map(([it, aggregate]) => [
                it,
                {
                    ...aggregate,
                    property: aggregate.property === undefined ? undefined : name(aggregate.property, 'An aggregate'),
                    filter: cypher(aggregate.filter)
                }
            ])
        );
        const where = cypher(query.where);
        return { ...query, keys, aggregates, where, bindings: { ...query.bindings, ...renderer.boundValues } };
    }
}
