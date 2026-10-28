import { DrivineError } from '@/DrivineError';
import { holdsLabel } from '@/backend/oracle/OracleGraph';
import { nullsEqualFunction, nullsEqualName } from '@/backend/oracle/OracleStoredFunctions';
import { Stamps } from '@/model/Stamps';
import { CypherFloat } from '@/cypher/ast/Expression';
import { DEGREES_TO_RADIANS, indent, literal, RADIANS_TO_DEGREES, RoundingMode } from '@/cypher/sql/CypherSyntax';
import { jsonText } from '@/cypher/sql/JsonText';
import { OracleTemporalSql } from '@/cypher/sql/OracleTemporalSql';
import { PARAMETERS_OBJECT } from '@/cypher/sql/Parameters';
import { Procedure, ProcedureCall, Steps, Walk, Walked } from '@/cypher/sql/Procedure';
import { PLAIN_FLOAT, SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { TemporalSql } from '@/cypher/sql/TemporalSql';
import { JsonValue, NodeValue } from '@/cypher/sql/Value';

const { PARAMS, ROWS, OUT, ROW, VALUE, ID, COUNT, FOUND, SAVED, GATHERED, CALLER, NESTING, DOOMED }: typeof Procedure =
    Procedure;

/** The cursor a procedure returns its rows by. */
const CURSOR = 'cy_cursor';

/**
 * The function a query declares that compares two values that may hold a null, where the store keeps none: see
 * `OracleCypherCompiler.nullsEqual`.
 */
const NULLS_EQUAL = 'cy_nulls_equal';

/** A key a JSON path writes bare: what SQL would take for an identifier. */
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** How many significant digits a double holds at most, as Neo4j rounds one. */
const DOUBLE_DIGITS = 17;

/** The most places `pastItsDigits` rounds to, whose scale `10^p` is well inside the `NUMBER` range. */
const MOST_PLACES = 100;

/** The words a JSON path reads as values, not keys. */
const JSON_WORDS = ['true', 'false', 'null'];

/** A property as `propertyOf` reads it, its properties and its path, a literal whose quotes are doubled: see `propertyRead`. */
const PROPERTY_READ = /^JSON_QUERY\((.+), ('\$(?:[^']|'')*') RETURNING JSON\)$/;

/** The most bytes a `VARCHAR2` holds in SQL, as a database is made by default (`MAX_STRING_SIZE = STANDARD`). */
const SHORT_TEXT = 4000;

/**
 * How many UTF-16 units of a CLOB `reversedPieces` reverses as one `VARCHAR2`: with one more, where a pair is not cut,
 * and the `x` the piece is put together after, at most 3,002 bytes, as a unit is three bytes at most and a pair four.
 */
const REVERSED_PIECE = 1000;

/** The most bytes `asText` writes a number in: Java's text of a double, `-2.2250738585072014E-308`, and some to spare. */
const NUMBER_TEXT = 32;

/** `text` as JSON writes a string. */
function quoted(text: string): string {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The path of the property `key`, as a SQL literal: a key with a dot in it is one key. With `more`, the property each
 * of them leads to in turn, each of a map in the one before: `'$.p.text'`.
 */
function path(key: string, ...more: string[]): string {
    return pathTo([key, ...more]);
}

/**
 * The path of the property the keys `keys` lead to, each of a map in the one before, as a SQL literal: `'$.p.text'`,
 * or with `suffix` after it, `'$.p.text.type()'`.
 */
function pathTo(keys: string[], suffix: string = ''): string {
    return literal(
        `$${keys
            .map((it) => {
                if (it.length === 0) {
                    throw new DrivineError(
                        'A property name is empty: an empty name is no property a statement can read.'
                    );
                }
                return `.${PLAIN_KEY.test(it) && !JSON_WORDS.includes(it) ? it : quoted(it)}`;
            })
            .join('')}${suffix}`
    );
}

/** The kind of the JSON `json` as Oracle names it, a floating-point number by its own name. */
function kind(json: string): string {
    return `JSON_VALUE(${json}, '$.type()')`;
}

/** Whether `sql`'s parentheses outside its literals close each other: so it is the one argument, not two calls. */
function balanced(sql: string): boolean {
    let depth = 0;
    let quoted = false;
    for (const c of sql) {
        if (c === "'") {
            quoted = !quoted;
        } else if (!quoted && c === '(') {
            depth++;
        } else if (!quoted && c === ')' && --depth < 0) {
            return false;
        }
    }
    return depth === 0 && !quoted;
}

/** The properties and the path of `json` where it is a property as `propertyOf` reads it, `JSON_QUERY(props, '$.a' RETURNING JSON)`. */
function propertyRead(json: string): [string, string] | undefined {
    const match = PROPERTY_READ.exec(json);
    return match && balanced(match[1]) ? [match[1], match[2]] : undefined;
}

/**
 * `sql` with each value it reads out of the JSON `json` with `JSON_VALUE(json, '$…')` read from the properties by the
 * property's own path instead, where `json` is a property as `propertyOf` reads it, `JSON_QUERY(props, '$.a' RETURNING
 * JSON)`. Oracle closed the session (ORA-03113) on statements, one row each, that took a text past 32 KB out of a node's
 * properties so and read it as a CLOB or put it together with another, and a later statement in the session lost its
 * rows: the memory corruption of liberation-data/drivine#320. A value used whole, as a list a sum joins, still takes the
 * property out. It costs about a quarter more on short texts: 100,000 rows of `size(n.name)` took 208 ms against 162 ms,
 * and of `toUpper(n.name)` 196 ms against 164 ms (measured by drivine4j).
 */
function direct(sql: string, json: string): string {
    const read = propertyRead(json);
    if (!read) {
        return sql;
    }
    const [props, at] = read;
    return sql.split(`JSON_VALUE(${json}, '$`).join(`JSON_VALUE(${props}, ${at.slice(0, -1)}`);
}

/**
 * Compiles a Cypher statement to SQL over a graph's tables on Oracle: see {@link SqlCypherCompiler}.
 *
 * A value is Oracle's `JSON`, which compares, groups and orders as JSON and keeps a map's keys in the order written.
 * Oracle keeps a number as a number, so a stored `2.0` reads as `2`; a floating-point number the statement writes is a
 * `BINARY_DOUBLE`, and stays one. A text Oracle reads out of JSON is a `VARCHAR2` of at most 4,000 bytes, and one longer
 * is read as a CLOB where it is measured, cut, changed, searched or reversed (see {@link texts}). An empty text is null,
 * as Oracle's empty text is. `reduce` is a function the query declares, and does not run in a statement that writes,
 * in the step of a `reduce`, or where its step reads a path.
 *
 * A list of ids is text, each id between commas (`,1,2,`): Oracle has no array, and a recursive query takes no `JSON`
 * that changes from row to row. A recursive query reads no row outside it, so a walk starts from every node that meets
 * what the node walked from meets of its own, and carries the node it started from.
 */
export class OracleCypherCompiler extends SqlCypherCompiler {
    readonly temporalSql: TemporalSql = new OracleTemporalSql(this.sharedList, () => this.procedural);
    readonly noIds = "','";
    /** `ROW_NUMBER()` takes an order of its own; `ROWNUM` counts the rows as the query gives them. */
    readonly rowNumber = 'ROWNUM';

    /** Oracle's recursive queries read nothing of the row they are in. */
    readonly walksReadRow: boolean = false;

    /** `collect(CASE WHEN … THEN [r] ELSE [m.title] END)` fails with ORA-00979, or closes the session: see `casesFirst`. */
    readonly aggregatesCaseSubqueries: boolean = false;

    /**
     * Oracle's JSON orders lists item by item already, and a grouped `KEEP (DENSE_RANK FIRST ORDER BY …)` by the list key
     * drops the connection (ORA-03113), as drivine4j found.
     */
    readonly extremesByListKey: boolean = false;

    /** Whether the step of a `reduce` is being written, as its function's own: see {@link reduce}. */
    private folding = false;

    /** Whether the query declares {@link NULLS_EQUAL}: see {@link nullsEqual}. */
    private nullsCompared = false;

    /** Whether the statement compiled calls the store's {@link nullsEqualName}: see {@link callsStoredNullsEqual}. */
    private storedNullsEqualCalled = false;

    /**
     * Whether the texts {@link texts} gives its body are CLOBs: see {@link scalar}, {@link startsWith}, {@link endsWith},
     * {@link split}, {@link replaceText} and {@link reversedText}, which read them otherwise.
     */
    private long = false;

    /**
     * @param graph the graph whose tables, and whose function {@link nullsEqualName}, a statement is compiled against
     * @param nullsEqualStored whether two values that may hold a null are compared by the function the store keeps
     * beside the graph's tables: see {@link nullsEqual}
     */
    constructor(
        private readonly graph: string,
        private readonly nullsEqualStored: boolean = true
    ) {
        super(graph);
    }

    /**
     * Whether the statement compiled calls the store's {@link nullsEqualName}, which a store made by an earlier version,
     * or by a user who may not make a function, does not have: compiled again with `nullsEqualStored` false, it calls
     * none.
     */
    get callsStoredNullsEqual(): boolean {
        return this.storedNullsEqualCalled;
    }

    literalJson(value: any): string {
        return value instanceof CypherFloat
            ? `JSON_SCALAR(TO_BINARY_DOUBLE(${literal(value.toString())}))`
            : `JSON(${literal(jsonText(value))})`;
    }

    parameterJson(marker: string): string {
        return `JSON(${marker})`;
    }

    /**
     * Read with one path from the text the parameter is bound as, and not from the parameter read as JSON first: Oracle
     * crashed the session (ORA-07445 `ksmem_malloc`, ORA-00600) where a statement read a value from a parameter past
     * 32 KB, taken as JSON, for each of two rows.
     */
    parameterPath(marker: string, keys: string[]): string {
        return `JSON_QUERY(${marker}, ${path(keys[0], ...keys.slice(1))} RETURNING JSON)`;
    }

    parameterCount(marker: string): string {
        return `CAST(${marker} AS NUMBER)`;
    }

    comparable(value: JsonValue): string {
        return value.sql;
    }

    /** A CLOB that {@link texts} gives its body is null where it is empty, as a `VARCHAR2` is, and as Oracle's empty text is. */
    scalar(sql: string): string {
        return this.long ? `JSON_SCALAR(CASE WHEN LENGTH(${sql}) > 0 THEN ${sql} END)` : `JSON_SCALAR(${sql})`;
    }

    /** A floating-point number is a number, as JSON has it. */
    typeOf(json: string): string {
        return this.shared([json], ([x]) => `DECODE(${kind(x)}, 'double', 'number', 'float', 'number', ${kind(x)})`);
    }

    isJsonNull(json: string): string {
        return `NVL(${kind(json)}, 'null') = 'null'`;
    }

    nullIfJsonNull(json: string): string {
        return this.shared([json], ([x]) => `CASE WHEN ${kind(x)} <> 'null' THEN ${x} END`);
    }

    /**
     * Where the kind comes, as {@link kindOrder} ranks them and null for null, then the value as `JSON` orders it, which
     * is Cypher's order within a kind: `JSON` orders a number before a text, a truth value after both, and a map and a
     * list last. A null is ranked null, so the value needs no {@link nullIfJsonNull}, which would read it again.
     */
    openSortKey(json: string): string[] {
        const ranks = "'object', 1, 'array', 2, 'string', 3, 'boolean', 4, 'number', 5, 'double', 5, 'float', 5";
        const rank = this.shared([json], ([x]) => `DECODE(${kind(x)}, ${ranks})`);
        return [rank, json];
    }

    number(json: string): string {
        return this.shared(
            [json],
            ([x]) => `CASE WHEN ${this.typeOf(x)} = 'number' THEN JSON_VALUE(${x}, '$' RETURNING NUMBER) END`
        );
    }

    /** A whole number, and no floating-point number, as Cypher has an integer. */
    integral(json: string): string {
        return this.shared(
            [json],
            ([x]) =>
                `(${kind(
                    x
                )} = 'number' AND JSON_VALUE(${x}, '$' RETURNING NUMBER) = TRUNC(JSON_VALUE(${x}, '$' RETURNING NUMBER)))`
        );
    }

    /** A `VARCHAR2`, which holds 4,000 bytes: a longer text is null. See {@link texts}, which reads one as a CLOB. */
    text(json: string): string {
        return this.shared([json], ([x]) => `CASE WHEN ${kind(x)} = 'string' THEN JSON_VALUE(${x}, '$') END`);
    }

    /**
     * `body` over the texts as {@link text} reads them, `VARCHAR2`s, and where it gives null, over them as CLOBs
     * (liberation-data/drivine#347). A text past 4,000 bytes is null as a `VARCHAR2`, where Neo4j measures it, cuts it
     * and searches it whole. `body` gives null where a text it is given is null, and where what it gives would not fit in
     * a `VARCHAR2`: see {@link replaceText} and {@link split}. A short text is not read as a CLOB, which is slower:
     * `COALESCE` reads its second value only where the first is null. `body` knows which it is given by {@link long}.
     */
    texts(jsons: string[], body: (texts: string[]) => string): string {
        return this.shared(jsons, (xs) => {
            // Within a body given CLOBs, as CLOBs alone.
            if (this.long) {
                return body(xs.map((it) => this.textOf(it, true)));
            }
            const read = body(xs.map((it) => this.textOf(it, false)));
            this.long = true;
            let whole: string;
            try {
                whole = body(xs.map((it) => this.textOf(it, true)));
            } finally {
                this.long = false;
            }
            return `COALESCE(${read}, ${whole})`;
        });
    }

    boolOf(json: string): string {
        return this.shared(
            [json],
            ([x]) => `CASE WHEN ${kind(x)} = 'boolean' THEN JSON_VALUE(${x}, '$' RETURNING BOOLEAN) END`
        );
    }

    float(sql: string): string {
        return `TO_BINARY_DOUBLE(${sql})`;
    }

    jsonArray(items: string[]): string {
        return items.length === 0 ? "JSON('[]')" : `JSON_ARRAY(${items.join(', ')} NULL ON NULL RETURNING JSON)`;
    }

    jsonObject(entries: [string, string][]): string {
        if (entries.length === 0) {
            return "JSON('{}')";
        }
        return `JSON_OBJECT(${entries
            .map(([key, value]) => `${literal(key)} VALUE ${value}`)
            .join(', ')} NULL ON NULL RETURNING JSON)`;
    }

    withEntries(json: string, entries: [string, string][]): string {
        if (entries.length === 0) {
            return json;
        }
        return `JSON_TRANSFORM(${json}, ${entries.map(([key, value]) => `SET ${path(key)} = ${value}`).join(', ')})`;
    }

    propertyOf(json: string, key: string): string {
        return `JSON_QUERY(${json}, ${path(key)} RETURNING JSON)`;
    }

    /**
     * A property returned or passed on by a `RETURN` or a `WITH`, read through its text: only the key is kept
     * (`JSON_TRANSFORM … KEEP`), written out as extended JSON, then read back from that text as extended JSON, so a
     * float that is a whole number stays a float.
     *
     * **A workaround for an Oracle server bug (liberation-data/drivine#320), to be removed once Oracle fixes it.** Seen
     * on Oracle 23.26.3 (gvenzl/oracle-free 23). Where a statement takes a string value past about 32 KB from a node's
     * properties with `JSON_QUERY(props, '$.a' RETURNING JSON)` over two or more rows, as the compiled SQL does and then
     * feeds it on (an outer `SELECT`, an `ORDER BY`, a `JSON_ARRAY`), the long value is written over the server
     * process's heap and the process dies: the client sees ORA-03113 (end-of-file on communication channel), and the
     * alert log shows ORA-00600 `[17114]` and `[kghfrh1]`, and ORA-07445 in `kghalo`, `kghsrch_new` or `kxsFreePages`,
     * faulting at `0x78787878787878`, the bytes of the string. One row doesn't crash it, nor 30,000 characters, nor a
     * long list, nor a map that holds the long string. A plain-SQL repro is in drivine4j's
     * [docs/oracle-long-json-string-crash.md](https://github.com/liberation-data/drivine4j/blob/master/docs/oracle-long-json-string-crash.md).
     *
     * It costs about 2.4 to 3.8 times the plain read on short values: 100,000 rows of `RETURN n.name` took 493 ms
     * against 147 ms (measured by drivine4j). Cheaper forms were tried and rejected: each crashed, read a CLOB column
     * back as text (5.0 as 5), or, as a `CASE` on `$.a.type()` or on the value's length that reads the properties twice,
     * made Oracle drop the row's label test and return nodes it had ruled out. Beside a variable-length walk the plain
     * read is kept: Oracle has closed the session over this form in the more involved statements a walk writes. Only an
     * item that is the property itself is read so: a property inside an item (`[n.a]`, `collect(n.a)`) is read as
     * {@link propertyOf} reads it, and isn't worked around. Read so, a text past 32 KB still can't be sorted by, grouped
     * by or made `DISTINCT`: Oracle refuses it (ORA-40180), as it does any JSON that large, and the session stays open.
     * A write's block is worked around too, where it takes a text from the row it is writing: see {@link rowValue}; and
     * so is an unwound item's value an item gives: see {@link itemValue}.
     *
     * To remove it, delete this override, so the item is read as {@link propertyOf} reads it, `JSON_QUERY … RETURNING
     * JSON`, once an Oracle release no longer crashes on the repro, and `OracleLongProperty.spec.ts` and the Cypher
     * spec's case "A property past 32 KB read on two nodes" still pass without it. `OracleItemProperty.spec.ts`, which
     * pins this SQL, goes with it.
     */
    itemProperty(props: string, key: string): string {
        return `JSON(JSON_QUERY(JSON_SERIALIZE(JSON_TRANSFORM(${props}, KEEP ${path(
            key
        )}) RETURNING CLOB EXTENDED), ${path(key)} RETURNING CLOB) EXTENDED)`;
    }

    /**
     * A value that a write takes from the row it is writing, to work out what it writes (`SET n.a = t.a`, `CREATE (:X
     * {a: t.a})`, `MERGE … SET n.a = t.a`, where `t` is an item of an unwound parameter): a text read with one path from
     * the row written out as text, anything else with that path from the row as JSON, as before.
     *
     * **A workaround for the Oracle bug of {@link itemProperty} (liberation-data/drivine#356), to be removed with it.**
     * The block crashed the session where it took a text past 32 KB from the row, a `JSON` variable, with
     * `JSON_QUERY(JSON_QUERY(cy_row, '$.v1' RETURNING JSON), '$.a' RETURNING JSON)`, for each of two or more rows. Read
     * as {@link itemProperty} reads a property, through `JSON_TRANSFORM(cy_row, KEEP …)`, it crashed too; written out
     * whole, `JSON_SERIALIZE(cy_row …)`, it didn't. A text is read from text that isn't extended JSON, which has no float
     * to keep; anything else is read as JSON, as before, so a map of the row with a key as extended JSON's are
     * (`{"$numberLong": "5"}`) stays a map. A list or a map that holds a long text is so read as JSON, which didn't
     * crash: `SET n += t` sets such a map whole. The `CASE` on the value's type, which in a read made Oracle drop a label
     * test (see {@link itemProperty}), doesn't here: it reads the row variable, one value for the whole statement, after
     * the rows were matched, and a labelled pattern in a subquery of that statement keeps its test
     * (`CypherUnwoundWrites.spec.ts`'s "should write an unwound item's text, short or past 32 KB, only to the nodes a
     * labelled pattern matches"). See drivine4j's
     * [docs/oracle-long-json-string-crash.md](https://github.com/liberation-data/drivine4j/blob/master/docs/oracle-long-json-string-crash.md),
     * "In a PL/SQL block, from a `JSON` variable".
     *
     * To remove it, delete this override, so the value is read as {@link propertyOf} reads each key, once an Oracle
     * release no longer crashes on the repro, and `OracleLongProperty.spec.ts`'s "leaves the session open where a text
     * past 32 KB is set from an unwound parameter on two nodes" test still passes without it. The SQL pins in
     * `OracleItemProperty.spec.ts` go with it.
     */
    rowValue(keys: string[]): string {
        return this.throughText(ROW, keys);
    }

    /**
     * A value of an item of an unwound list, or of a row a write carries on, that a `RETURN` or a `WITH` returns or
     * passes on (`UNWIND $items AS t RETURN t.a`, `WITH t.a AS a`, `SET n.a = t.a RETURN t.a`): read as
     * {@link rowValue} reads one, a text from the item written out as text, anything else from the item as JSON, as
     * before.
     *
     * **A workaround for the Oracle bug of {@link itemProperty} (liberation-data/drivine#366), to be removed with it.**
     * Such a statement crashed the session where it took a text past 32 KB from the item, `JSON_QUERY(u1.item, '$.a'
     * RETURNING JSON)`, for each of two or more rows. {@link itemProperty}'s form, and the item written out whole as
     * extended JSON, ran clean, but read a map with a key as extended JSON's are (`{"$numberLong": "5"}`) as the number
     * it writes. The `CASE` on the value's type, which made Oracle drop a label test where it read a node's properties
     * twice (see {@link itemProperty}), reads the item here, a column of the list it is unwound from, and the labelled
     * patterns beside it kept their tests (`CypherUnwoundWrites.spec.ts`'s "should return an unwound item's text, short
     * or past 32 KB, only for the nodes a labelled pattern matches"). So only a value read from such an item is read so
     * (see {@link JsonValue.fromList}); a map made of a node's properties and not unwound (`WITH n {.a} AS m`,
     * `properties(n)`) is read as before. It cost about 1.4 times the plain read on short values: 100,000 rows of
     * `UNWIND $items AS t RETURN t.a` took 800 ms against 560 ms, the median of 11 runs each.
     *
     * A pattern that matches on such a text (`MERGE (n:X {a: t.a})`) still compares it as JSON: Oracle refuses that
     * (ORA-40180), as it refuses to sort or group a text past 32 KB, and the session stays open. To remove the
     * workaround, delete this override with {@link itemProperty}'s, once an Oracle release no longer crashes on the
     * repro, and `OracleLongProperty.spec.ts`'s "leaves the session open where a text past 32 KB from an unwound
     * parameter is returned or passed on over two rows" test still passes without it.
     */
    itemValue(json: string, key: string): string {
        return this.throughText(json, [key]);
    }

    /** Counted from the end where negative: a JSON path counts from the start. */
    element(json: string, index: string): string {
        return this.shared([json, index], ([list, i]) => {
            const at = `JSON_VALUE(${i}, '$' RETURNING NUMBER)`;
            return (
                `JSON_QUERY(${list}, '$[$i]' PASSING CASE WHEN ${at} < 0 THEN JSON_VALUE(${list}, '$.size()' RETURNING NUMBER) + ${at} ` +
                `ELSE ${at} END AS "i" RETURNING JSON)`
            );
        });
    }

    /** A JSON path names a key as it is written, so a key an expression gives is not read: `map[key]` is null, where `list[i]` reads its item. */
    keyed(): string | undefined {
        return undefined;
    }

    /** A merge of `map` over `props` that changes nothing: each of its entries is there, with an equal value. */
    containsAll(props: string, map: string): string {
        return this.shared([props], ([p]) => `JSON_EQUAL(JSON_MERGEPATCH(${p}, ${map} RETURNING JSON), ${p})`);
    }

    hasLabel(labels: string, label: string): string {
        return `JSON_EXISTS(${labels}, ${literal(`$[*]?(@ == ${quoted(label)})`)})`;
    }

    /**
     * The first label as the index over labels answers it, and the rest by the labels' text: when two tests of the
     * labels are answered by that index, Oracle (23.26) finds no node the open transaction has written and not yet
     * committed.
     */
    hasLabels(labels: string, all: string[]): string {
        return [this.hasLabel(labels, all[0]), ...all.slice(1).map((it) => holdsLabel(labels, it))].join(' AND ');
    }

    /**
     * A list that holds a subquery is read from a lateral view first: a subquery in `JSON_TABLE`'s argument reads no
     * table beside it in the `FROM`.
     */
    elements(json: string, alias: string): string {
        const items = `COLUMNS (item_no FOR ORDINALITY, item JSON PATH '$')) ${alias}`;
        if (!/select/i.test(json)) {
            return `JSON_TABLE(${json}, '$[*]' ${items}`;
        }
        return `LATERAL (SELECT ${json} AS list) ${alias}_l CROSS JOIN JSON_TABLE(${alias}_l.list, '$[*]' ${items}`;
    }

    /**
     * Each item read by its place, from as many rows as the list has items: Oracle 23 takes many seconds, or minutes, to
     * parse a `JSON_TABLE` over a list of temporal values worked out with temporal arithmetic, item by item in a
     * comprehension (liberation-data/drivine4j#331), and neither a query timeout nor a kill ends the parse. `JSON_QUERY`
     * reads the same list in moments, at about ten times the cost of `JSON_TABLE` for a short list, so a list of other
     * values is read by {@link elements}. The list is worked out once, in a lateral view of its own, and its places counted
     * in another: where they are counted over the list's own view, or the list is written out again where it is read,
     * Oracle reads an `EXISTS` over its items with the wrong row's columns. It reads as `JSON_TABLE`'s `$[*]` does: no rows
     * for null, and one for a value that is no list.
     */
    temporalElements(json: string, alias: string): string {
        const [list, place] = [`${alias}_l`, `${alias}_r`];
        const size = `JSON_VALUE(${list}.list, '$.size()' RETURNING NUMBER)`;
        return (
            `LATERAL (SELECT /*+ NO_MERGE */ ${json} AS list FROM DUAL) ${list} CROSS JOIN ` +
            `LATERAL (SELECT ${place}.n AS item_no, JSON_QUERY(${list}.list, '$[$i]' PASSING ${place}.n - 1 AS "i" RETURNING JSON) AS item ` +
            `FROM (SELECT LEVEL n FROM DUAL CONNECT BY LEVEL <= GREATEST(NVL(${size}, 0), 1)) ${place} WHERE ${place}.n <= ${size}) ${alias}`
        );
    }

    aggregateList(value: string, order?: string): string {
        return `COALESCE(JSON_ARRAYAGG(${value}${
            order ? ` ORDER BY ${order}` : ''
        } NULL ON NULL RETURNING JSON), JSON('[]'))`;
    }

    /** `JSON_ARRAYAGG` leaves nulls out. */
    collect(value: string, order?: string): string {
        return `COALESCE(JSON_ARRAYAGG(${value}${order ? ` ORDER BY ${order}` : ''} RETURNING JSON), JSON('[]'))`;
    }

    /** At most 4,000 bytes, as a `VARCHAR2`: the rest is left off, where it would fail the statement. */
    joinedTexts(text: string, order: string): string {
        return `LISTAGG(${text} ON OVERFLOW TRUNCATE '' WITHOUT COUNT) WITHIN GROUP (ORDER BY ${order})`;
    }

    /**
     * Each item where it is first among those equal to it as `JSON` compares them, kept as it is: not by its text, which is
     * at most 4,000 bytes and keeps a map's keys in the order written, and not read back from it, which would read a float
     * that is a whole number, `2.0`, as the number 2.
     */
    distinctItems(list: string, temporal: boolean = false): string {
        return (
            "(SELECT COALESCE(JSON_ARRAYAGG(d.item ORDER BY d.item_no RETURNING JSON), JSON('[]')) " +
            'FROM (SELECT e.item_no, e.item, ROW_NUMBER() OVER (PARTITION BY e.item ORDER BY e.item_no) AS n ' +
            `FROM ${this.elementsOf(list, 'e', temporal)}) d WHERE d.n = 1)`
        );
    }

    firstOfEach(list: string, identities: string): string {
        return (
            `(SELECT ${this.aggregateList('v.item', 'v.item_no')} FROM ${this.elements(
                list,
                'v'
            )} JOIN (SELECT d.item_no FROM (SELECT e.item_no, ` +
            `ROW_NUMBER() OVER (PARTITION BY e.item ORDER BY e.item_no) AS n FROM ${this.elements(
                identities,
                'e'
            )}) d WHERE d.n = 1) f ON f.item_no = v.item_no)`
        );
    }

    /** Of the values of the kind that comes first, or last, as `kindOrder` orders them; by `key` first where there is one. */
    extreme(value: string, min: boolean, key?: string): string {
        const direction = min ? 'ASC' : 'DESC';
        return `${min ? 'MIN' : 'MAX'}(${this.nullIfJsonNull(value)}) KEEP (DENSE_RANK FIRST ORDER BY ${this.kindOrder(
            value
        )} ${direction} NULLS LAST${key !== undefined ? `, ${key} ${direction} NULLS LAST` : ''})`;
    }

    /**
     * A float, `BINARY_DOUBLE`, where any value summed is one, a double or a number with a fraction, as in Cypher: `NUMBER`
     * keeps no such kind, so a sum of floats that is whole, 0.5 + 1.0 + 0.5, would be the integer 2. Floats are summed as
     * doubles, as Neo4j sums them: as `NUMBER`s, 1e300 would be dropped, and 0.1 + 0.2 would be 0.3. Nothing is bound under
     * an aggregate, so each value is written out where it is read: each read is one path that tests the value's kind
     * itself, a text not summed and a number with a fraction written with a point, or with a negative exponent, `1E-41`,
     * as Oracle writes one of more than 40 digits, so a sum reads it three times, as {@link number} alone does. A path
     * compares no item to another, `@ != @.floor()` failing with ORA-40597, so a fraction is told by how it is written.
     */
    sum(json: string, distinct: string): string {
        const summed = (type: string): string =>
            `sum(${distinct}JSON_VALUE(${json}, '$?(@.type() != "string")' RETURNING ${type}))`;
        const fraction = '@.string() has substring "." || @.string() has substring "E-"';
        const float = `MAX(JSON_VALUE(${json}, '$?(@.type() == "double" || (@.type() == "number" && (${fraction})))')) IS NOT NULL`;
        return (
            `CASE WHEN ${float} THEN JSON_SCALAR(${summed('BINARY_DOUBLE')}) ` +
            `ELSE JSON_SCALAR(COALESCE(${summed('NUMBER')}, 0)) END`
        );
    }

    /** In `BINARY_DOUBLE` where either is one, so a float stays a float, as in Cypher: `NUMBER` keeps no such kind. */
    arithmetic(a: string, b: string, operator: string): string {
        return (
            `CASE WHEN ${kind(a)} = 'double' OR ${kind(b)} = 'double' ` +
            `THEN JSON_SCALAR(TO_BINARY_DOUBLE(${this.number(a)}) ${operator} TO_BINARY_DOUBLE(${this.number(b)})) ` +
            `ELSE JSON_SCALAR(${this.number(a)} ${operator} ${this.number(b)}) END`
        );
    }

    /** A side that is a property is read from the properties by its own path: see `direct`. */
    add(a: string, b: string, given: [unknown, unknown] = [undefined, undefined]): string {
        const sum =
            `CASE WHEN ${this.typeOf(a)} = 'number' AND ${this.typeOf(b)} = 'number' THEN ${this.arithmetic(
                a,
                b,
                '+'
            )} ` +
            `WHEN ${kind(a)} = 'array' AND ${kind(
                b
            )} = 'array' THEN JSON_QUERY(JSON_ARRAY(${a}, ${b} RETURNING JSON), '$[*][*]' RETURNING JSON WITH ARRAY WRAPPER) ` +
            `WHEN ${kind(a)} = 'array' THEN JSON_TRANSFORM(${a}, APPEND '$' = ${b}) ` +
            `WHEN ${kind(b)} = 'array' THEN JSON_TRANSFORM(${b}, INSERT '$[0]' = ${a}) ` +
            `WHEN ${this.typeOf(a)} IN ('string', 'number') AND ${this.typeOf(
                b
            )} IN ('string', 'number') THEN ${this.textSum(a, b, given)} END`;
        return direct(direct(sum, a), b);
    }

    /** `JSON_EQUAL`, which compares values larger than `=` does, with ORA-40180 past about 32 KB. */
    identityEquals(x: string, y: string): string {
        return `JSON_EQUAL(${x}, ${y})`;
    }

    idTokens(ids: string, key: string): string {
        return `JSON(REGEXP_REPLACE(JSON_SERIALIZE(${ids} RETURNING CLOB), '(-?[0-9]+)', ${literal(
            `{"${key}": \\1}`
        )}))`;
    }

    itemAt(json: string, index: number): string {
        return `JSON_QUERY(${json}, '$[${index}]' RETURNING JSON)`;
    }

    listSize(json: string): string {
        return `JSON_VALUE(${json}, '$.size()' RETURNING NUMBER)`;
    }

    /**
     * A null as JSON's text writes one in a list or a map, its texts and keys taken out first, so a text that holds a
     * null's text (`"a,null]"`) does not say so: Oracle's JSON path walks no descendants. Read as a `VARCHAR2`, faster
     * than as a `CLOB`, which a value whose text is past 4,000 bytes is read as instead. It is exact, as a procedure's
     * {@link nullsEqual} needs.
     */
    holdsNull(json: string): string {
        const nulls = (text: string): string =>
            `REGEXP_LIKE(REGEXP_REPLACE(${text}, '"([^"\\\\]|\\\\.)*"', '""'), '[[,:]null[],}]')`;
        const short = `JSON_SERIALIZE(${json} RETURNING VARCHAR2(4000) NULL ON ERROR)`;
        return `(${short} IS NOT NULL AND ${nulls(short)} OR ${short} IS NULL AND ${nulls(
            `JSON_SERIALIZE(${json} RETURNING CLOB)`
        )})`;
    }

    /**
     * Two values written as the same JSON text are null, as one holds a null and so its pair in the other does: that
     * needs no walk. The text is read as a `VARCHAR2`, as {@link holdsNull} reads it; a value past 4,000 bytes has none,
     * and `=` and `JSON_EQUAL` fail on one past about 32 KB (ORA-40180), so such a value is walked. Any other two are
     * walked together by a function, as Oracle's recursive queries take no `JSON`: the store's own ({@link nullsEqualName}),
     * which the graph is made with, so a procedure's queries and a `reduce`'s step's call it too. Where the store has none
     * (see {@link callsStoredNullsEqual}), a query declares it (see {@link reduce}); a procedure's queries call no function
     * it declares, nor do a `reduce`'s step's, so there two equal as JSON are null and any other two false, as before null
     * was compared item by item: `[null] = [1]` is false there, where Cypher's is null.
     */
    nullsEqual(x: string, y: string, equals: (x: string, y: string) => string): string {
        if (!this.nullsEqualStored && (this.procedural || this.folding)) {
            return `CASE WHEN ${equals(x, y)} THEN NULL ELSE FALSE END`;
        }
        let walked: string;
        if (this.nullsEqualStored) {
            this.storedNullsEqualCalled = true;
            walked = `(${nullsEqualName(this.graph)}(${x}, ${y}) = 1)`;
        } else {
            if (!this.nullsCompared) {
                this.nullsCompared = true;
                this.declare(nullsEqualFunction(NULLS_EQUAL));
            }
            walked = `(${NULLS_EQUAL}(${x}, ${y}) = 1)`;
        }
        const text = (json: string): string => `JSON_SERIALIZE(${json} RETURNING VARCHAR2(4000) NULL ON ERROR)`;
        return `CASE WHEN ${text(x)} = ${text(y)} THEN NULL ELSE ${walked} END`;
    }

    modulo(a: string, b: string): string {
        return `MOD(${a}, ${b})`;
    }

    /** CLOBs, which `=` does not compare (ORA-22848), by `DBMS_LOB.COMPARE`: see {@link texts}. */
    startsWith(a: string, b: string): string {
        return this.shared([b], ([x]) =>
            this.long
                ? `(DBMS_LOB.COMPARE(${a}, ${x}, LENGTH(${x}), 1, 1) = 0)`
                : `(SUBSTR(${a}, 1, LENGTH(${x})) = ${x})`
        );
    }

    endsWith(a: string, b: string): string {
        if (this.long) {
            return this.shared(
                [a, b],
                ([t, x]) =>
                    `(LENGTH(${t}) >= LENGTH(${x}) AND DBMS_LOB.COMPARE(${t}, ${x}, LENGTH(${x}), LENGTH(${t}) - LENGTH(${x}) + 1, 1) = 0)`
            );
        }
        return this.shared([b], ([x]) => `(SUBSTR(${a}, -LENGTH(${x})) = ${x})`);
    }

    /** Of CLOBs too (see {@link texts}), though `INSTR` looks for no text past 32 KB (ORA-22828). */
    containsText(a: string, b: string): string {
        return `(INSTR(${a}, ${b}) > 0)`;
    }

    /** Of a property, read from the properties by its own path: see `direct`. */
    function(name: string, json: string): string | undefined {
        const sql = this.functionOf(name, json);
        return sql === undefined ? undefined : direct(sql, json);
    }

    page(skip?: string, limit?: string): string[] {
        return [...(skip ? [`OFFSET ${skip} ROWS`] : []), ...(limit ? [`FETCH NEXT ${limit} ROWS ONLY`] : [])];
    }

    ids(id: string): string {
        return `(',' || ${id} || ',')`;
    }

    joinIds(lists: string[]): string {
        return `(${lists[0]}${lists
            .slice(1)
            .map((it) => ` || SUBSTR(${it}, 2)`)
            .join('')})`;
    }

    storeIds(json: string): string {
        return this.shared([json], ([ids]) => {
            const listed = "LISTAGG(x.id, ',') WITHIN GROUP (ORDER BY x.ord)";
            return (
                `CASE WHEN ${ids} IS NOT NULL THEN (SELECT NVL2(${listed}, ',' || ${listed} || ',', ',') ` +
                `FROM JSON_TABLE(${ids}, '$[*]' COLUMNS (ord FOR ORDINALITY, id NUMBER PATH '$')) x) END`
            );
        });
    }

    idIn(id: string, list: string): string {
        return `INSTR(${list}, ',' || ${id} || ',') > 0`;
    }

    idsOverlap(a: string, b: string): string {
        return `EXISTS (SELECT 1 FROM ${this.idRows(a, 'ov')} WHERE INSTR(${b}, ',' || ov.id || ',') > 0)`;
    }

    idCount(list: string): string {
        return `JSON_SCALAR(REGEXP_COUNT(${list}, ',') - 1)`;
    }

    idRows(list: string, alias: string): string {
        return `JSON_TABLE(JSON('[' || TRIM(BOTH ',' FROM ${list}) || ']'), '$[*]' COLUMNS (ord FOR ORDINALITY, id NUMBER PATH '$')) ${alias}`;
    }

    /** A recursive query from each node that meets the seed, each row carrying the node it started from. */
    walk(walk: Walk): Walked {
        const w = walk.step;
        const n = `${walk.name}_n`;
        const { joins, reached, distinct }: Steps = this.steps(walk, `${w}.nid`);
        const eids = walk.hops.map((it) => `${it.edge}.eid`);
        const conditions = [
            ...eids.map((it) => `INSTR(${w}.eids, ',' || ${it} || ',') = 0`),
            ...distinct,
            ...(walk.max !== undefined ? [`${w}.depth < ${walk.max}`] : []),
            ...walk.conditions
        ];
        // Oracle adapts a step's plan as the statement runs, and a second session that runs the statement then finds no
        // rows where a walk either way goes around a cycle (liberation-data/drivine4j#182): no plan adapts.
        const select = 'SELECT /*+ NO_ADAPTIVE_PLAN */';
        const text = [
            `WITH ${w} (src, nid, depth, nids, eids) AS (`,
            `    SELECT ${n}.nid, ${n}.nid, 0, CAST(',' AS VARCHAR2(4000)), CAST(',' AS VARCHAR2(4000))`,
            `    FROM ${this.nodes} ${n}${walk.seed ? ` WHERE ${walk.seed(n)}` : ''}`,
            '    UNION ALL',
            // Walked backwards, each node it leaves goes first, so its nodes end with the one it started from.
            walk.backwards
                ? `    ${select} ${w}.src, ${reached[0]}, ${w}.depth + 1, ',' || ${w}.nid || ${w}.nids, ',' || ${eids[0]} || ${w}.eids`
                : `    ${select} ${w}.src, ${reached[reached.length - 1]}, ${w}.depth + 1, ${w}.nids${reached
                      .map((it) => ` || ${it} || ','`)
                      .join('')}, ${w}.eids${eids.map((it) => ` || ${it} || ','`).join('')}`,
            `    FROM ${w}`,
            ...joins.map((it) => `    ${it}`),
            `    WHERE ${conditions.join(' AND ')}`,
            // A walk may come back to a node it left, which Oracle takes for a cycle unless told what one is: a step
            // takes no relationship twice, so no row's relationships are an earlier row's.
            ") CYCLE eids SET looped TO 'Y' DEFAULT 'N'",
            `SELECT src, nid, nids, eids FROM ${w} WHERE depth >= ${walk.min}`
        ].join('\n');
        return {
            source: `(\n${indent(text)}\n) ${walk.name}`,
            condition: `${walk.name}.src = ${walk.from} AND ${walk.name}.nid = ${walk.to}`,
            eids: `${walk.name}.eids`,
            nids: `${walk.name}.nids`
        };
    }

    nodeJson(node: NodeValue): string {
        return `CASE WHEN ${node.nid} IS NOT NULL THEN JSON_TRANSFORM(${node.props}, SET ${path(Stamps.PROPERTY)} = ${
            node.stamp
        } IGNORE ON NULL) END`;
    }

    /**
     * A function the query declares, `WITH FUNCTION`, that folds the list: Oracle's recursive queries read nothing of
     * the row they are in. The step reads what it reads of the row from the map it is given. A procedure's queries call
     * no function it declares, so a statement that writes takes no `reduce`; nor does the step of one, whose queries are
     * its function's own.
     */
    reduce(
        name: string,
        initial: string,
        list: string,
        _step: (accumulator: string, item: string) => string,
        context: () => string,
        contextStep: (accumulator: string, item: string, context: string) => string
    ): string {
        if (this.procedural) {
            throw new DrivineError(
                'reduce() does not run on Oracle in a statement that writes: its block calls no function of its own from SQL.'
            );
        }
        if (this.folding) {
            throw new DrivineError(
                "reduce() does not run on Oracle in the step of a reduce(): its function calls no function of the query's from SQL."
            );
        }
        const fn = `cy_${name}`;
        const given = context();
        this.folding = true;
        let folded: string;
        try {
            folded = contextStep('cy_value', 'cy_step.item', 'cy_context');
        } finally {
            this.folding = false;
        }
        this.declare(
            [
                `FUNCTION ${fn}(cy_initial JSON, cy_list JSON, cy_context JSON) RETURN JSON IS`,
                '    cy_value JSON := cy_initial;',
                '    cy_kind VARCHAR2(20);',
                'BEGIN',
                "    SELECT JSON_VALUE(cy_list, '$.type()') INTO cy_kind FROM DUAL;",
                "    IF cy_kind IS NULL OR cy_kind <> 'array' THEN RETURN NULL; END IF;",
                "    FOR cy_step IN (SELECT s.item FROM JSON_TABLE(cy_list, '$[*]' COLUMNS (item_no FOR ORDINALITY, item JSON PATH '$')) s ORDER BY s.item_no) LOOP",
                indent(`    SELECT ${folded} INTO cy_value FROM DUAL;`),
                '    END LOOP;',
                '    RETURN cy_value;',
                'END;'
            ].join('\n')
        );
        return `${fn}(${initial}, ${list}, ${given})`;
    }

    /** As many rows as the range has numbers, from a hierarchical query of one row. */
    range(from: string, to: string, step: string): string {
        return this.shared([from, to, step], ([first, last, by]) => {
            const count = `FLOOR((${last} - ${first}) / ${by}) + 1`;
            return (
                `(SELECT COALESCE(JSON_ARRAYAGG(${first} + (r.n - 1) * ${by} ORDER BY r.n RETURNING JSON), JSON('[]')) ` +
                `FROM (SELECT LEVEL n FROM DUAL CONNECT BY LEVEL <= GREATEST(${count}, 1)) r WHERE r.n <= ${count})`
            );
        });
    }

    /**
     * Oracle merges a view of no table into the subquery that reads it, and where that subquery is bound in another and
     * the row reads another property, the merged query reads the value as null: each is kept apart.
     */
    boundSelect(columns: string): string {
        return `SELECT /*+ NO_MERGE */ ${columns}`;
    }

    /**
     * Oracle merges a `CALL { … }` query into the row's query that joins it, and a value bound in that row from what the
     * query returns is then read as null (`CALL { WITH n RETURN n.day AS d } RETURN d + duration('P1D')`).
     */
    called(query: string): string {
        return `SELECT /*+ NO_MERGE */ * FROM (\n${indent(query)}\n)`;
    }

    /**
     * An optional join is on `1 = 1`, not `ON TRUE`: in a scalar subquery, as a `COUNT { … }` is, Oracle refuses a join
     * on `TRUE` followed by a `WHERE … AND …` (ORA-00907), and crashes the session on one without (ORA-07445 in
     * `qcsjccqb`, ORA-03113 to the client) (#377). See drivine4j's docs/oracle-on-true-in-scalar-subquery-crash.md.
     */
    lateral(query: string, name: string, optional: boolean): string {
        return optional
            ? `LEFT JOIN LATERAL (\n${indent(query)}\n) ${name} ON 1 = 1`
            : super.lateral(query, name, false);
    }

    /**
     * Flags the pattern opens with, `(?i)`, are Oracle's match parameter, Java's `s` its `n`. The whole of the text
     * matches, as `=~` asks: it starts at `\A` and ends at `\z`, the text's start and end, which `(?m)` leaves as they are,
     * and Oracle's `$` also matches before a line break that ends the text. Under `(?m)`, Oracle's own `^` and `$` match
     * at a line break only where nothing in the pattern reads past it: `x$\n^ab` matches no text.
     */
    matches(text: string, pattern: string): string {
        return this.shared([pattern], ([p]) => {
            const flags = `REGEXP_SUBSTR(${p}, '^\\(\\?([a-z]+)\\)', 1, 1, NULL, 1)`;
            return `REGEXP_LIKE(${text}, '\\A(' || REGEXP_REPLACE(${p}, '^\\(\\?[a-z]+\\)', '') || ')\\z', NVL(REPLACE(${flags}, 's', 'n'), 'c'))`;
        });
    }

    /**
     * The text as JSON writes it, with each separator as JSON writes it made the end of one string and the start of the
     * next. A `VARCHAR2` is cut off past 4,000 bytes where `REPLACE` makes it longer, so a text is split as one only where
     * what it is made cannot be longer, each of its bytes written as six at most (`\u0001`), and else as a CLOB: see
     * {@link texts}.
     */
    split(text: string, separator: string): string {
        return this.shared([text, separator], ([t, s]) => {
            // A separator past 4,000 bytes is a CLOB too, and written as one (ORA-40478).
            const serialized = (x: string): string =>
                this.long ? `JSON_SERIALIZE(JSON_SCALAR(${x}) RETURNING CLOB)` : `JSON_SERIALIZE(JSON_SCALAR(${x}))`;
            const written = serialized(t);
            const separatorWritten = `SUBSTR(${serialized(s)}, 2, LENGTH(${serialized(s)}) - 2)`;
            const fits = this.long ? '' : ` AND LENGTHB(${t}) <= ${Math.floor((SHORT_TEXT - 2) / 6)}`;
            return `CASE WHEN ${t} IS NOT NULL AND ${s} IS NOT NULL${fits} THEN JSON('[' || REPLACE(${written}, ${separatorWritten}, '","') || ']') END`;
        });
    }

    /**
     * A `VARCHAR2` is cut off past 4,000 bytes where `REPLACE` makes it longer: as one only where it cannot be, as each
     * `search` made `replacement` grows the text by their ratio at most, and else null, so {@link texts} replaces in a
     * CLOB. Their lengths are worked out here where the statement gives them, and not for each row.
     */
    replaceText(
        text: string,
        search: string,
        replacement: string,
        searchBytes?: number,
        replacementBytes?: number
    ): string {
        const replaced = `REPLACE(${text}, ${search}, ${replacement})`;
        if (this.long) {
            return replaced;
        }
        if (searchBytes !== undefined && replacementBytes !== undefined) {
            return replacementBytes <= searchBytes
                ? replaced
                : `CASE WHEN LENGTHB(${text}) * ${replacementBytes} <= ${
                      SHORT_TEXT * searchBytes
                  } THEN ${replaced} END`;
        }
        const s = searchBytes?.toString() ?? `LENGTHB(${search})`;
        const r = replacementBytes?.toString() ?? `LENGTHB(${replacement})`;
        return `CASE WHEN ${r} <= ${s} OR LENGTHB(${text}) * ${r} <= ${SHORT_TEXT} * ${s} THEN ${replaced} END`;
    }

    /** Oracle has no reverse of a text that it documents: its characters, read from the last, put together by `LISTAGG`. */
    reverseText(text: string): string {
        return this.shared(
            [text],
            ([t]) =>
                `(SELECT LISTAGG(SUBSTR(${t}, LEVEL, 1)) WITHIN GROUP (ORDER BY LEVEL DESC) FROM DUAL CONNECT BY LEVEL <= LENGTH(${t}))`
        );
    }

    /**
     * `LISTAGG` gives a `VARCHAR2`, and fails past 4,000 bytes (ORA-01489), so a CLOB that {@link texts} gives
     * (liberation-data/drivine#363) is reversed in pieces, as JSON: see {@link reversedPieces}. The CLOB is bound once,
     * as each piece reads it, and bound as a CLOB by `TO_CLOB`: of a literal, `reverse('Keanu')` or `reverse([1, 2, 3])`,
     * Oracle otherwise finds no one `DBMS_LOB.SUBSTR` to call (PLS-307).
     */
    reversedText(text: string): string {
        return this.long ? this.bound([`TO_CLOB(${text})`], ([t]) => this.reversedPieces(t)) : super.reversedText(text);
    }

    /** Oracle's GUID, in a UUID's form: unique, though not random as a version 4 UUID is. */
    uuid(): string {
        return "LOWER(REGEXP_REPLACE(RAWTOHEX(SYS_GUID()), '(.{8})(.{4})(.{4})(.{4})(.{12})', '\\1-\\2-\\3-\\4-\\5'))";
    }

    /**
     * Worked out as a `NUMBER`, then made the nearest double: Oracle fails where Neo4j gives NaN or an infinity, `LN(0)`,
     * `SQRT(-1)`, `ASIN(2)` and `1 / TAN(0)` among them, and where a `NUMBER` overflows, past 1e126, as `EXP(300)` does.
     * One too small for a `NUMBER`, below 1e-130, is 0, as `EXP(-1000)` is in Java, and `EXP(-300)` is not. A
     * `BINARY_DOUBLE` would give NaN or an infinity, which JSON holds neither of.
     */
    math(name: string, numbers: string[]): string {
        const x = numbers[0];
        const functions: Record<string, () => string> = {
            log: () => `LN(${x})`,
            log10: () => `LOG(10, ${x})`,
            cot: () => `(1 / TAN(${x}))`,
            // In doubles from the one nearest the cosine, as Java works it out: near 0, that loses digits a NUMBER keeps.
            haversin: () => `((1 - TO_BINARY_DOUBLE(COS(${x}))) / 2)`,
            // In doubles, by the ratio Java multiplies by: see RADIANS_TO_DEGREES.
            degrees: () => `(TO_BINARY_DOUBLE(${x}) * ${RADIANS_TO_DEGREES})`,
            radians: () => `(TO_BINARY_DOUBLE(${x}) * ${DEGREES_TO_RADIANS})`,
            // Oracle overflows at ATAN2(0, 0), which Java gives as 0.0: a NUMBER has no negative zero to give π for.
            atan2: () =>
                this.shared(
                    [x, numbers[1]],
                    ([y, z]) => `CASE WHEN ${y} = 0 AND ${z} = 0 THEN 0 ELSE ATAN2(${y}, ${z}) END`
                )
        };
        return this.float(
            Object.prototype.hasOwnProperty.call(functions, name) ? functions[name]() : `${name.toUpperCase()}(${x})`
        );
    }

    /**
     * Oracle's `SIGN` gives 0 for a positive number under 1.0E-128, from 1.0E-130 up, which NUMBER holds and compares as
     * greater than 0, and is right from 1.0E-128 up, for a negative number, 0, and null. So the number is held to between
     * -1 and 1, where a thousand times it cannot overflow, and that is signed, past 1.0E-128 where it is not 0: `number`
     * is read once, so a sign of a sign does not write it out twice at each level (liberation-data/drivine#342).
     */
    signOf(number: string): string {
        return `SIGN(GREATEST(LEAST(${number}, 1), -1) * 1000)`;
    }

    roundPlaces(number: string, precision: string): string {
        return this.pastItsDigits(number, precision, (n, p) => super.roundPlaces(n, p));
    }

    roundTo(number: string, precision: string, mode: RoundingMode): string {
        return this.pastItsDigits(number, precision, (n, p) => super.roundTo(n, p, mode));
    }

    /** SUBSTR from the end gives null where it is asked for more than there is. */
    rightText(text: string, count: string): string {
        return this.shared(
            [text, count],
            ([t, n]) => `CASE WHEN ${n} >= LENGTH(${t}) THEN ${t} WHEN ${n} > 0 THEN SUBSTR(${t}, -${n}) END`
        );
    }

    /** An anonymous block, which returns its rows as an implicit result. */
    procedure(body: string[]): ProcedureCall {
        const saved = Array.from({ length: NESTING }, (_, i) => [
            `    ${SAVED}${i + 1} JSON;`,
            `    ${GATHERED}${i + 1} JSON;`,
            `    ${CALLER}${i + 1} JSON;`
        ]);
        const sql = [
            'DECLARE',
            // Text, read as JSON where each parameter is read (propertyOf): Oracle crashed the session where a block read
            // a value past 32 KB more than once from a JSON variable (liberation-data/drivine#308).
            `    ${PARAMS} CLOB := $${PARAMETERS_OBJECT};`,
            `    ${ROWS} JSON;`,
            `    ${OUT} JSON;`,
            `    ${ROW} JSON;`,
            `    ${VALUE} JSON;`,
            `    ${ID} NUMBER;`,
            `    ${COUNT} NUMBER;`,
            `    ${FOUND} BOOLEAN;`,
            `    ${DOOMED} JSON;`,
            `    ${CURSOR} SYS_REFCURSOR;`,
            `    ${OracleTemporalSql.NOW} TIMESTAMP;`,
            ...saved.flat(),
            'BEGIN',
            // The clock is read once, by a query: see OracleTemporalSql's now.
            `    SELECT ${OracleTemporalSql.CLOCK} INTO ${OracleTemporalSql.NOW} FROM DUAL;`,
            indent(body.join('\n')),
            'END;'
        ].join('\n');
        return { setup: [], sql };
    }

    /**
     * The rows as an implicit result of one row, all of them in a JSON list, as text in a column named `rows:json`, which
     * the connection reads as the rows: in thin mode, node-oracledb gives only the prefetched rows of a returned result
     * set with a JSON or a CLOB column (oracle/node-oracledb#1795), and a row's text may be longer than a `VARCHAR2`.
     */
    returnRows(query: string): string[] {
        const numbered = `SELECT cy_q.result, ROWNUM AS cy_n FROM (\n${indent(query)}\n) cy_q`;
        const rows = `COALESCE(JSON_ARRAYAGG(cy_r.result ORDER BY cy_r.cy_n NULL ON NULL RETURNING JSON), JSON('[]'))`;
        return [
            `OPEN ${CURSOR} FOR\n${indent(
                `SELECT JSON_SERIALIZE(${rows} RETURNING CLOB) AS "rows:json" FROM (\n${indent(numbered)}\n) cy_r`
            )};`,
            `DBMS_SQL.RETURN_RESULT(${CURSOR});`
        ];
    }

    raise(message: string): string {
        return `RAISE_APPLICATION_ERROR(-20000, ${literal(message)});`;
    }

    /** A text that is no number, read as one: Oracle fails with ORA-01722, the text in its detail. */
    failure(message: string, value: string): string {
        return `TO_NUMBER(${literal(`${message} `)} || TO_CHAR(${value}))`;
    }

    idOf(json: string, key?: string): string {
        return `JSON_VALUE(${json}, ${key !== undefined ? path(key) : "'$'"} RETURNING NUMBER)`;
    }

    appended(list: string, item: string): string {
        return `JSON_TRANSFORM(${list}, APPEND '$' = ${item})`;
    }

    stripNulls(json: string): string {
        return `JSON_MERGEPATCH(JSON('{}'), ${json} RETURNING JSON)`;
    }

    merged(props: string, map: string): string {
        return `JSON_MERGEPATCH(${props}, ${map} RETURNING JSON)`;
    }

    withoutLabel(labels: string, label: string): string {
        return `JSON_TRANSFORM(${labels}, REMOVE ${literal(`$[*]?(@ == ${quoted(label)})`)})`;
    }

    /**
     * The CLOB `text` reversed as a JSON text: cut into pieces of {@link REVERSED_PIECE} of its UTF-16 units, each a
     * `VARCHAR2` reversed by {@link reverseText}, and the pieces put together last to first.
     *
     * A CLOB counts a character past U+FFFF as two units, and refuses a cut that starts between them (ORA-22831), so a
     * piece that would end on the first of two takes the second too, and the next starts after it: `REGEXP_SUBSTR` reads
     * the character at a unit, two units where one starts there, and from that unit, not from the text's start, so each
     * piece of a long text takes as long.
     *
     * The pieces are put together as a JSON list, each after an `x`, written in ASCII: a `","x` in it is then only ever
     * between two of them, as a quote in a text is written `\"`, so removing each, and the first `x`, leaves a list of
     * one text, which is read as JSON. A null text has one piece, as a hierarchical query has a first row, which is left
     * out, so the list is null, and so is the text. Written otherwise, a character past U+FFFF whose two units are the
     * 4,000th and the 4,001st of a CLOB Oracle has made, as a CLOB put together or cut is, comes out of `JSON_SCALAR`,
     * `JSON_ARRAY` and `JSON_OBJECT` as two U+FFFD; in ASCII it is written `\uD83D\uDE00`, and read back whole. The
     * pieces are `VARCHAR2`s.
     */
    private reversedPieces(text: string): string {
        const pairStarts = (unit: string): string => `LENGTH(REGEXP_SUBSTR(${text}, '.', ${unit}, 1, 'n')) = 2`;
        const first = `((LEVEL - 1) * ${REVERSED_PIECE} + 1 + CASE WHEN LEVEL > 1 AND ${pairStarts(
            `(LEVEL - 1) * ${REVERSED_PIECE}`
        )} THEN 1 ELSE 0 END)`;
        const last = `(LEVEL * ${REVERSED_PIECE} + CASE WHEN ${pairStarts(
            `LEVEL * ${REVERSED_PIECE}`
        )} THEN 1 ELSE 0 END)`;
        const cut = `SELECT LEVEL n, DBMS_LOB.SUBSTR(${text}, ${last} - ${first} + 1, ${first}) s FROM DUAL CONNECT BY LEVEL <= CEIL(LENGTH(${text}) / ${REVERSED_PIECE})`;
        const joined = `JSON_SERIALIZE(JSON_ARRAYAGG('x' || rv_reversed.r ORDER BY rv_reversed.n DESC RETURNING JSON) RETURNING CLOB ASCII)`;
        return (
            `(SELECT JSON_QUERY(JSON(REPLACE(REPLACE(${joined}, '","x'), '["x', '["')), '$[0]' RETURNING JSON) ` +
            `FROM (SELECT rv_piece.n, ${this.reverseText(
                'rv_piece.s'
            )} r FROM (${cut}) rv_piece WHERE rv_piece.s IS NOT NULL) rv_reversed)`
        );
    }

    /** The value at `keys` in the JSON `json`: a text read with one path from `json` written out as text, anything else as JSON. */
    private throughText(json: string, keys: string[]): string {
        return this.shared([json], ([x]) => {
            const at = pathTo(keys);
            return (
                `CASE WHEN JSON_VALUE(${x}, ${pathTo(keys, '.type()')}) = 'string' ` +
                `THEN JSON(JSON_QUERY(JSON_SERIALIZE(${x} RETURNING CLOB), ${at} RETURNING CLOB)) ` +
                `ELSE JSON_QUERY(${x}, ${at} RETURNING JSON) END`
            );
        });
    }

    private functionOf(name: string, json: string): string | undefined {
        const functions: Record<string, () => string> = {
            // A text past 4,000 bytes, null as a VARCHAR2, is measured as a CLOB (liberation-data/drivine#347).
            size: () =>
                `CASE ${kind(json)} WHEN 'array' THEN JSON_SCALAR(JSON_VALUE(${json}, '$.size()' RETURNING NUMBER)) ` +
                `WHEN 'string' THEN JSON_SCALAR(COALESCE(LENGTH(JSON_VALUE(${json}, '$')), LENGTH(JSON_VALUE(${json}, '$' RETURNING CLOB)))) END`,
            tolower: () => this.texts([json], ([t]) => this.scalar(`LOWER(${t})`)),
            toupper: () => this.texts([json], ([t]) => this.scalar(`UPPER(${t})`)),
            trim: () => this.texts([json], ([t]) => this.scalar(`TRIM(${t})`)),
            // A text past 4,000 bytes, which asText reads as null, is read as a CLOB.
            tostring: () => `COALESCE(JSON_SCALAR(${this.asText(json)}), JSON_SCALAR(${this.longText(json)}))`,
            tointeger: () => `JSON_SCALAR(TRUNC(TO_NUMBER(JSON_VALUE(${json}, '$') DEFAULT NULL ON CONVERSION ERROR)))`,
            tofloat: () => `JSON_SCALAR(TO_BINARY_DOUBLE(JSON_VALUE(${json}, '$') DEFAULT NULL ON CONVERSION ERROR))`,
            head: () => `JSON_QUERY(${json}, '$[0]' RETURNING JSON)`,
            last: () => `JSON_QUERY(${json}, '$[last]' RETURNING JSON)`,
            abs: () =>
                `CASE WHEN ${kind(json)} = 'double' THEN JSON_SCALAR(ABS(TO_BINARY_DOUBLE(${this.number(json)}))) ` +
                `ELSE JSON_SCALAR(ABS(${this.number(json)})) END`,
            keys: () => this.keys(json)
        };
        return Object.prototype.hasOwnProperty.call(functions, name) ? functions[name]() : undefined;
    }

    /**
     * `round` of `number` to `precision` places, or `number` itself where those places are past its digits: Oracle's
     * `NUMBER` stops near 10^126, so `ROUND(n, 400)`, and the scale `10^p` a mode rounds by, overflow (ORA-01426) where
     * Neo4j gives the number back. Neo4j rounds a double, of {@link DOUBLE_DIGITS} significant digits at most, so
     * rounding it to places past its last digit changes nothing; a number Oracle holds to more digits is a double again
     * once rounded. Oracle works out only the branch of a CASE a row takes, so the overflowing one is never reached.
     * Short of its digits, a tiny number may still take more than {@link MOST_PLACES} places, as 1.0E-120 to 130 does:
     * it is rounded moved that many places fewer to the right, then moved back, which is exact in decimal.
     *
     * The places are past its digits where the number is at least `10^(17 - p)`, compared in decimal: `LOG` would count
     * them, but fails on zero and on numbers as small as 1.0E-129 (ORA-01428). `POWER` gives 0 for a scale past `NUMBER`'s
     * least, so zero is given back to places that many, and rounded short of them: 0 either way. The precision is read
     * first, in a WHEN of its own, as Oracle tries them in order and stops at the first that holds: a null one gives null
     * for zero too. One out of range is failed before a number is rounded, and reaches here only for a null.
     */
    private pastItsDigits(number: string, precision: string, round: (n: string, p: string) => string): string {
        return this.shared([number, precision], ([n, p]) => {
            const shift = `POWER(10, GREATEST(${p} - ${MOST_PLACES}, 0))`;
            const rounded = round(`(${n} * ${shift})`, `(${p} - GREATEST(${p} - ${MOST_PLACES}, 0))`);
            return `CASE WHEN ${p} IS NULL THEN NULL WHEN ABS(${n}) >= POWER(10, ${DOUBLE_DIGITS} - ${p}) THEN ${n} ELSE ${rounded} / ${shift} END`;
        });
    }

    /** The JSON `json` as a CLOB, where it is a string: a text of any length, slower to read than {@link text}'s `VARCHAR2`. */
    private longText(json: string): string {
        return this.shared(
            [json],
            ([x]) => `CASE WHEN ${kind(x)} = 'string' THEN JSON_VALUE(${x}, '$' RETURNING CLOB) END`
        );
    }

    /** The JSON `json` as text, where it is a string: a CLOB where `clob`, else as {@link text} reads it; a property by its own path (see `direct`). */
    private textOf(json: string, clob: boolean): string {
        return direct(clob ? this.longText(json) : this.text(json), json);
    }

    /**
     * Two texts put together, as `VARCHAR2`s where both are read so and their sum fits in one, 4,000 bytes; else as a CLOB
     * (liberation-data/drivine#347), where a text past 4,000 bytes was left out as null, and a longer sum failed
     * (ORA-01489). Whether they fit is told from the sides' own texts, short to read: a number may be written otherwise
     * ({@link asText}), though in at most {@link NUMBER_TEXT} bytes. A text the statement gives is as long as it is, and
     * not read for each row.
     */
    private textSum(a: string, b: string, given: [unknown, unknown]): string {
        const swapped: [unknown, unknown] = [given[1], given[0]];
        const bytes = (json: string, side: unknown): string =>
            typeof side === 'string' ? Buffer.byteLength(side, 'utf8').toString() : `LENGTHB(JSON_VALUE(${json}, '$'))`;
        const fits = `${bytes(a, given[0])} + ${bytes(b, given[1])} <= ${SHORT_TEXT - 2 * NUMBER_TEXT}`;
        const short = `${this.summed(a, given, true)} || ${this.summed(b, swapped, true)}`;
        const whole = `TO_CLOB(${this.summed(a, given, false)}) || ${this.summed(b, swapped, false)}`;
        // Two empty texts are null together, as Oracle's empty text is, and not an empty CLOB.
        const empty = `JSON_VALUE(${a}, '$.length()') = 0 AND JSON_VALUE(${b}, '$.length()') = 0`;
        return `CASE WHEN ${fits} THEN JSON_SCALAR(${short}) WHEN ${empty} THEN NULL ELSE JSON_SCALAR(${whole}) END`;
    }

    /**
     * The side `json` of a `+` whose sides the statement gives as `given`, this side first, as text: see `summedText`. A
     * text as a `VARCHAR2` where `short`, null past 4,000 bytes, and else as a CLOB; a number's text is short.
     */
    private summed(json: string, given: [unknown, unknown], short: boolean): string {
        return this.summedText(
            json,
            given[0],
            given[1],
            (it) => (short ? `JSON_VALUE(${it}, '$')` : `JSON_VALUE(${it}, '$' RETURNING CLOB)`),
            (it) =>
                short
                    ? this.asText(it)
                    : `CASE WHEN ${kind(
                          it
                      )} = 'string' THEN JSON_VALUE(${it}, '$' RETURNING CLOB) ELSE TO_CLOB(${this.asText(it)}) END`
        );
    }

    /**
     * The JSON `json`, a text, a number or a truth value, as `toString` gives it: a float (a double, or a number with a
     * fraction) as Java writes a double, from the shortest decimal Oracle writes it as, with no exponent from 10^-3 up to
     * 10^7, and else as `1.0E7`, `1.2E-4`; NaN and the infinities by Java's names. A double past a `NUMBER`'s range,
     * `1e300`, is written from Oracle's own text of it, its shortest digits, `1E+300`.
     */
    private asText(json: string): string {
        return this.shared([json], ([x]) => {
            const written = `JSON_VALUE(${x}, '$')`;
            const float = `${kind(x)} = 'double' OR (${kind(x)} = 'number' AND NOT ${this.integral(x)})`;
            const n = `TO_NUMBER(${written} DEFAULT NULL ON CONVERSION ERROR)`;
            const double = `JSON_VALUE(${x}, '$' RETURNING BINARY_DOUBLE)`;
            // Past a NUMBER's range, which reads 1e-200 as 0, the double's own text, with a point where it has none:
            // `1E-310`. TO_CHAR of the double writes 15 digits, so 1e-310 as 9.99999999999997E-311.
            const scientific = this.scientific(
                `NVL(TO_CHAR(NULLIF(${n}, 0), 'FM9.9999999999999999EEEE'), REGEXP_REPLACE(${written}, '^(-?[0-9]+)E', '\\1.0E'))`
            );
            return (
                `CASE WHEN ${kind(
                    x
                )} = 'double' AND ${written} IN ('Nan', 'Inf', '-Inf') THEN DECODE(${written}, 'Nan', 'NaN', 'Inf', 'Infinity', '-Infinity') ` +
                `WHEN ${float} THEN CASE WHEN ${double} = 0 THEN '0.0' WHEN ABS(${n}) >= 0.001 AND ABS(${n}) < 10000000 THEN TO_CHAR(${n}, '${PLAIN_FLOAT}') ELSE ${scientific} END ` +
                `ELSE ${written} END`
            );
        });
    }

    /** `TO_CHAR`'s scientific notation, `1.E+07`, `-1.2E-04`, as Java's: `1.0E7`, `-1.2E-4`. */
    private scientific(text: string): string {
        return `REGEXP_REPLACE(REPLACE(${text}, '.E', '.0E'), 'E\\+?(-?)0*([0-9])', 'E\\1\\2')`;
    }

    /**
     * A JSON path reads no map's keys, so they are read from the map's data guide: each path it lists one step from the
     * top is a key, written `$.name`, or `$."…"` as JSON writes a string where the name is any other. The map is bound
     * first: the data guide's query reads a column of a row outside it, and not an expression of one. The guide's paths
     * are read by their places, as {@link temporalElements} reads them: a `JSON_TABLE` over the guide of a map that holds
     * a list of temporal values worked out item by item stalls the parse as one over the list does (#331, #347). They are
     * so read for every map, not only one the statement makes hold such a list: over the guide, which a subquery gives,
     * they are read many times faster than `JSON_TABLE` reads them (`keys(n)` of 100,000 nodes: 0.4 s, not 4.8 s). Null
     * has no keys, and gives null.
     */
    private keys(json: string): string {
        return this.bound([json], ([map]) => `CASE WHEN ${kind(map)} = 'object' THEN ${this.keysOf(map)} END`);
    }

    private keysOf(json: string): string {
        const key = `CASE WHEN SUBSTR(d.p, 3, 1) = '"' THEN JSON_VALUE(JSON(SUBSTR(d.p, 3)), '$') ELSE SUBSTR(d.p, 3) END`;
        const paths = this.temporalElements(`(SELECT JSON_DATAGUIDE(${json}, 2) FROM DUAL)`, 'dg');
        const guide = `(SELECT JSON_VALUE(dg.item, '$."o:path"' RETURNING VARCHAR2(4000)) AS p FROM ${paths}) d`;
        const topLevel = `REGEXP_LIKE(d.p, '^\\$\\.(\\w+|"([^"\\\\]|\\\\.)*")$')`;
        return `(SELECT COALESCE(JSON_ARRAYAGG(g.k ORDER BY g.k RETURNING JSON), JSON('[]')) FROM (SELECT ${key} AS k FROM ${guide} WHERE ${topLevel}) g)`;
    }
}
