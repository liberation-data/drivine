import { DEFAULT_GRAPH, SqlGraph, sqlText } from '@/backend/sql/SqlGraph';
import { Stamps } from '@/model/Stamps';
import {
    Executes,
    nullsEqualFunction,
    nullsEqualName,
    OracleStoredFunctions
} from '@/backend/oracle/OracleStoredFunctions';

export { DEFAULT_GRAPH, sqlText };

/**
 * A graph as Oracle keeps it: the tables of a SqlGraph, and the SQL property graph over the two, which view reads go
 * through.
 */
export class OracleGraph extends SqlGraph {
    /** How long a statement of `ensuring` waits on a lock another session making the store holds. */
    static readonly DDL_WAIT_SECONDS = 60;

    constructor(name: string = DEFAULT_GRAPH) {
        super(name, 'Oracle', 128);
    }

    /** What makes the store. Each statement may run again. */
    get ddl(): string[] {
        return [
            `CREATE TABLE IF NOT EXISTS ${this.nodes} (
                nid    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                labels JSON NOT NULL,
                props  JSON NOT NULL,
                stamp  VARCHAR2(33)
            )`,
            `CREATE TABLE IF NOT EXISTS ${this.edges} (
                eid   NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                src   NUMBER NOT NULL REFERENCES ${this.nodes} (nid) ON DELETE CASCADE,
                dst   NUMBER NOT NULL REFERENCES ${this.nodes} (nid) ON DELETE CASCADE,
                type  VARCHAR2(128) NOT NULL,
                props JSON DEFAULT '{}' NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS ${this.catalog} (
                kind        VARCHAR2(40) NOT NULL,
                label       VARCHAR2(400) NOT NULL,
                properties  VARCHAR2(2000) NOT NULL,
                name        VARCHAR2(400),
                object_name VARCHAR2(128),
                details     JSON NOT NULL,
                PRIMARY KEY (kind, label, properties)
            )`,
            `CREATE INDEX IF NOT EXISTS ${this.name}_edge_src ON ${this.edges} (src, type)`,
            `CREATE INDEX IF NOT EXISTS ${this.name}_edge_dst ON ${this.edges} (dst, type)`,
            `CREATE MULTIVALUE INDEX IF NOT EXISTS ${this.name}_node_labels ON ${this.nodes} n (n.labels.string())`,
            `CREATE OR REPLACE PROPERTY GRAPH ${this.name}
                VERTEX TABLES (${this.nodes} KEY (nid) LABEL node PROPERTIES (nid, labels, props, stamp))
                EDGE TABLES (${this.edges} KEY (eid)
                    SOURCE KEY (src) REFERENCES ${this.nodes} (nid)
                    DESTINATION KEY (dst) REFERENCES ${this.nodes} (nid)
                    LABEL edge PROPERTIES (eid, src, dst, type, props))`
        ];
    }

    /**
     * The function a compiled Cypher statement compares two values that may hold a null by, list item by list item and
     * map key by map key (see `OracleCypherCompiler.nullsEqual`): a statement that writes is a PL/SQL block, whose
     * queries call no function of its own, so the store keeps it. drivine4j and drivine-python make it byte for byte
     * alike.
     */
    get nullsEqual(): string {
        return nullsEqualName(this.name);
    }

    /** What makes {@link nullsEqual}: safe to run again. */
    get functions(): string[] {
        return [`CREATE OR REPLACE ${nullsEqualFunction(this.nullsEqual)}`];
    }

