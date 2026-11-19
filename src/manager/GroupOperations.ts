import { GraphStatement } from '@/backend/GraphStatement';
import { DrivineError } from '@/DrivineError';
import { asDate, declaredDate, GraphObjectMapper, wholeNumbers } from '@/mapper/GraphObjectMapper';
import { FragmentModel, IdentifiedFragment, isIdentified } from '@/model/FragmentModel';
import { ModelRegistry } from '@/model/ModelRegistry';
import { ClassRef, ClassType } from '@/query/QuerySpecification';
import { GroupAggregate, GroupKey, GroupQuery, GroupRow, count, key } from '@/manager/Groups';
import { scopeOf } from '@/dsl/ModelScope';
import { rootRefs } from '@/dsl/QueryRefs';
import { RootRefs, Where } from '@/dsl/Refs';
import { GraphBackend } from '@/backend/GraphBackend';
import { storedName } from '@/backend/GroupStatement';

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
        const targets = this.pathTargets(asked.keys as Record<string, GroupKey>);
        const where =
            asked.where === undefined || typeof asked.where === 'string'
                ? asked.where
                : await this.lookups(model, asked.where);
        const query = this.written({ ...asked, where });
        const rows = await this.query(this.backend.groups(model, query, targets));
        const keyNames = Object.keys(query.keys);
        const aggregateNames = Object.keys(query.aggregates ?? {});
        const dated = this.datedAggregates(model, query.aggregates ?? {});
        return rows.map((row) => {
            const result: any = {};
            keyNames.forEach((name, i) => {
                const target = targets.get(name);
                result[name] = target
                    ? this.mapper.fragment(target, row[`k${i}`])
                    : wholeNumbers(row[`k${i}`] ?? undefined, false);
            });
            aggregateNames.forEach((name, i) => {
                const value = wholeNumbers(row[`a${i}`] ?? undefined, false);
                result[name] = dated.has(name) ? asDate(value) : value;
            });
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

    /**
     * The names of the `min` and `max` aggregates of a property the source declares a `Date`, which are given as a
     * `Date` on every store, as drivine4j gives a grouped value as its handle's type (#785): a SQL store gives the
     * value's text, and a graph engine's driver a `Date`. A property the source declares no type of is given as the
     * store gives it.
     */
    private datedAggregates(model: FragmentModel, aggregates: Record<string, GroupAggregate>): Set<string> {
        const scope = scopeOf(fragmentOf(model));
        const fields = new Map([...model.graphProperties].map(([field, stored]) => [stored, field]));
        return new Set(
            Object.entries(aggregates)
                .filter(([, it]) => (it.function === 'MIN' || it.function === 'MAX') && it.property !== undefined)
                .filter(([, it]) => {
                    const stored = storedName(it.property, scope, 'An aggregate');
                    // A field stored under another name is not the property of its own name.
                    const field = fields.get(stored) ?? (model.graphProperties.has(stored) ? undefined : stored);
                    return field !== undefined && declaredDate(model.type, model, field);
                })
                .map(([name]) => name)
        );
    }

    /**
     * The fragment each path key ends at, by the key's name, checked before anything is written so every store refuses
     * the same keys: a path key's groups are ordered by its node's id, so its fragment must have a `@NodeId`.
     */
    private pathTargets(keys: Record<string, GroupKey>): Map<string, IdentifiedFragment> {
        const targets = new Map<string, IdentifiedFragment>();
        for (const [name, groupKey] of Object.entries(keys)) {
            if (groupKey.kind === 'path') {
                if (!groupKey.hops.length) {
                    throw new DrivineError(`The path key ${name} needs at least one hop.`);
                }
                const target = this.registry.fragment(groupKey.target as ClassType);
                if (!isIdentified(target)) {
                    throw new DrivineError(`${target.type.name} has no @NodeId field, which a path key is ordered by.`);
                }
                targets.set(name, target);
            }
        }
        return targets;
    }

    /** The query with each predicate the caller wrote, its `where` and its aggregates' filters, as the store reads it. */
    private written<Q extends GroupQuery<any, any>>(query: Q): Q {
        const written = <W>(where: string | W | undefined): string | W | undefined =>
            typeof where === 'string' && where ? this.backend.written(where, query.bindings) : where;
        const aggregates = Object.fromEntries(
            Object.entries((query.aggregates ?? {}) as Record<string, GroupAggregate>).map(([name, aggregate]) => [
                name,
                { ...aggregate, filter: written(aggregate.filter) }
            ])
        );
        return { ...query, where: written(query.where), ...(query.aggregates ? { aggregates } : {}) };
    }
}
