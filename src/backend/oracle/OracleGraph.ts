import { DEFAULT_GRAPH, SqlGraph, sqlText } from '@/backend/sql/SqlGraph';
import { ddlDeadlocked, whenNotContended } from '@/manager/Contention';
import { Stamps } from '@/model/Stamps';
import { Executes, OracleStoredFunctions } from '@/backend/oracle/OracleStoredFunctions';
import { storeStatements } from '@/backend/StoreStatements';

export { DEFAULT_GRAPH, sqlText };

/**
 * A graph as Oracle keeps it: the tables of a SqlGraph, and the SQL property graph over the two, which view reads go
 * through.
 */
export class OracleGraph extends SqlGraph {
    constructor(name: string = DEFAULT_GRAPH) {
        super(name, 'Oracle', 128);
    }

    /**
     * A query of the store's catalog whose one value is how many of the graph's table of nodes it holds, none or one: a
     * graph without one is new, and its layout is not judged (see judgeLayout).
     */
    get tablesMade(): string {
        return `SELECT COUNT(*) AS "made" FROM user_tables WHERE table_name = UPPER(${sqlText(this.nodes)})`;
    }

    /** What makes the store, the shared module's statements (StoreStatements). Each statement may run again. */
    get ddl(): string[] {
        return storeStatements('oracle', this.name).ddl!;
    }

    /**
     * The function a compiled Cypher statement compares two values that may hold a null by, list item by list item and
     * map key by map key (see the shared compiler's `OracleCypherCompiler.nullsEqual`): a statement that writes is a
     * PL/SQL block, whose queries call no function of its own, so the store keeps it.
     */
    get nullsEqual(): string {
        return `${this.name}_nulls_equal`;
    }

    /**
     * The functions a compiled Cypher statement renumbers a year that may be BC by, as it reads an ISO text (this) and
     * as it writes one ({@link eraDate}): each reads its text once, where the SQL it stands for read it three or four
     * times, which Oracle took far longer to plan (see `OracleTemporalSql.era`).
     */
    get era(): string {
        return `${this.name}_era`;
    }

    /** See {@link era}. */
    get eraDate(): string {
        return `${this.name}_era_date`;
    }

    /**
     * What makes each function the store keeps beside the graph's tables, the module's, so drivine4j, drivine-python and
     * this library make them byte for byte alike: safe to run again.
     */
    get functions(): string[] {
        return storeStatements('oracle', this.name).functions!;
    }

    /**
     * The block that makes the store when it is not there and does nothing when it is, the module's: it makes each of
     * the {@link functions} where it is not there, not valid or of another version, so a store an earlier version made
     * gains those it lacks. A user who may not make a function (ORA-01031: making one takes `CREATE PROCEDURE`, which
     * the `RESOURCE` role grants) still has the store made: a statement then calls none of those it lacks (see
     * {@link OracleStoredFunctions}). Two sessions that each find the store missing make it together, each statement
     * of one waiting out a lock the other's holds (ORA-00054) rather than being turned away at once.
     */
    get ensuring(): string {
        return storeStatements('oracle', this.name).ensuring!;
    }

    /**
     * Runs {@link ensuring} on `connection`, outside a transaction, and has every session asked again whether it may call
     * the {@link functions} (see {@link OracleStoredFunctions}).
     *
     * A block turned away by a deadlock with another session, as when the DDL of one pool's first connection and other
     * pools' first writes each wait on the other's lock on the node table (ORA-04020), is run again after a pause (see
     * {@link ddlDeadlocked}): what the block made before it was turned away stays, and the block makes the rest, or
     * finds the store another session finished meanwhile and does nothing (liberation-data/drivine#454). One whose lock
     * stayed busy (ORA-00054) is not: it has waited out the lock inside the block already, up to 30 seconds a statement.
     */
    async ensure(connection: Executes): Promise<void> {
        await whenNotContended(async () => connection.execute(this.ensuring), ddlDeadlocked);
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
 * A predicate that holds when the node row `alias` carries every one of the labels, each told by the labels' text
 * ({@link holdsLabel}), so the index over labels answers none of them: the form for a node that is found some other way,
 * by its id. Given the choice, Oracle reads every node of a label and tests each for the id, where the index over the id
 * gives the one node. drivine4j's `OracleSql.hasLabels(scanned = false)` writes the same, its `carriesLabel` for each.
 */
export function carriesLabels(alias: string, labels: string[]): string {
    return labels.map((it) => holdsLabel(`${alias}.labels`, it)).join(' AND ');
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
 * A property of the node row `alias` as Drivine 5.0's range index or uniqueness constraint over the label held it (store
 * layout 1): as text, for the label's nodes alone, and null for every other node, for a value that isn't a scalar, and
 * for one longer than 4,000 bytes. A predicate over this expression implies the label.
 *
 * No index this version makes holds it. Since layout 2 the shared module's schema plan makes them, with drivine4j's
 * statements, over the property's class and key (the module's `OracleSql.labelledIndex` and `uniqueIndex`), and the
 * layout verdict drops 5.0's on an empty graph (#696). The query DSL still writes this for a filter on an indexed
 * property, as the label's test and the property, so such a filter reads none of layout 2's indexes, until its filters
 * are the module's fragments (drivine-cypher-spec#235, step 4).
 */
export function labelledValue(alias: string, label: string, property: string): string {
    return (
        `CASE WHEN ${hasLabels(alias, [label])} THEN JSON_VALUE(${alias}.props, '$${jsonKey(property)}' ` +
        `RETURNING VARCHAR2(4000) NULL ON ERROR) END`
    );
}