    /**
     * The block that makes the store when it is not there and does nothing when it is: the property graph is made
     * last, so its presence says the rest is. One another process made meanwhile (ORA-00955) is taken as made.
     *
     * The {@link functions} are made after the tables, where they are not there or not valid, so a store an earlier
     * version made gains them. A user who may not make a function (ORA-01031: making one takes `CREATE PROCEDURE`, which
     * the `RESOURCE` role grants) still has the store made: a statement then compares as it would without them (see
     * {@link OracleStoredFunctions}).
     *
     * Two sessions that each find the store missing, as two pools or processes first connecting at once do, make it
     * together: a statement of one waits on the lock the other's holds, rather than being turned away at once
     * (ORA-00054), for up to {@link OracleGraph.DDL_WAIT_SECONDS}, and then finds what the other made. The wait is the
     * session's DDL_LOCK_TIMEOUT, set back to Oracle's default, no wait, when the block ends, failed or not, so the
     * session's later statements are as they were.
     */
    get ensuring(): string {
        const waits = `    EXECUTE IMMEDIATE 'ALTER SESSION SET DDL_LOCK_TIMEOUT = ${OracleGraph.DDL_WAIT_SECONDS}';`;
        const resets = "    EXECUTE IMMEDIATE 'ALTER SESSION SET DDL_LOCK_TIMEOUT = 0';";
        const statements = this.ddl
            .map((it) => `    BEGIN EXECUTE IMMEDIATE ${sqlText(it)}; EXCEPTION WHEN e_exists THEN NULL; END;`)
            .join('\n');
        const functions = this.functions
            .map((it) => `    BEGIN EXECUTE IMMEDIATE ${sqlText(it)}; EXCEPTION WHEN e_denied THEN NULL; END;`)
            .join('\n');
        return `DECLARE
    v_made NUMBER;
    e_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_exists, -955);
    e_denied EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_denied, -1031);
BEGIN
    SELECT COUNT(*) INTO v_made FROM user_property_graphs WHERE graph_name = '${this.name.toUpperCase()}';
    IF v_made = 0 THEN
${waits}
${statements}
${resets}
    END IF;
    SELECT COUNT(*) INTO v_made FROM user_objects WHERE object_type = 'FUNCTION' AND object_name = '${this.nullsEqual.toUpperCase()}' AND status = 'VALID';
    IF v_made = 0 THEN
${waits}
${functions}
${resets}
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        EXECUTE IMMEDIATE 'ALTER SESSION SET DDL_LOCK_TIMEOUT = 0';
        RAISE;
END;`;
    }

    /**
     * Runs {@link ensuring} on `connection`, outside a transaction, and has every session asked again whether it may call
     * the {@link functions} (see {@link OracleStoredFunctions}).
     */
    async ensure(connection: Executes): Promise<void> {
        await connection.execute(this.ensuring);
        OracleStoredFunctions.ensured(this.name);
    }
}

/** A JSON path step naming a key, quoted: `."metadata.source"`. */
export function jsonKey(name: string): string {
    return `."${escapedLabel(name)}"`;
}

/**
 * The step of a JSON path naming `key` as drivine4j writes it: bare where SQL would take it for an identifier, else
 * quoted as `jsonKey` quotes it, for the SQL literal it is written in.
 */
export function drivine4jStep(key: string): string {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !['true', 'false', 'null'].includes(key)
        ? key
        : jsonKey(key).slice(1);
}

/**
 * The property of the node row `alias` as text, as drivine4j's `OracleSql.property` reads it. The stamp is a column of
 * its own.
 */
export function textOf(alias: string, property: string): string {
    return property === Stamps.PROPERTY
        ? `${alias}.stamp`
        : `JSON_VALUE(${alias}.props, '$.${drivine4jStep(property)}')`;
}

/**
 * The JSON the property of the node row `alias` is read from: its properties, or, for the stamp, which is a column of
 * its own, a document of that column under the stamp's property, so a query reads it as any other.
 */
export function holding(alias: string, property: string): string {
    return property === Stamps.PROPERTY
        ? `JSON_OBJECT(${sqlText(property)} VALUE ${alias}.stamp ABSENT ON NULL RETURNING JSON)`
        : `${alias}.props`;
}

/** The map a load returns for the node row `alias`: its properties, its stamp among them, and its labels apart. */
export function nodeDocument(alias: string): string {
    return (
        `JSON_OBJECT('props' VALUE JSON_TRANSFORM(${alias}.props, SET '$${jsonKey(
            Stamps.PROPERTY
        )}' = ${alias}.stamp ` + `IGNORE ON NULL), 'labels' VALUE ${alias}.labels RETURNING JSON)`
    );
}

/**
 * The SELECT of a subquery over related nodes, with the hint every one carries and any more given. Oracle 23
 * coalesces two such subqueries ORed together into one, and rewrites the second's label test as a multivalue index
 * lookup that, evaluated as a filter, misses nodes with more than one label: of two roots, one related to each
 * subclass, `instanceOf(A) OR instanceOf(B)` found one. NO_COALESCE_SQ prevents it.
 */
