import { Direction } from '@/annotation/Metadata';
import { GraphStatement } from '@/backend/GraphStatement';
import { GroupStatement } from '@/backend/GroupStatement';
import { hasLabels, jsonKey, nodeDocument, OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleQueryRenderer } from '@/backend/oracle/OracleQueryRenderer';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { GroupAggregate, GroupKey, GroupQuery } from '@/manager/Groups';

const COMPARISONS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

/**
 * A grouped read on Oracle, as one statement: each node once with its keys (a property's value as its JSON text, a
 * path key's far node), grouped, numbered, filtered by `having`, ordered (ties broken by the keys) and paged. Returns a
 * row per group, `{k0, …, a0, …}`, as the graph engines do: a property key as its JSON value, a path key as a fragment
 * row.
 */
export class OracleGroups {
    constructor(private readonly graph: OracleGraph) {}

    build(source: FragmentModel, given: GroupQuery<any, any>, pathTargets: Map<string, FragmentModel>): GraphStatement {
        const views = new OracleViews(this.graph);
        const query = GroupStatement.resolved(source, given, new OracleQueryRenderer(views));
        const keys: [string, GroupKey][] = Object.entries(query.keys);
        const aggregates: [string, GroupAggregate][] = Object.entries(query.aggregates ?? {});
        if (!keys.length) {
            throw new DrivineError('A grouped read needs at least one key.');
        }
        const bindings: Record<string, any> = { ...query.bindings };
        const froms = [`FROM ${this.graph.nodes} n`];
        const wheres = [hasLabels('n', source.labels), ...(query.where ? [`(${query.where})`] : [])];
        const keyColumns = keys.map(([name, key], i) => {
            if (key.kind === 'property') {
                return `JSON_SERIALIZE(JSON_QUERY(n.props, '$${jsonKey(
                    key.property as string
                )}' RETURNING JSON)) AS k${i}`;
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
            aggregate.property
                ? `JSON_VALUE(n.props, '$${jsonKey(aggregate.property as string)}' RETURNING NUMBER)`
                : '1';
        const filtered = (aggregate: GroupAggregate, of: string): string =>
            aggregate.filter ? `CASE WHEN ${aggregate.filter as string} THEN ${of} END` : of;
        const aggregateColumns = aggregates.map(([, aggregate], i) => {
            switch (aggregate.function) {
                case 'COUNT':
                    return `${
                        aggregate.filter ? `SUM(CASE WHEN ${aggregate.filter as string} THEN 1 ELSE 0 END)` : 'COUNT(*)'
                    } AS a${i}`;
                case 'SUM':
                    return `NVL(SUM(${filtered(aggregate, value(aggregate))}), 0) AS a${i}`;
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
                return `JSON(g.k${i})`;
            }
            const target = pathTargets.get(keys[i][0])!;
            return `(SELECT JSON_QUERY(p.props, '$${jsonKey(target.nodeIdProperty!)}' RETURNING JSON) FROM ${
                this.graph.nodes
            } p WHERE p.nid = g.k${i})`;
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
        const projected = [
            ...keys.map(([, key], i) =>
                key.kind === 'property'
                    ? `'k${i}' VALUE JSON(g.k${i})`
                    : `'k${i}' VALUE (SELECT ${nodeDocument('p')} FROM ${this.graph.nodes} p WHERE p.nid = g.k${i})`
            ),
            ...aggregates.map((_, i) => `'a${i}' VALUE g.a${i}`)
        ];
        const keyNames = keys.map((_, i) => `m.k${i}`);
        const text = [
            `SELECT JSON_OBJECT(${projected.join(', ')} RETURNING JSON) AS "row"`,
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
}

function integer(value: number, what: string): number {
    if (!Number.isInteger(value) || value < 0) {
        throw new DrivineError(`${what} must be a whole number of at least 0.`);
    }
    return value;
}
