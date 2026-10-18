import { Direction } from '@/annotation/Metadata';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { GraphStatement } from '@/backend/GraphStatement';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { GroupAggregate, GroupKey, GroupQuery } from '@/manager/Groups';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { NODE_ALIAS } from '@/backend/CypherBackend';
import { scopeOf } from '@/dsl/ModelScope';
import { REF_PATH } from '@/dsl/OrderExpressions';
import { QueryRenderer, rootProperty } from '@/dsl/QueryRenderer';
import { allOfOne, Where } from '@/dsl/Refs';

const COMPARISONS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

/**
 * One statement that groups the nodes of a fragment by keys and gives numbers about each group. A node is one member of
 * each group it reaches, however many ways lead there. Returns a row per group, `{k0, k1, ..., a0, a1, ...}`, a path
 * key as a fragment row. References and conditions in the query have been written as Cypher already (GroupOperations).
 */
export class GroupStatement {
    /** The query with its references as stored names and its conditions as Cypher over `n`, values bound. */
    static resolved(model: FragmentModel, query: GroupQuery<any, any>, grammar: CypherGrammar): GroupQuery<any, any> {
        const scope = scopeOf({ kind: 'NODE_FRAGMENT', model });
        const renderer = new QueryRenderer(grammar);
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

    static build(
        source: FragmentModel,
        query: GroupQuery<any, any>,
        pathTargets: Map<string, FragmentModel>
    ): GraphStatement {
        const keys: [string, GroupKey][] = Object.entries(query.keys);
        const aggregates: [string, GroupAggregate][] = Object.entries(query.aggregates ?? {});
        if (!keys.length) {
            throw new DrivineError('A grouped read needs at least one key.');
        }
        const names = new Map<string, string>();
        keys.forEach(([name], i) => names.set(name, `k${i}`));
        aggregates.forEach(([name], i) => names.set(name, `a${i}`));
        const bindings: Record<string, any> = { ...query.bindings };
        const parts = [`MATCH (n${labelExpression(source.labels)})`];
        const pathAliases: string[] = [];
        keys.forEach(([name, key], i) => {
            if (key.kind === 'path') {
                parts.push(`MATCH ${pathPattern(key, `k${i}`, pathTargets.get(name)!)}`);
                pathAliases.push(`k${i}`);
            }
        });
        if (query.where) {
            parts.push(`WHERE ${query.where}`);
        }
        if (pathAliases.length) {
            parts.push(`WITH DISTINCT n, ${pathAliases.join(', ')}`);
        }
        const keyColumns = keys.map(([, key], i) =>
            key.kind === 'path' ? `k${i}` : `${property(key.property as string)} AS k${i}`
        );
        const aggregateColumns = aggregates.map(
            ([, aggregate], i) => `${aggregateOf(aggregate as GroupAggregate)} AS a${i}`
        );
        parts.push(`WITH ${[...keyColumns, ...aggregateColumns].join(', ')}`);
        const having = (query.having ?? []).map(([name, comparison, value], i) => {
            const column = names.get(name);
            if (!column?.startsWith('a')) {
                throw new DrivineError(`having names ${name}, which is not an aggregate of the read.`);
            }
            bindings[`_having${i}`] = value;
            return `${column} ${COMPARISONS[comparison]} $_having${i}`;
        });
        if (having.length) {
            parts.push(`WHERE ${having.join(' AND ')}`);
        }
        const projected = [
            ...keys.map(([, key], i) =>
                key.kind === 'path' ? `k${i}: {props: properties(k${i}), labels: labels(k${i})}` : `k${i}: k${i}`
            ),
            ...aggregates.map((_, i) => `a${i}: a${i}`)
        ];
        parts.push(`RETURN {${projected.join(', ')}} AS row`);
        const orderOf = (column: string): string => {
            const index = Number(column.slice(1));
            const key = column.startsWith('k') ? keys[index][1] : undefined;
            return key?.kind === 'path'
                ? `${column}.${quoteName(pathTargets.get(keys[index][0])!.nodeIdProperty!)}`
                : column;
        };
        const ordered = (query.orderBy ?? []).map(([name, direction]: [string, string]) => {
            const column = names.get(name);
            if (!column) {
                throw new DrivineError(`orderBy names ${name}, which is not a key or aggregate of the read.`);
            }
            return { column, text: `${orderOf(column)} ${direction === 'desc' ? 'DESC' : 'ASC'}` };
        });
        // Ties are broken by the keys the order left out, so a page of groups is the same on every engine.
        const ties = keys
            .map((_, i) => `k${i}`)
            .filter((column) => !ordered.some((it) => it.column === column))
            .map((column) => `${orderOf(column)} ASC`);
        parts.push(`ORDER BY ${[...ordered.map((it) => it.text), ...ties].join(', ')}`);
        if (query.skip) {
            parts.push(`SKIP ${integer(query.skip, 'skip')}`);
        }
        if (query.limit != null) {
            parts.push(`LIMIT ${integer(query.limit, 'limit')}`);
        }
        return new GraphStatement(parts.join('\n'), bindings);
    }
}

function property(name: string): string {
    return `n.${quoteName(name)}`;
}

function aggregateOf(aggregate: GroupAggregate): string {
    const value = aggregate.property ? property(aggregate.property as string) : '1';
    const filtered = aggregate.filter ? `CASE WHEN ${aggregate.filter} THEN ${value} END` : value;
    switch (aggregate.function) {
        case 'COUNT':
            return aggregate.filter ? `sum(CASE WHEN ${aggregate.filter} THEN 1 ELSE 0 END)` : 'count(n)';
        case 'SUM':
            return `coalesce(sum(${filtered}), 0)`;
        default:
            return `${aggregate.function.toLowerCase()}(${filtered})`;
    }
}

function pathPattern(key: Extract<GroupKey, { kind: 'path' }>, alias: string, target: FragmentModel): string {
    const steps = key.hops.map((hop, i) => {
        const last = i === key.hops.length - 1;
        const edge = `[:${quoteName(hop.type)}]`;
        const arrow =
            hop.direction === Direction.INCOMING
                ? `<-${edge}-`
                : hop.direction === Direction.UNDIRECTED
                ? `-${edge}-`
                : `-${edge}->`;
        const own = hop.label ? [hop.label] : [];
        return `${arrow}(${last ? alias : ''}${labelExpression(last ? [...own, ...target.labels] : own)})`;
    });
    return `(n)${steps.join('')}`;
}

function integer(value: number, what: string): number {
    if (!Number.isInteger(value) || value < 0) {
        throw new DrivineError(`${what} must be a whole number of at least 0.`);
    }
    return value;
}

function pathOf(ref: unknown): readonly string[] {
    const path = (ref as any)?.[REF_PATH];
    if (!path) {
        throw new DrivineError('A group key or aggregate takes a property: its stored name, or a reference to it.');
    }
    return path;
}