export function relatedSubquery(...hints: string[]): string {
    return `SELECT /*+ ${['NO_COALESCE_SQ', ...hints].join(' ')} */ 1`;
}

/**
 * A predicate that holds when the node row `alias` carries every one of the labels. A label may come from data (a
 * `@NodeLabels` filter's value, a search's partition label): it is escaped as `jsonKey` escapes a name, the backslash
 * first, for the JSON string the path holds it in, and then the SQL literal around it; a label after the first is looked
 * for by its text ({@link holdsLabel}).
 *
 * The first label is tested so the multivalue index over labels can answer it, and the rest by the labels' text, which
 * that index can't: when two tests of the labels are answered by the index, Oracle (23.26) finds no node the open
 * transaction has written and not yet committed (#221). drivine4j's `OracleSql.hasLabels` writes the same.
 */
export function hasLabels(alias: string, labels: string[]): string {
    return labels
        .map((it, i) =>
            i === 0
                ? `JSON_EXISTS(${alias}.labels, '$?(@ == "${escapedLabel(it)}")')`
                : holdsLabel(`${alias}.labels`, it)
        )
        .join(' AND ');
}

/**
 * A predicate that holds when the JSON array of labels `labels` holds `label`, told by its text. `JSON_SERIALIZE`
 * writes the array compactly, `["A","B"]`; with its brackets made commas and `,"` put after it, `,"A","B","`, each
 * label is `,"label","`, and the label is looked for as that. The trims take one bracket at each end, since a label's
 * quote stands beside each, and no labels at all leave `,,"`, which holds no label. Matched there, the needle is a
 * whole label. Its first quote follows a comma, so isn't escaped: it opens a label or closes one. If it opens one, the
 * label's text runs to the first unescaped quote, which is the one that closes the needle's label. If it closes one, a
 * comma and an opening quote follow, which the needle has only when the label is `,`, and then the quote after that
 * closes a label `,`. The label is written as `JSON_SERIALIZE` writes it ({@link serializedLabel}), so one holding a
 * control character is found, and one holding `","` is not taken for two. drivine4j's `OracleSql.holdsLabel` writes the
 * same.
 */
export function holdsLabel(labels: string, label: string): string {
    return `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(${labels}), ']'), '[') || ',"', ${sqlText(
        `,${serializedLabel(label)},"`
    )}) > 0`;
}

/** The characters `JSON_SERIALIZE` writes with a short escape. */
const SHORT_ESCAPES: Record<string, string> = {
    '"': '\\"',
    '\\': '\\\\',
    '\b': '\\b',
    '\t': '\\t',
    '\n': '\\n',
    '\f': '\\f',
    '\r': '\\r'
};

/**
 * `text` as Oracle's `JSON_SERIALIZE` writes a string, checked on Oracle Free 23 for every character: `"` and `\`
 * escaped; backspace, tab, newline, form feed and carriage return as `\b`, `\t`, `\n`, `\f` and `\r`; every other
 * character below U+0020, and U+007F, as `\u00XX` in upper case; U+2028 and U+2029 as `\u2028` and `\u2029`; and every
 * other character as it is.
 */
export function serializedLabel(text: string): string {
    let escaped = '';
    for (const c of text) {
        const code = c.charCodeAt(0);
        escaped +=
            SHORT_ESCAPES[c] ??
            (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029
                ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
                : c);
    }
    return `"${escaped}"`;
}

/** A label or a key as JSON writes it inside a string, the backslash first, in a SQL literal. */
function escapedLabel(label: string): string {
    return label.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "''");
}

/**
 * A property of the node row `alias` as a range index or a uniqueness constraint over the label holds it: as text, for
 * the label's nodes alone, and null for every other node, for a value that isn't a scalar, and for one longer than
 * 4,000 bytes. A predicate over this expression implies the label.
 */
export function labelledValue(alias: string, label: string, property: string): string {
    return (
        `CASE WHEN ${hasLabels(alias, [label])} THEN JSON_VALUE(${alias}.props, '$${jsonKey(property)}' ` +
        `RETURNING VARCHAR2(4000) NULL ON ERROR) END`
    );
}
