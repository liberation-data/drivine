import { DEFAULT_GRAPH, SqlGraph, sqlText } from '@/backend/sql/SqlGraph';
import { DrivineError } from '@/DrivineError';
import { Stamps } from '@/model/Stamps';

/** Postgres names are at most 63 characters: past that, it cuts them short without a word. */
const MAX_OBJECT_NAME = 63;

/**
 * A graph as Postgres keeps it, drivine4j's store: the tables of a SqlGraph, with `labels` and `props` as `jsonb`. The
 * labels are a JSON array under a GIN index that answers whether a node carries a label (`labels @> '["Person"]'`), so
 * a node carries as many as it likes: a label is data, not a table.
 *
 * Names are written bare, so Postgres folds them to lower case: a graph called `Contracts` keeps its nodes in
 * `contracts_node`, and is the same graph as one called `contracts`.
 */
export class PostgresGraph extends SqlGraph {
    constructor(name: string = DEFAULT_GRAPH) {
        super(name, 'Postgres', MAX_OBJECT_NAME);
    }

    /** What makes the store. Each statement may run again. */
    get ddl(): string[] {
        return [
            `CREATE TABLE IF NOT EXISTS ${this.nodes} (
    nid    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    labels jsonb NOT NULL,
    props  jsonb NOT NULL,
    stamp  varchar(33)
)`,
            `CREATE TABLE IF NOT EXISTS ${this.edges} (
    eid   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    src   bigint NOT NULL REFERENCES ${this.nodes} (nid) ON DELETE CASCADE,
    dst   bigint NOT NULL REFERENCES ${this.nodes} (nid) ON DELETE CASCADE,
    type  varchar(128) NOT NULL,
    props jsonb NOT NULL DEFAULT '{}'
)`,
            `CREATE TABLE IF NOT EXISTS ${this.catalog} (
    kind        varchar(40) NOT NULL,
    label       varchar(400) NOT NULL,
    properties  varchar(2000) NOT NULL,
    name        varchar(400),
    object_name varchar(${MAX_OBJECT_NAME}),
    details     jsonb NOT NULL,
    PRIMARY KEY (kind, label, properties)
)`,
            `CREATE INDEX IF NOT EXISTS ${this.name}_edge_src ON ${this.edges} (src, type)`,
            `CREATE INDEX IF NOT EXISTS ${this.name}_edge_dst ON ${this.edges} (dst, type)`,
            `CREATE INDEX IF NOT EXISTS ${this.name}_node_labels ON ${this.nodes} USING GIN (labels jsonb_path_ops)`
        ];
    }

    /**
     * The block that makes the store when it is not there, and does nothing when it is. It takes a lock of its own for
     * the graph first, so two processes that each find the store missing make it one after the other, and the second
     * makes nothing; Postgres runs a block's schema statements in its transaction, so the store is made whole or not at
     * all. pgvector is made where the server has it and the user may make it: without it, everything but a vector
     * search works.
     */
    get ensuring(): string {
        const statements = this.ddl.map((it) => `        ${it.replace(/\n/g, '\n        ')};`).join('\n');
        return `DO $ensure$
BEGIN
    IF to_regclass(${sqlText(this.nodes)}) IS NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(${sqlText(`drivine:${this.name}`)}));
        BEGIN
            CREATE EXTENSION IF NOT EXISTS vector;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
${statements}
    END IF;
END
$ensure$`;
    }
}

/** A string as JSON writes it. */
function quoted(text: string): string {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The key of a JSON object, as a literal: refused when it is empty, which names no property. A key is written in, not
 * bound, so a statement's text is the same for every value and an index over the property matches it.
 */
export function jsonKey(key: string): string {
    if (!key) {
        throw new DrivineError('A property name is empty: an empty name is no property a statement can read.');
    }
    return sqlText(key);
}

/**
 * A predicate that holds when the node row `alias` carries every one of the labels: a test for each, the form the GIN
 * index over labels answers, and the predicate of a partial index over the nodes of a label, so one over any of them is
 * seen to hold the nodes asked for. A label may come from data, so it is escaped for JSON and for SQL.
 */
export function hasLabels(alias: string, labels: string[]): string {
    return labels.map((it) => `${column(alias, 'labels')} @> ${sqlText(`[${quoted(it)}]`)}`).join(' AND ');
}

/** The JSON value of the property of the node or relationship row `alias`. */
export function jsonValue(alias: string, property: string): string {
    return `(${column(alias, 'props')} -> ${jsonKey(property)})`;
}

/**
 * The property of the row `alias` as text, as `->>` reads it: a stored `""` is `""`, and a number or a boolean its
 * JSON text. The stamp is a column of its own.
 */
export function textOf(alias: string, property: string): string {
    return property === Stamps.PROPERTY
        ? column(alias, 'stamp')
        : `(${column(alias, 'props')} ->> ${jsonKey(property)})`;
}

/**
 * The property of the row `alias` as a number where one is stored, and null for anything else, as the graph engines
 * compare a text with a number as unequal: `'7'` is not `7`.
 */
export function numberOf(alias: string, property: string): string {
    return (
        `CASE WHEN jsonb_typeof(${jsonValue(alias, property)}) = 'number' ` +
        `THEN (${column(alias, 'props')} ->> ${jsonKey(property)})::numeric END`
    );
}

/** Whether the row `alias` has the property at all, null or not. */
export function hasProperty(alias: string, property: string): string {
    return property === Stamps.PROPERTY ? `${alias}.stamp IS NOT NULL` : `${jsonValue(alias, property)} IS NOT NULL`;
}

/** The map a load returns for the node row `alias`: its properties, its stamp among them, and its labels apart. */
export function nodeDocument(alias: string): string {
    return `jsonb_build_object('props', ${alias}.props || jsonb_strip_nulls(jsonb_build_object(${sqlText(
        Stamps.PROPERTY
    )}, ${alias}.stamp)), 'labels', ${alias}.labels)`;
}

/** The row's column; the column of the table itself, as an index names it, for an empty alias. */
function column(alias: string, name: string): string {
    return alias ? `${alias}.${name}` : name;
}
