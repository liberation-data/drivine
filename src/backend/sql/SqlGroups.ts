import { Direction } from '@/annotation/Metadata';
import { GraphStatement } from '@/backend/GraphStatement';
import { GroupStatement } from '@/backend/GroupStatement';
import { SqlGraph } from '@/backend/sql/SqlGraph';
import { ConditionWriter } from '@/backend/GroupStatement';
import { SqlViews } from '@/backend/sql/SqlViews';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { GroupAggregate, GroupKey, GroupQuery } from '@/manager/Groups';

export const COMPARISONS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

/**
 * A least or greatest value a store reads through the node of the group that has it, as drivine4j's SQLite and Postgres
 * do: the statement joins that node back, as the row `holder`, to compare and order the value there. On SQLite the
 * aggregate's column is that node's `nid`, and the value is given there too. Where the store {@link given gives} the
 * value as the aggregate's column itself, as drivine4j's Postgres does, the node's `nid` is a column of its own, with
 * `r` after the aggregate's, and the node is joined only where the groups are ordered or filtered by the value.
 */
export interface HeldAggregate {
    /** The `nid` of the group's first node in the order the aggregate takes, of those that meet `filter`; null for none. */
    column(filter?: string): string;
    /** The value of that node, as the group's column gives it, where the store gives it so. */
    given?(filter?: string): string;
    /** The value, as the JSON the group's row gives. */
    value(holder: string): string;
    /** The condition of a `having` that compares the value by `comparison` (`gte`, …) with `value`, which it binds. */
    having(holder: string, comparison: string, value: number): string;
    /** The terms the groups are ordered by the value by. */
    order(holder: string, direction: 'ASC' | 'DESC'): string[];
}

/**
 * A grouped read on a SQL store, as one statement: each node once with its keys (a property's value as JSON, a path
 * key's far node), grouped, numbered, filtered by `having`, ordered (ties broken by the keys) and paged. Returns a row
 * per group, `{k0, …, a0, …}`, as the graph engines do: a property key as its JSON value, a path key as a fragment row.
 * What is each store's own is how it holds a key's JSON value and reads it back.
 */
export abstract class SqlGroups {
    /** What the statement calls the row of a node of the source. */
    protected readonly row: string = 'n';

    /**
     * The key columns of the rows grouped, `m.k0, …`, which a {@link window} over them is partitioned by: set as the
     * statement is built.
     */
    protected grouping = '';

    /** The windows over the rows grouped, each with its column's name, asked for so far (see {@link window}). */
    private windows: string[] = [];

    constructor(protected readonly graph: SqlGraph) {}

