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
            return { kind: 'Entities', ids: at, relationships: value.relationships };
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
    const named = (sql: string): string => sql.split(PENDING).join(alias);
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
