import { Direction } from '@/annotation/Metadata';
import { GraphStatement } from '@/backend/GraphStatement';
import { GroupStatement } from '@/backend/GroupStatement';
import { SqlGraph } from '@/backend/sql/SqlGraph';
import { SqlQueryRenderer } from '@/backend/sql/SqlQueryRenderer';
import { SqlViews } from '@/backend/sql/SqlViews';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { GroupAggregate, GroupKey, GroupQuery } from '@/manager/Groups';

const COMPARISONS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

/**
 * A grouped read on a SQL store, as one statement: each node once with its keys (a property's value as JSON, a path
 * key's far node), grouped, numbered, filtered by `having`, ordered (ties broken by the keys) and paged. Returns a row
 * per group, `{k0, …, a0, …}`, as the graph engines do: a property key as its JSON value, a path key as a fragment row.
 * What is each store's own is how it holds a key's JSON value and reads it back.
 */
export abstract class SqlGroups {
    constructor(protected readonly graph: SqlGraph) {}

    build(source: FragmentModel, given: GroupQuery<any, any>, pathTargets: Map<string, FragmentModel>): GraphStatement {
        const views = this.views();
        const query = GroupStatement.resolved(source, given, this.renderer(views));
        const keys: [string, GroupKey][] = Object.entries(query.keys);
        const aggregates: [string, GroupAggregate][] = Object.entries(query.aggregates ?? {});
        if (!keys.length) {
            throw new DrivineError('A grouped read needs at least one key.');
        }
        const bindings: Record<string, any> = { ...query.bindings };
        const froms = [`FROM ${this.graph.nodes} n`];
        const wheres = [views.hasLabels('n', source.labels), ...(query.where ? [`(${query.where})`] : [])];
        const keyColumns = keys.map(([name, key], i) => {
            if (key.kind === 'property') {
                return `${this.keyColumn(key.property as string)} AS k${i}`;
            }
            if (!key.hops.length) {
                throw new DrivineError(`The path key ${name} needs at least one hop.`);
            }
            let at = 'n';
            key.hops.forEach((hop, h) => {
                const last = h === key.hops.length - 1;
                const labels = [...(hop.label ? [hop.label] : []), ...(last ? pathTargets.get(name)!.labels : [])];
                const step = views.step(hop.type, hop.direction ?? Direction.OUTGOING, at, labels);
                const [fromClause, whereClause] = step.from.split('\nWHERE ');
                froms.push(fromClause.replace(/^FROM /, 'CROSS JOIN '));
                wheres.push(whereClause, step.x);
                at = step.node;
            });
            return `${at}.nid AS k${i}`;
        });
        const value = (aggregate: GroupAggregate): string =>
            aggregate.property ? views.number('n', aggregate.property as string) : '1';
        const filtered = (aggregate: GroupAggregate, of: string): string =>
            aggregate.filter ? `CASE WHEN ${aggregate.filter as string} THEN ${of} END` : of;
        const aggregateColumns = aggregates.map(([, aggregate], i) => {
            switch (aggregate.function) {
                case 'COUNT':
                    return `${
                        aggregate.filter ? `SUM(CASE WHEN ${aggregate.filter as string} THEN 1 ELSE 0 END)` : 'COUNT(*)'
                    } AS a${i}`;
                case 'SUM':
                    return `${views.zeroIfNull(`SUM(${filtered(aggregate, value(aggregate))})`)} AS a${i}`;
                default:
                    return `${aggregate.function}(${filtered(aggregate, value(aggregate))}) AS a${i}`;
            }
        });
        const names = new Map<string, string>();
        keys.forEach(([name], i) => names.set(name, `k${i}`));
        aggregates.forEach(([name], i) => names.set(name, `a${i}`));
        const having = (query.having ?? []).map(([name, comparison, compared]: [string, string, number], i: number) => {
            const column = names.get(name);
            if (!column?.startsWith('a')) {
                throw new DrivineError(`having names ${name}, which is not an aggregate of the read.`);
            }
            bindings[`_having${i}`] = compared;
            const index = Number(column.slice(1));
            const expression = aggregateColumns[index].replace(/ AS a\d+$/, '');
            return `${expression} ${COMPARISONS[comparison as keyof typeof COMPARISONS]} $_having${i}`;
        });
        const keyOf = (i: number): string => {
            const key = keys[i][1];
            if (key.kind === 'property') {
                return this.keyValue(`g.k${i}`);
            }
            const target = pathTargets.get(keys[i][0])!;
            return `(SELECT ${this.idValue(target.nodeIdProperty!)} FROM ${this.graph.nodes} p WHERE p.nid = g.k${i})`;
        };
        const columnOrder = (column: string): string =>
            column.startsWith('k') ? keyOf(Number(column.slice(1))) : `g.${column}`;
        const ordered = (query.orderBy ?? []).map(([name, direction]: [string, string]) => {
            const column = names.get(name);
            if (!column) {
                throw new DrivineError(`orderBy names ${name}, which is not a key or aggregate of the read.`);
            }
            return { column, text: `${columnOrder(column)} ${direction === 'desc' ? 'DESC' : 'ASC'}` };
        });
        const ties = keys
            .map((_, i) => `k${i}`)
            .filter((column) => !ordered.some((it) => it.column === column))
            .map((column) => `${columnOrder(column)} ASC`);
        const projected: [string, string][] = [
            ...keys.map(([, key], i): [string, string] =>
                key.kind === 'property'
                    ? [`k${i}`, this.keyValue(`g.k${i}`)]
                    : [`k${i}`, `(SELECT ${views.nodeDocument('p')} FROM ${this.graph.nodes} p WHERE p.nid = g.k${i})`]
            ),
            ...aggregates.map((_, i): [string, string] => [`a${i}`, `g.a${i}`])
        ];
        const keyNames = keys.map((_, i) => `m.k${i}`);
        const text = [
            `SELECT ${views.object(projected)} AS "row"`,
            `FROM (`,
            `    SELECT ${[...keyNames, ...aggregateColumns].join(', ')}`,
            `    FROM (SELECT DISTINCT n.nid, ${keyColumns.join(', ')} ${froms.join(' ')} WHERE ${wheres.join(
                ' AND '
            )}) m`,
            `    JOIN ${this.graph.nodes} n ON n.nid = m.nid`,
            `    GROUP BY ${keyNames.join(', ')}`,
            ...(having.length ? [`    HAVING ${having.join(' AND ')}`] : []),
            `) g`,
            `ORDER BY ${[...ordered.map((it) => it.text), ...ties].join(', ')}`,
            ...(query.skip ? [`OFFSET ${integer(query.skip, 'skip')} ROWS`] : []),
            ...(query.limit != null ? [`FETCH NEXT ${integer(query.limit, 'limit')} ROWS ONLY`] : [])
        ].join('\n');
        return new GraphStatement(text, bindings);
    }

    /** The store's views, which write the steps of a path key and its JSON. */
    protected abstract views(): SqlViews;

    /** The store's query renderer over the views, which writes a group's filter. */
    protected abstract renderer(views: SqlViews): SqlQueryRenderer;

    /** The property of the node row `n`, as the JSON value a group's key holds. */
    protected abstract keyColumn(property: string): string;

    /** A group's key column `column`, as the JSON value it is ordered and given back as. */
    protected abstract keyValue(column: string): string;

    /** The id property of the node row `p`, as the JSON value a path key is ordered by. */
    protected abstract idValue(property: string): string;
}

function integer(value: number, what: string): number {
    if (!Number.isInteger(value) || value < 0) {
        throw new DrivineError(`${what} must be a whole number of at least 0.`);
    }
    return value;
}
