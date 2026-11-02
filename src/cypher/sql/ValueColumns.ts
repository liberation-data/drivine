import { Value } from '@/cypher/sql/Value';

/** Stands for the name of the query a `WITH` is read from, before it is named. */
export const PENDING = '__with__';

/**
 * The select-list entries that carry `value` out of a query, under `name`: a JSON value's identity, where it has one, as
 * a column of its own, `<name>_identity`.
 */
export function columns(value: Value, name: string): string[] {
    switch (value.kind) {
        case 'Json':
            return [`${value.sql} AS ${name}`, ...(value.identity ? [`${value.identity} AS ${name}_identity`] : [])];
        case 'Bool':
            return [`${value.sql} AS ${name}`];
        case 'Entities':
            return [`${value.ids} AS ${name}`];
        case 'Node':
            return [
                `${value.nid} AS ${name}_nid`,
                `${value.labels} AS ${name}_labels`,
                `${value.props} AS ${name}_props`,
                `${value.stamp} AS ${name}_stamp`
            ];
        case 'Relationship':
            return [
                `${value.eid} AS ${name}_eid`,
                `${value.src} AS ${name}_src`,
                `${value.dst} AS ${name}_dst`,
                `${value.type} AS ${name}_type`,
                `${value.props} AS ${name}_props`
            ];
        default:
            return [`${value.nids} AS ${name}_nids`, `${value.eids} AS ${name}_eids`];
    }
}

/**
 * `value`, read from the columns {@link columns} gave it under `name` in the query named `alias`. Without a `name`, a
 * value whose columns were named for a query not yet named ({@link PENDING}) is read from `alias`.
 */
export function columnsOf(value: Value, alias: string, name?: string): Value {
    if (name === undefined) {
        return withAlias(value, alias);
    }
    const at = `${alias}.${name}`;
    switch (value.kind) {
        case 'Json':
            return { ...value, sql: at, identity: value.identity && `${at}_identity` };
        case 'Bool':
            return { ...value, sql: at };
        case 'Entities':
            return { kind: 'Entities', ids: at, relationships: value.relationships, flat: value.flat };
        case 'Node':
            return {
                kind: 'Node',
                nid: `${at}_nid`,
                labels: `${at}_labels`,
                props: `${at}_props`,
                stamp: `${at}_stamp`
            };
        case 'Relationship':
            return {
                kind: 'Relationship',
                eid: `${at}_eid`,
                src: `${at}_src`,
                dst: `${at}_dst`,
                type: `${at}_type`,
                props: `${at}_props`
            };
        default:
            return { kind: 'Path', nids: `${at}_nids`, eids: `${at}_eids` };
    }
}

/** `value` with {@link PENDING} read as `alias`. */
function withAlias(value: Value, alias: string): Value {
    return mapSql(value, (sql) => sql.split(PENDING).join(alias));
}

/** A column of the query {@link PENDING} stands for. */
const PENDING_COLUMN = new RegExp(`${PENDING}\\.(\\w+)`, 'g');

/**
 * `value`, whose columns are named for a query not yet named ({@link PENDING}), read from the rows named `name` that a
 * lateral join gives, of the columns `kinds`, each read by `column` (see `SqlCypherCompiler.lateralColumn`).
 */
export function laterally(
    value: Value,
    name: string,
    kinds: [string, boolean][],
    column: (name: string, column: string, json: boolean) => string
): Value {
    const json = new Map(kinds);
    return mapSql(value, (sql) =>
        sql.replace(PENDING_COLUMN, (_, c: string) => {
            if (!json.has(c)) {
                throw new Error(`${c} is no column of the lateral query ${name}.`);
            }
            return column(name, c, json.get(c)!);
        })
    );
}

/** The columns {@link columns} gives `value` under `name`, each named and whether it holds JSON, in the same order. */
export function columnKinds(value: Value, name: string): [string, boolean][] {
    switch (value.kind) {
        case 'Json':
            return [[name, true], ...(value.identity ? [[`${name}_identity`, true] as [string, boolean]] : [])];
        case 'Bool':
            return [[name, false]];
        case 'Entities':
            return [[name, true]];
        case 'Node':
            return [
                [`${name}_nid`, false],
                [`${name}_labels`, true],
                [`${name}_props`, true],
                [`${name}_stamp`, false]
            ];
        case 'Relationship':
            return [
                [`${name}_eid`, false],
                [`${name}_src`, false],
                [`${name}_dst`, false],
                [`${name}_type`, false],
                [`${name}_props`, true]
            ];
        default:
            return [
                [`${name}_nids`, false],
                [`${name}_eids`, false]
            ];
    }
}

/** `value` with each piece of its SQL transformed by `named`. */
function mapSql(value: Value, named: (sql: string) => string): Value {
    switch (value.kind) {
        case 'Json':
            return { ...value, sql: named(value.sql), identity: value.identity && named(value.identity) };
        case 'Bool':
            return { ...value, sql: named(value.sql) };
        case 'Entities':
            return { ...value, ids: named(value.ids), gathered: value.gathered && named(value.gathered) };
        case 'Node':
            return {
                kind: 'Node',
                nid: named(value.nid),
                labels: named(value.labels),
                props: named(value.props),
                stamp: named(value.stamp)
            };
        case 'Relationship':
            return {
                kind: 'Relationship',
                eid: named(value.eid),
                src: named(value.src),
                dst: named(value.dst),
                type: named(value.type),
                props: named(value.props)
            };
        default:
            return { kind: 'Path', nids: named(value.nids), eids: named(value.eids) };
    }
}

/** What a projection that aggregates is grouped by, to keep `value`: a node by its columns, a JSON value by its identity too. */
export function groupKeys(value: Value): string[] {
    switch (value.kind) {
        case 'Json':
            return [value.sql, ...(value.identity ? [value.identity] : [])];
        case 'Bool':
            return [value.sql];
        case 'Entities':
            return [value.ids];
        case 'Node':
            return [value.nid, value.labels, value.props, value.stamp];
        case 'Relationship':
            return [value.eid, value.src, value.dst, value.type, value.props];
        default:
            return [value.nids, value.eids];
    }
}
