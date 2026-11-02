import { DEFAULT_GRAPH, SqlGraph, sqlText } from '@/backend/sql/SqlGraph';
import { DrivineError } from '@/DrivineError';
import { Stamps } from '@/model/Stamps';
import { WriteReturns } from '@/backend/sql/WritePlan';
import { PostgresWriteStatement, WriteFunction } from '@/backend/postgres/PostgresWriteStatement';

/** SQLite takes a name of any length; this keeps one as long as the other stores' do, as drivine4j does. */
const MAX_OBJECT_NAME = 63;

/** What the store's `ensuring` text opens with, so a SQLite connection knows to run it as the graph's making. */
export const ENSURING_MARK = '/* drivine:ensure */';

/**
 * What a statement whose text values are each JSON opens with, as drivine4j's: SQLite has no JSON type for a column to
 * say so, so a SQLite connection reads each text value of such a statement as the JSON it is (see SqliteConnection).
 */
export const JSON_ROWS = '/* drivine:json */';

/**
 * A graph as SQLite keeps it, drivine4j's layout, so a file written from the JVM, from Node and from Python is one: the
 * tables of a SqlGraph, with `labels`, `props` and a relationship's `props` as JSON text, not SQLite's binary `jsonb`,
 * and the stamp a column of its own.
 *
 * There is no index over the labels: SQLite has none that answers whether a JSON array holds a value. A label is tested
 * on the text of the array (see {@link hasLabels}), which a partial index of the schema grammar answers for the nodes of
 * a label. So labels are written sorted and with no character escaped that JSON does not require: a label is found by
 * its text, quotes and all.
 *
 * Every statement that makes the store is safe to run again, so the store is made by running them all where it is not
 * all there, on a provider's first connection and before a manager's first statement. SQLite reads a table's name
 * without regard to case, so a graph called `Contracts` is the same graph as one called `contracts`, as on Postgres.
 */
export class SqliteGraph extends SqlGraph implements WriteFunction {
    constructor(name: string = DEFAULT_GRAPH) {
        super(name, 'SQLite', MAX_OBJECT_NAME);
    }

    /** What makes the store when it is not there: drivine4j's statements, so each library makes the same file. */
    get ddl(): string[] {
        return [
            [
                `CREATE TABLE IF NOT EXISTS ${this.nodes} (`,
                `    nid    INTEGER PRIMARY KEY,`,
                `    labels TEXT NOT NULL,`,
                `    props  TEXT NOT NULL,`,
                `    stamp  TEXT`,
                `)`
            ].join('\n'),
            [
                `CREATE TABLE IF NOT EXISTS ${this.edges} (`,
                `    eid   INTEGER PRIMARY KEY,`,
                `    src   INTEGER NOT NULL REFERENCES ${this.nodes} (nid) ON DELETE CASCADE,`,
                `    dst   INTEGER NOT NULL REFERENCES ${this.nodes} (nid) ON DELETE CASCADE,`,
                `    type  TEXT NOT NULL,`,
                `    props TEXT NOT NULL DEFAULT '{}'`,
                `)`
            ].join('\n'),
            [
                `CREATE TABLE IF NOT EXISTS ${this.catalog} (`,
                `    kind        TEXT NOT NULL,`,
                `    label       TEXT NOT NULL,`,
                `    properties  TEXT NOT NULL,`,
                `    name        TEXT,`,
                `    object_name TEXT,`,
                `    details     TEXT NOT NULL,`,
                `    PRIMARY KEY (kind, label, properties)`,
                `)`
            ].join('\n'),
            `CREATE INDEX IF NOT EXISTS ${this.name}_edge_src ON ${this.edges} (src, type)`,
            `CREATE INDEX IF NOT EXISTS ${this.name}_edge_dst ON ${this.edges} (dst, type)`
        ];
    }

    /**
     * Counts what of the {@link ddl} makes is there: each table and index, by its name in any case. A user who may only
     * read the file is refused a `CREATE ... IF NOT EXISTS` even over a table that is there, so the store is looked for
     * first.
     */
    get made(): string {
        const names = this.ddl.map((it) => /IF NOT EXISTS (\w+)/.exec(it)![1].toLowerCase());
        return `SELECT COUNT(*) AS "made" FROM sqlite_master WHERE lower(name) IN (${names.map(sqlText).join(', ')})`;
    }

    /**
     * The text that makes the store when it is not there and does nothing when it is: what a SQLite connection runs
     * as {@link ensure} does, since SQLite runs one statement at a time.
     */
    get ensuring(): string {
        return [ENSURING_MARK, ...this.ddl.map((it) => `${it};`)].join('\n');
    }

