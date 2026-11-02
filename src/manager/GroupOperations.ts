import { GraphStatement } from '@/backend/GraphStatement';
import { DrivineError } from '@/DrivineError';
import { GraphObjectMapper } from '@/mapper/GraphObjectMapper';
import { FragmentModel } from '@/model/FragmentModel';
import { ModelRegistry } from '@/model/ModelRegistry';
import { ClassRef, ClassType } from '@/query/QuerySpecification';
import { GroupAggregate, GroupKey, GroupQuery, GroupRow, count, key } from '@/manager/Groups';
import { scopeOf } from '@/dsl/ModelScope';
import { rootRefs } from '@/dsl/QueryRefs';
import { RootRefs, Where } from '@/dsl/Refs';
import { GraphBackend } from '@/backend/GraphBackend';

function fragmentOf(model: FragmentModel): { kind: 'NODE_FRAGMENT'; model: FragmentModel } {
    return { kind: 'NODE_FRAGMENT', model };
}

/**
 * Grouped reads: the nodes of a fragment grouped by keys, with numbers about each group, in one statement, so nothing
 * is loaded to be tallied in the application. A group exists because a node is in it; ties in an order are broken by
 * the keys.
 */
export class GroupOperations {
    /**
     * @param lookups the condition with its case-insensitive comparisons of the source's `@CaseInsensitive` properties
     * made comparisons with their lowercased copies, where every node is known to have them: see LowerCopyLookups.
     */
    constructor(
        private readonly registry: ModelRegistry,
        private readonly query: (statement: GraphStatement) => Promise<any[]>,
        private readonly mapper: GraphObjectMapper,
        private readonly backend: GraphBackend,
        private readonly lookups: (model: FragmentModel, where: Where) => Promise<Where> = async (_, where) =>
            Promise.resolve(where)
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
        const asked = typeof spec === 'function' ? spec(rootRefs<T>(scopeOf(fragmentOf(model)))) : spec;
        const where =
            asked.where === undefined || typeof asked.where === 'string'
                ? asked.where
                : await this.lookups(model, asked.where);
        const query = this.written({ ...asked, where });
        const targets = new Map<string, FragmentModel>();
        for (const [name, groupKey] of Object.entries(query.keys as Record<string, GroupKey>)) {
            if (groupKey.kind === 'path') {
                if (!groupKey.hops.length) {
                    throw new DrivineError(`The path key ${name} needs at least one hop.`);
                }
                targets.set(name, this.registry.fragment(groupKey.target as ClassType));
            }
        }
        const rows = await this.query(this.backend.groups(model, query, targets));
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

    /** The query with each predicate the caller wrote, its `where` and its aggregates' filters, as the store reads it. */
    private written<Q extends GroupQuery<any, any>>(query: Q): Q {
        const written = <W>(where: string | W | undefined): string | W | undefined =>
            typeof where === 'string' && where ? this.backend.written(where) : where;
        const aggregates = Object.fromEntries(
            Object.entries((query.aggregates ?? {}) as Record<string, GroupAggregate>).map(([name, aggregate]) => [
                name,
                { ...aggregate, filter: written(aggregate.filter) }
            ])
        );
        return { ...query, where: written(query.where), ...(query.aggregates ? { aggregates } : {}) };
    }
}
