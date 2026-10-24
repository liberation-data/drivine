import { DrivineError } from '@/DrivineError';
import { holdsLabel } from '@/backend/oracle/OracleGraph';
import { Stamps } from '@/model/Stamps';
import { CypherFloat } from '@/cypher/ast/Expression';
import { indent, literal } from '@/cypher/sql/CypherSyntax';
import { jsonText } from '@/cypher/sql/JsonText';
import { OracleTemporalSql } from '@/cypher/sql/OracleTemporalSql';
import { PARAMETERS_OBJECT } from '@/cypher/sql/Parameters';
import { Procedure, ProcedureCall, Steps, Walk, Walked } from '@/cypher/sql/Procedure';
import { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { TemporalSql } from '@/cypher/sql/TemporalSql';
import { JsonValue, NodeValue } from '@/cypher/sql/Value';

const { PARAMS, ROWS, OUT, ROW, VALUE, ID, COUNT, FOUND, SAVED, GATHERED, CALLER, NESTING, DOOMED }: typeof Procedure =
    Procedure;

/** The cursor a procedure returns its rows by. */
const CURSOR = 'cy_cursor';

/** A key a JSON path writes bare: what SQL would take for an identifier. */
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The words a JSON path reads as values, not keys. */
const JSON_WORDS = ['true', 'false', 'null'];

/** `text` as JSON writes a string. */
function quoted(text: string): string {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** The path of the property `key`, as a SQL literal: a key with a dot in it is one key. */
function path(key: string): string {
    if (key.length === 0) {
        throw new DrivineError('A property name is empty: an empty name is no property a statement can read.');
    }
    return literal(`$.${PLAIN_KEY.test(key) && !JSON_WORDS.includes(key) ? key : quoted(key)}`);
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
    readonly temporalSql: TemporalSql = new OracleTemporalSql(this.sharedList);
    readonly noIds = "','";
    /** `ROW_NUMBER()` takes an order of its own; `ROWNUM` counts the rows as the query gives them. */
    readonly rowNumber = 'ROWNUM';

    /** Oracle's recursive queries read nothing of the row they are in. */
    readonly walksReadRow: boolean = false;

    /** Whether the step of a `reduce` is being written, as its function's own: see {@link reduce}. */
    private folding = false;

    literalJson(value: any): string {
        return value instanceof CypherFloat
            ? `JSON_SCALAR(TO_BINARY_DOUBLE(${literal(value.toString())}))`
            : `JSON(${literal(jsonText(value))})`;
    }

    parameterJson(marker: string): string {
        return `JSON(${marker})`;
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

    /** Of the values of the kind that comes first, or last, as `kindOrder` orders them. */
    extreme(value: string, min: boolean): string {
        return (
            `${min ? 'MIN' : 'MAX'}(${this.nullIfJsonNull(value)}) KEEP (DENSE_RANK FIRST ORDER BY ${this.kindOrder(
                value
            )} ` + `${min ? 'ASC' : 'DESC'} NULLS LAST)`
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

    add(a: string, b: string): string {
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
            )} IN ('string', 'number') THEN JSON_SCALAR(JSON_VALUE(${a}, '$') || JSON_VALUE(${b}, '$')) END`
        );
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
            // A float that is a whole number is written with its fraction, 2.0, as in Cypher: Oracle writes a double of 2 as
            // 2. Whole as the double it is: a double too small for a NUMBER, 1e-200, is the NUMBER 0.
            tostring: () =>
                this.shared([json], ([x]) => {
                    const n = `JSON_VALUE(${x}, '$' RETURNING NUMBER)`;
                    return (
                        `CASE WHEN ${kind(
                            x
                        )} = 'double' AND ABS(${n}) < 1e15 AND JSON_VALUE(${x}, '$' RETURNING BINARY_DOUBLE) = TRUNC(${n}) ` +
                        `THEN JSON_SCALAR(TO_CHAR(TRUNC(${n})) || '.0') ELSE JSON_SCALAR(JSON_VALUE(${x}, '$')) END`
                    );
                }),
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

    /** Flags the pattern opens with, `(?i)`, are Oracle's match parameter, Java's `s` its `n`. */
    matches(text: string, pattern: string): string {
        return this.shared([pattern], ([p]) => {
            const flags = `REGEXP_SUBSTR(${p}, '^\\(\\?([a-z]+)\\)', 1, 1, NULL, 1)`;
            return `REGEXP_LIKE(${text}, '^(' || REGEXP_REPLACE(${p}, '^\\(\\?[a-z]+\\)', '') || ')$', NVL(REPLACE(${flags}, 's', 'n'), 'c'))`;
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
            `    ${PARAMS} JSON := JSON($${PARAMETERS_OBJECT});`,
            `    ${ROWS} JSON;`,
            `    ${OUT} JSON;`,
            `    ${ROW} JSON;`,
            `    ${VALUE} JSON;`,
            `    ${ID} NUMBER;`,
            `    ${COUNT} NUMBER;`,
            `    ${FOUND} BOOLEAN;`,
            `    ${DOOMED} JSON;`,
            `    ${CURSOR} SYS_REFCURSOR;`,
            ...saved.flat(),
            'BEGIN',
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