    /** The call of `drivine_write`, which each connection registers, on this graph: the same plan as on Postgres. */
    writeCall(returns: WriteReturns): string {
        return PostgresWriteStatement.sqliteCall(this.name, returns);
    }
}

/** The statements the ensuring text holds, in order, or undefined for a text that is not a store's making. */
export function ensuringStatements(text: string): string[] | undefined {
    if (!text.startsWith(ENSURING_MARK)) {
        return undefined;
    }
    return text
        .slice(ENSURING_MARK.length)
        .split(/;\n?/)
        .map((it) => it.trim())
        .filter((it) => it.length > 0);
}

/** A string as JSON writes it. */
export function quoted(text: string): string {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The path of the property `key` of a JSON object, as a literal: `'$."name"'`, so a name with a dot in it is one
 * property and not a path into another. Refused when it is empty, which names no property.
 */
export function path(key: string): string {
    if (!key) {
        throw new DrivineError('A property name is empty: an empty name is no property a statement can read.');
    }
    return sqlText(`$.${quoted(key)}`);
}

/** The row's column; the column of the table itself, as an index names it, for an empty alias. */
function column(alias: string, name: string): string {
    return alias ? `${alias}.${name}` : name;
}

/**
 * Whether the JSON array of labels `labels` holds `label`: a test of its text for the label as JSON writes it, quotes
 * and all. Deterministic, so it may be the predicate of a partial index, as `labels @> '["Person"]'` is on Postgres.
 */
export function holdsLabel(labels: string, label: string): string {
    return `instr(${labels}, ${sqlText(quoted(label))}) > 0`;
}

/**
 * A predicate that holds when the node row `alias` carries every one of the labels: a test for each, the predicate of
 * a partial index over the nodes of a label, so one over any of them is seen to hold the nodes asked for.
 */
export function hasLabels(alias: string, labels: string[]): string {
    return labels.map((it) => holdsLabel(column(alias, 'labels'), it)).join(' AND ');
}

/** The JSON of the property of the node or relationship row `alias`, as text: `'"Ada"'` for a string. */
export function jsonValue(alias: string, property: string): string {
    return `(${column(alias, 'props')} -> ${path(property)})`;
}

/** The JSON type of the property of the row `alias`, as SQLite names it (`'text'`, `'integer'`, `'array'`…). */
export function jsonType(alias: string, property: string): string {
    return `json_type(${column(alias, 'props')}, ${path(property)})`;
}

/**
 * The value at `at`, a path literal, of the JSON `props` as text, as Postgres's `->>` reads it: a string as itself,
 * anything else as its JSON (`'7'`, `'1.50'`, `'true'`), and null as SQL's null. SQLite's own `->>` gives a JSON value
 * as the SQL value it is, 7 as an integer and `true` as 1, so it is read so only for a string.
 */
export function propertyText(props: string, at: string): string {
    return `(CASE json_type(${props}, ${at}) WHEN 'text' THEN ${props} ->> ${at} WHEN 'null' THEN NULL ELSE ${props} -> ${at} END)`;
}

/**
 * The property of the row `alias` as text, as Postgres's `->>` reads it (see {@link propertyText}). The stamp is a
 * column of its own. For an empty alias, the table's own column, as an index over the property names it: the text is
 * the expression a range index or a uniqueness constraint is made over.
 */
export function textOf(alias: string, property: string): string {
    return property === Stamps.PROPERTY ? column(alias, 'stamp') : propertyText(column(alias, 'props'), path(property));
}

/**
 * The property of the row `alias` as a number where one is stored, and null for anything else, as the graph engines
 * compare a text with a number as unequal: `'7'` is not `7`.
 */
export function numberOf(alias: string, property: string): string {
    return (
        `(CASE WHEN ${jsonType(alias, property)} IN ('integer', 'real') ` +
        `THEN ${column(alias, 'props')} ->> ${path(property)} END)`
    );
}

/** Whether the row `alias` has the property at all, null or not. */
export function hasProperty(alias: string, property: string): string {
    return property === Stamps.PROPERTY ? `${alias}.stamp IS NOT NULL` : `${jsonType(alias, property)} IS NOT NULL`;
}

/**
 * The map a load returns for the node row `alias`: its properties, its stamp among them, and its labels apart, as JSON
 * text. A node with no stamp has none: `json_object` writes a null, which the merge patch then leaves out.
 */
export function nodeDocument(alias: string): string {
    return (
        `json_object('props', json_patch(${alias}.props, json_object(${sqlText(Stamps.PROPERTY)}, ${alias}.stamp)), ` +
        `'labels', json(${alias}.labels))`
    );
}

/** The labels of a node that carries `label` alone, as a literal of the JSON array they are stored as. */
export function labelArray(label: string): string {
    return sqlText(`[${quoted(label)}]`);
}
