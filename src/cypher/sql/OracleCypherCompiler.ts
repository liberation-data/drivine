import { DrivineError } from '@/DrivineError';
import { holdsLabel } from '@/backend/oracle/OracleGraph';
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

/** The function a query declares that compares two values that may hold a null: see `OracleCypherCompiler.nullsEqual`. */
const NULLS_EQUAL = 'cy_nulls_equal';

/** A key a JSON path writes bare: what SQL would take for an identifier. */
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** How many significant digits a double holds at most, as Neo4j rounds one. */
const DOUBLE_DIGITS = 17;

/** The most places `pastItsDigits` rounds to, whose scale `10^p` is well inside the `NUMBER` range. */
const MOST_PLACES = 100;

/** The words a JSON path reads as values, not keys. */
const JSON_WORDS = ['true', 'false', 'null'];

/** `text` as JSON writes a string. */
function quoted(text: string): string {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The path of the property `key`, as a SQL literal: a key with a dot in it is one key. With `more`, the property each
 * of them leads to in turn, each of a map in the one before: `'$.p.text'`.
 */
function path(key: string, ...more: string[]): string {
    return literal(
        `$${[key, ...more]
            .map((it) => {
                if (it.length === 0) {
                    throw new DrivineError(
                        'A property name is empty: an empty name is no property a statement can read.'
                    );
                }
                return `.${PLAIN_KEY.test(it) && !JSON_WORDS.includes(it) ? it : quoted(it)}`;
            })
            .join('')}`
    );
}

/** The kind of the JSON `json` as Oracle names it, a floating-point number by its own name. */
function kind(json: string): string {
    return `JSON_VALUE(${json}, '$.type()')`;
}

/**
 * Compiles a Cypher statement to SQL over a graph's tables on Oracle: see {@link SqlCypherCompiler}.
 *
 * A value is Oracle's `JSON`, which compares, groups and orders as JSON and keeps a map's keys in the order written.
 * Oracle keeps a number as a number, so a stored `2.0` reads as `2`; a floating-point number the statement writes is a
 * `BINARY_DOUBLE`, and stays one. A text Oracle reads out of JSON is at most 4,000 bytes, and an empty one is null, as
 * Oracle's empty text is. `reduce` is a function the query declares, and does not run in a statement that writes, in
 * the step of a `reduce`, or where its step reads a path.
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

    scalar(sql: string): string {
        return `JSON_SCALAR(${sql})`;
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

    text(json: string): string {
        return this.shared([json], ([x]) => `CASE WHEN ${kind(x)} = 'string' THEN JSON_VALUE(${x}, '$') END`);
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

    aggregateList(value: string, order?: string): string {
        return `COALESCE(JSON_ARRAYAGG(${value}${
            order ? ` ORDER BY ${order}` : ''
        } NULL ON NULL RETURNING JSON), JSON('[]'))`;
    }

    /** `JSON_ARRAYAGG` leaves nulls out. */
    collect(value: string, order?: string): string {
        return `COALESCE(JSON_ARRAYAGG(${value}${order ? ` ORDER BY ${order}` : ''} RETURNING JSON), JSON('[]'))`;
    }

    /**
     * Each item where it is first among those equal to it as `JSON` compares them, kept as it is: not by its text, which is
     * at most 4,000 bytes and keeps a map's keys in the order written, and not read back from it, which would read a float
     * that is a whole number, `2.0`, as the number 2.
     */
    distinctItems(list: string): string {
        return (
            "(SELECT COALESCE(JSON_ARRAYAGG(d.item ORDER BY d.item_no RETURNING JSON), JSON('[]')) " +
            'FROM (SELECT e.item_no, e.item, ROW_NUMBER() OVER (PARTITION BY e.item ORDER BY e.item_no) AS n ' +
            `FROM ${this.elements(list, 'e')}) d WHERE d.n = 1)`
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

    /** In `BINARY_DOUBLE` where either is one, so a float stays a float, as in Cypher: `NUMBER` keeps no such kind. */
    arithmetic(a: string, b: string, operator: string): string {
        return (
            `CASE WHEN ${kind(a)} = 'double' OR ${kind(b)} = 'double' ` +
            `THEN JSON_SCALAR(TO_BINARY_DOUBLE(${this.number(a)}) ${operator} TO_BINARY_DOUBLE(${this.number(b)})) ` +
            `ELSE JSON_SCALAR(${this.number(a)} ${operator} ${this.number(b)}) END`
        );
    }

    add(a: string, b: string, given: [unknown, unknown] = [undefined, undefined]): string {
        return (
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
            )} IN ('string', 'number') THEN JSON_SCALAR(${this.summed(a, given[0], given[1])} || ${this.summed(
                b,
                given[1],
                given[0]
            )}) END`
        );
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
     * By a function the query declares (see {@link reduce}), which walks the two together: Oracle's recursive queries take
     * no `JSON`. A procedure's queries call no function it declares, nor do a `reduce`'s step's: there, two values equal
     * as JSON are null, as each holds a null, and any other two false, as before null was compared item by item:
     * `[null] = [1]` is false there, where Cypher's is null.
     */
    nullsEqual(x: string, y: string, equals: (x: string, y: string) => string): string {
        if (this.procedural || this.folding) {
            return `CASE WHEN ${equals(x, y)} THEN NULL ELSE FALSE END`;
        }
        if (!this.nullsCompared) {
            this.nullsCompared = true;
            this.declare(
                [
                    `FUNCTION ${NULLS_EQUAL}(cy_x JSON, cy_y JSON) RETURN NUMBER IS`,
                    '    FUNCTION eq(a JSON_ELEMENT_T, b JSON_ELEMENT_T) RETURN NUMBER IS',
                    '        r NUMBER := 1;',
                    '        e NUMBER;',
                    '        la JSON_ARRAY_T;',
                    '        lb JSON_ARRAY_T;',
                    '        oa JSON_OBJECT_T;',
                    '        ob JSON_OBJECT_T;',
                    '        ks JSON_KEY_LIST;',
                    '        too_long EXCEPTION;',
                    '        PRAGMA EXCEPTION_INIT(too_long, -40478);',
                    '    BEGIN',
                    '        IF a.is_Null OR b.is_Null THEN RETURN NULL; END IF;',
                    '        IF a.is_Array AND b.is_Array THEN',
                    '            la := TREAT(a AS JSON_ARRAY_T);',
                    '            lb := TREAT(b AS JSON_ARRAY_T);',
                    '            IF la.get_Size <> lb.get_Size THEN RETURN 0; END IF;',
                    '            FOR i IN 0 .. la.get_Size - 1 LOOP',
                    '                e := eq(la.get(i), lb.get(i));',
                    '                IF e = 0 THEN RETURN 0; END IF;',
                    '                IF e IS NULL THEN r := NULL; END IF;',
                    '            END LOOP;',
                    '            RETURN r;',
                    '        END IF;',
                    '        IF a.is_Object AND b.is_Object THEN',
                    '            oa := TREAT(a AS JSON_OBJECT_T);',
                    '            ob := TREAT(b AS JSON_OBJECT_T);',
                    '            IF oa.get_Size <> ob.get_Size THEN RETURN 0; END IF;',
                    '            ks := oa.get_Keys;',
                    '            FOR i IN 1 .. ks.COUNT LOOP',
                    '                IF NOT ob.has(ks(i)) THEN RETURN 0; END IF;',
                    '                e := eq(oa.get(ks(i)), ob.get(ks(i)));',
                    '                IF e = 0 THEN RETURN 0; END IF;',
                    '                IF e IS NULL THEN r := NULL; END IF;',
                    '            END LOOP;',
                    '            RETURN r;',
                    '        END IF;',
                    '        IF a.is_Number AND b.is_Number THEN RETURN CASE WHEN a.to_Number = b.to_Number THEN 1 ELSE 0 END; END IF;',
                    // As VARCHAR2s, three times as fast as CLOBs; as CLOBs where one is past 32 KB, which to_String
                    // raises on (ORA-40478).
                    '        IF a.is_String AND b.is_String THEN',
                    '            BEGIN',
                    '                RETURN CASE WHEN a.to_String = b.to_String THEN 1 ELSE 0 END;',
                    '            EXCEPTION WHEN too_long THEN',
                    '                RETURN CASE WHEN DBMS_LOB.COMPARE(a.to_Clob, b.to_Clob) = 0 THEN 1 ELSE 0 END;',
                    '            END;',
                    '        END IF;',
                    '        IF a.is_Boolean AND b.is_Boolean THEN RETURN CASE WHEN a.to_Boolean = b.to_Boolean THEN 1 ELSE 0 END; END IF;',
                    '        RETURN 0;',
                    '    END;',
                    'BEGIN',
                    '    RETURN eq(JSON_ELEMENT_T.parse(JSON_SERIALIZE(cy_x RETURNING CLOB)), JSON_ELEMENT_T.parse(JSON_SERIALIZE(cy_y RETURNING CLOB)));',
                    'END;'
                ].join('\n')
            );
        }
        return `(${NULLS_EQUAL}(${x}, ${y}) = 1)`;
    }

    modulo(a: string, b: string): string {
        return `MOD(${a}, ${b})`;
    }

    startsWith(a: string, b: string): string {
        return this.shared([b], ([x]) => `(SUBSTR(${a}, 1, LENGTH(${x})) = ${x})`);
    }

    endsWith(a: string, b: string): string {
        return this.shared([b], ([x]) => `(SUBSTR(${a}, -LENGTH(${x})) = ${x})`);
    }

    containsText(a: string, b: string): string {
        return `(INSTR(${a}, ${b}) > 0)`;
    }

    function(name: string, json: string): string | undefined {
        const functions: Record<string, () => string> = {
            size: () =>
                `CASE ${kind(json)} WHEN 'array' THEN JSON_SCALAR(JSON_VALUE(${json}, '$.size()' RETURNING NUMBER)) ` +
                `WHEN 'string' THEN JSON_SCALAR(LENGTH(JSON_VALUE(${json}, '$'))) END`,
            tolower: () => `JSON_SCALAR(LOWER(${this.text(json)}))`,
            toupper: () => `JSON_SCALAR(UPPER(${this.text(json)}))`,
            trim: () => `JSON_SCALAR(TRIM(${this.text(json)}))`,
            tostring: () => `JSON_SCALAR(${this.asText(json)})`,
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

    /** The text as JSON writes it, with each separator as JSON writes it made the end of one string and the start of the next. */
    split(text: string, separator: string): string {
        return this.shared([text, separator], ([t, s]) => {
            const written = `JSON_SERIALIZE(JSON_SCALAR(${t}))`;
            const separatorWritten = `SUBSTR(JSON_SERIALIZE(JSON_SCALAR(${s})), 2, LENGTH(JSON_SERIALIZE(JSON_SCALAR(${s}))) - 2)`;
            return `CASE WHEN ${t} IS NOT NULL AND ${s} IS NOT NULL THEN JSON('[' || REPLACE(${written}, ${separatorWritten}, '","') || ']') END`;
        });
    }

    /** Oracle has no reverse of a text that it documents: its characters, read from the last. */
    reverseText(text: string): string {
        return this.shared(
            [text],
            ([t]) =>
                `(SELECT LISTAGG(SUBSTR(${t}, LEVEL, 1)) WITHIN GROUP (ORDER BY LEVEL DESC) FROM DUAL CONNECT BY LEVEL <= LENGTH(${t}))`
        );
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

    /** The side `json` of a `+` that the statement gives as `given`, and the other side as `other`, as text: see `summedText`. */
    private summed(json: string, given: unknown, other: unknown): string {
        return this.summedText(
            json,
            given,
            other,
            (it) => `JSON_VALUE(${it}, '$')`,
            (it) => this.asText(it)
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
     * first: the data guide's query reads a column of a row outside it, and not an expression of one. Null has no keys,
     * and gives null.
     */
    private keys(json: string): string {
        return this.bound([json], ([map]) => `CASE WHEN ${kind(map)} = 'object' THEN ${this.keysOf(map)} END`);
    }

    private keysOf(json: string): string {
        const key = `CASE WHEN SUBSTR(d.p, 3, 1) = '"' THEN JSON_VALUE(JSON(SUBSTR(d.p, 3)), '$') ELSE SUBSTR(d.p, 3) END`;
        const guide = `JSON_TABLE((SELECT JSON_DATAGUIDE(${json}, 2) FROM DUAL), '$[*]' COLUMNS (p VARCHAR2(4000) PATH '$."o:path"')) d`;
        const topLevel = `REGEXP_LIKE(d.p, '^\\$\\.(\\w+|"([^"\\\\]|\\\\.)*")$')`;
        return `(SELECT COALESCE(JSON_ARRAYAGG(g.k ORDER BY g.k RETURNING JSON), JSON('[]')) FROM (SELECT ${key} AS k FROM ${guide} WHERE ${topLevel}) g)`;
    }
}