    build(source: FragmentModel, given: GroupQuery<any, any>, pathTargets: Map<string, FragmentModel>): GraphStatement {
        this.windows = [];
        const views = this.views();
        const query = GroupStatement.resolved(source, given, this.renderer(views));
        const keys: [string, GroupKey][] = Object.entries(query.keys);
        const aggregates: [string, GroupAggregate][] = Object.entries(query.aggregates ?? {});
        if (!keys.length) {
            throw new DrivineError('A grouped read needs at least one key.');
        }
        const bindings: Record<string, any> = { ...query.bindings };
        const n = this.row;
        const froms = [`FROM ${this.graph.nodes} ${n}`];
        const wheres = [views.hasLabels(n, source.labels), ...(query.where ? [`(${query.where})`] : [])];
        const keyColumns = keys.map(([name, key], i) => {
            if (key.kind === 'property') {
                return `${this.keyColumn(key.property as string)} AS k${i}`;
            }
            if (!key.hops.length) {
                throw new DrivineError(`The path key ${name} needs at least one hop.`);
            }
            let at = n;
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
        const keyNames = keys.map((_, i) => `m.k${i}`);
        this.grouping = keyNames.join(', ');
        const value = (aggregate: GroupAggregate): string =>
            aggregate.property ? this.aggregated(views, aggregate.property as string) : '1';
        const held = aggregates.map(([, aggregate]) => this.held(aggregate));
        /** Whether the groups are ordered or filtered by the aggregate: a given value is then joined back by its node. */
        const compared = aggregates.map(([name]) =>
            [...(query.orderBy ?? []), ...(query.having ?? [])].some((it) => it[0] === name)
        );
        /** Whether the aggregate's value is read through its node, joined back as its holder. */
        const holds = (i: number): boolean => held[i] !== undefined && (!held[i]!.given || compared[i]);
        const heldKeys = keys.map(([name, key]) =>
            key.kind === 'property' ? this.heldKey(key.property as string) : this.heldPath(pathTargets.get(name)!)
        );
        /** The column of the node a held key is ordered through: a property key's representative, a path key's own. */
        const heldBy = (i: number): string => (keys[i][1].kind === 'property' ? `g.k${i}r` : `g.k${i}`);
        const filtered = (aggregate: GroupAggregate, of: string): string =>
            aggregate.filter ? `CASE WHEN ${aggregate.filter as string} THEN ${of} END` : of;
        const aggregateColumns = aggregates.map(([, aggregate], i) => {
            const heldAggregate = held[i];
            if (heldAggregate?.given) {
                const filter = aggregate.filter as string | undefined;
                return [
                    `${heldAggregate.given(filter)} AS a${i}`,
                    ...(compared[i] ? [`${heldAggregate.column(filter)} AS a${i}r`] : [])
                ].join(', ');
            }
            if (heldAggregate) {
                return `${heldAggregate.column(aggregate.filter as string | undefined)} AS a${i}`;
            }
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
        const holder = (index: number): string => `a${index}_`;
        const keyHolder = (index: number): string => `k${index}_`;
        const heldHaving: string[] = [];
        const having = (query.having ?? []).flatMap(
            ([name, comparison, compared]: [string, string, number], i: number) => {
                const column = names.get(name);
                if (!column?.startsWith('a')) {
                    throw new DrivineError(`having names ${name}, which is not an aggregate of the read.`);
                }
                const index = Number(column.slice(1));
                if (held[index]) {
                    heldHaving.push(held[index]!.having(holder(index), comparison, compared));
                    return [];
                }
                bindings[`_having${i}`] = compared;
                const expression = aggregateColumns[index].replace(/ AS a\d+$/, '');
                return [
                    `${expression} ${COMPARISONS[comparison as keyof typeof COMPARISONS]} ${this.havingValue(
                        `$_having${i}`
                    )}`
                ];
            }
        );
        const keyOf = (i: number): string[] => {
            const key = keys[i][1];
            if (key.kind === 'property') {
                return this.keyOrder(`g.k${i}`);
            }
            const target = pathTargets.get(keys[i][0])!;
            return [
                `(SELECT ${this.idValue(target.nodeIdProperty!)} FROM ${this.graph.nodes} p WHERE p.nid = g.k${i})`
            ];
        };
        const columnOrder = (column: string, direction: 'ASC' | 'DESC'): string => {
            const index = Number(column.slice(1));
            if (column.startsWith('a') && held[index]) {
                return held[index]!.order(holder(index), direction).join(', ');
            }
            if (column.startsWith('k') && heldKeys[index]) {
                return heldKeys[index]!(keyHolder(index), direction).join(', ');
            }
            return (column.startsWith('k') ? keyOf(index) : [`g.${column}`])
                .map((it) => this.orderTerm(it, direction))
                .join(', ');
        };
        const ordered = (query.orderBy ?? []).map(([name, direction]: [string, string]) => {
            const column = names.get(name);
            if (!column) {
                throw new DrivineError(`orderBy names ${name}, which is not a key or aggregate of the read.`);
            }
            return { column, text: columnOrder(column, direction === 'desc' ? 'DESC' : 'ASC') };
        });
        const ties = keys
            .map((_, i) => `k${i}`)
            .filter((column) => !ordered.some((it) => it.column === column))
            .map((column) => columnOrder(column, 'ASC'));
        const projected: [string, string][] = [
            ...keys.map(([, key], i): [string, string] =>
                key.kind === 'property'
                    ? [`k${i}`, this.keyValue(`g.k${i}`)]
                    : [`k${i}`, `(SELECT ${views.nodeDocument('p')} FROM ${this.graph.nodes} p WHERE p.nid = g.k${i})`]
            ),
            ...aggregates.map((_, i): [string, string] => [
                `a${i}`,
                held[i] && !held[i]!.given ? held[i]!.value(holder(i)) : `g.a${i}`
            ])
        ];
        const holders = [
            ...heldKeys.flatMap((it, i) =>
                it
                    ? [
                          `LEFT JOIN ${this.graph.nodes} ${keyHolder(i)} ON ${this.sameNode(
                              `${keyHolder(i)}.nid`,
                              heldBy(i)
                          )}`
                      ]
                    : []
            ),
            ...held.flatMap((it, i) =>
                holds(i)
                    ? [
                          `LEFT JOIN ${this.graph.nodes} ${holder(i)} ON ${this.sameNode(
                              `${holder(i)}.nid`,
                              `g.a${i}${it!.given ? 'r' : ''}`
                          )}`
                      ]
                    : []
            )
        ];
        const representatives = heldKeys.flatMap((it, i) =>
            it && keys[i][1].kind === 'property' ? [`MIN(${n}.nid) AS k${i}r`] : []
        );
        const pairs = `(SELECT DISTINCT ${n}.nid, ${keyColumns.join(', ')} ${froms.join(' ')} WHERE ${wheres.join(
            ' AND '
        )}) m`;
        const joined = `JOIN ${this.graph.nodes} ${n} ON ${this.sameNode(`${n}.nid`, 'm.nid')}`;
        // With windows, the rows grouped are each node's row with its keys and its windows' columns, under its own name.
        const grouped = this.windows.length ? keys.map((_, i) => `${n}.k${i}`) : keyNames;
        const rows = this.windows.length
            ? [
                  `    FROM (`,
                  `        SELECT ${[...keyNames, `${n}.*`, ...this.windows].join(', ')}`,
                  `        FROM ${pairs}`,
                  `        ${joined}`,
                  `    ) ${n}`
              ]
            : [`    FROM ${pairs}`, `    ${joined}`];
        const text = [
            `SELECT ${views.object(projected)} AS "row"`,
            `FROM (`,
            `    SELECT ${[...grouped, ...aggregateColumns, ...representatives].join(', ')}`,
            ...rows,
            `    GROUP BY ${grouped.join(', ')}`,
            ...(having.length ? [`    HAVING ${having.join(' AND ')}`] : []),
            `) g`,
            ...holders,
            ...(heldHaving.length ? [`WHERE ${heldHaving.join(' AND ')}`] : []),
            `ORDER BY ${[...ordered.map((it) => it.text), ...ties].join(', ')}`,
            ...this.paging(
                query.skip ? integer(query.skip, 'skip') : undefined,
                query.limit != null ? integer(query.limit, 'limit') : undefined
            )
        ].join('\n');
        return new GraphStatement(text, bindings);
    }

    /**
     * The property of the source's row read as the number a sum or a mean adds, and by default a least or greatest value:
     * null where it holds anything else.
     */
    protected aggregated(views: SqlViews, property: string): string {
        return views.number(this.row, property);
    }

    /**
     * The column of a window over the rows grouped, `expression` (`FIRST_VALUE(…) OVER (PARTITION BY …)`, partitioned
     * by {@link grouping}), which the statement then computes over each node's row before it groups them, and an
     * aggregate reads, on the row of the node, `n_`: for a store that takes a group's first node by a window, as
     * drivine4j's Oracle does.
     */
    protected window(expression: string): string {
        const column = `w${this.windows.length}`;
        this.windows.push(`${expression} AS ${column}`);
        return `${this.row}.${column}`;
    }

    /** Whether the nodes `a` and `b`, each a node's `nid`, are one: a node is joined back to its row so. */
    protected sameNode(a: string, b: string): string {
        return `${a} = ${b}`;
    }

    /** How a least or greatest value is read through the node that has it, where the store does so; undefined otherwise. */
    protected held(_aggregate: GroupAggregate): HeldAggregate | undefined {
        return undefined;
    }

    /**
     * How a property key is ordered through a node of the group that has its value, as drivine4j's SQLite orders one:
     * the statement gives the group's least `nid` as the key's column with `r` after it, joins that node back as the
     * row `holder`, and orders by the terms this gives for `property` there. Undefined where the store orders the
     * key's column itself ({@link keyOrder}).
     */
    protected heldKey(_property: string): ((holder: string, direction: 'ASC' | 'DESC') => string[]) | undefined {
        return undefined;
    }

    /**
     * How a path key is ordered through its node, `target`, joined back by the key's column as the row `holder`, as
     * drivine4j's SQLite orders one: by the terms this gives for the node's id there. Undefined where the store orders
     * the key by its node's id value ({@link idValue}).
     */
    protected heldPath(_target: FragmentModel): ((holder: string, direction: 'ASC' | 'DESC') => string[]) | undefined {
        return undefined;
    }

    /** What a property key's column is ordered by, in turn: its value, unless the store says otherwise. */
    protected keyOrder(column: string): string[] {
        return [this.keyValue(column)];
    }

    /** One term of the groups' order. A null is greatest, as Postgres and Oracle place it: last ascending. */
    protected orderTerm(expression: string, direction: 'ASC' | 'DESC'): string {
        return `${expression} ${direction}`;
    }

    /** The clauses that skip `skip` groups and read `limit` after them, where either is given. */
    protected paging(skip?: number, limit?: number): string[] {
        return [
            ...(skip !== undefined ? [`OFFSET ${skip} ROWS`] : []),
            ...(limit !== undefined ? [`FETCH NEXT ${limit} ROWS ONLY`] : [])
        ];
    }

    /** The bound value `having` compares an aggregate with, as the store reads a number bound without a type. */
    protected havingValue(parameter: string): string {
        return parameter;
    }

    /** The store's views, which write the steps of a path key and its JSON. */
    protected abstract views(): SqlViews;

    /** The store's writer of a group's filter, over the source's row, which binds its values. */
    protected abstract renderer(views: SqlViews): ConditionWriter;

    /** The property of the source's row, as the JSON value a group's key holds. */
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
