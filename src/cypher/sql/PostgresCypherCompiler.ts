import { createHash } from 'crypto';
import { Stamps } from '@/model/Stamps';
import { indent, literal, RADIANS_TO_DEGREES } from '@/cypher/sql/CypherSyntax';
import { jsonText } from '@/cypher/sql/JsonText';
import { PARAMETERS_OBJECT } from '@/cypher/sql/Parameters';
import { PostgresTemporalSql } from '@/cypher/sql/PostgresTemporalSql';
import { Procedure, ProcedureCall, Steps, Walk, Walked } from '@/cypher/sql/Procedure';
import { PLAIN_FLOAT, SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { TemporalSql } from '@/cypher/sql/TemporalSql';
import { JsonValue, NodeValue } from '@/cypher/sql/Value';

const {
    PARAMS,
    ROWS,
    OUT,
    ROW,
    VALUE,
    ID,
    COUNT,
    FOUND,
    SAVED,
    GATHERED,
    CALLER,
    NESTING,
    DOOMED,
    RECORD,
    MATCHED
}: typeof Procedure = Procedure;

/** A text Postgres reads as a `numeric`, spaces around it allowed. */
const NUMERIC_TEXT = '^\\s*[+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?\\s*$';

/**
 * Below it, `exp` is nearer 0 than the least double, half of 2^-1074, and Java gives 0.0: ln(2^-1075) is
 * -745.13321910194120…, and this is the least double Java's `exp` gives more than 0.0 for.
 */
const EXP_UNDERFLOW = '-745.1332191019411';

/** A property read as `propertyOf` reads it, `(alias.props -> 'key')`: its row's column, and its key's literal. */
const READ_PROPERTY = /^\(([\w.]+) -> ('(?:[^']|'')*')\)$/;

/**
 * Compiles a Cypher statement to SQL over a graph's tables on Postgres: see {@link SqlCypherCompiler}.
 *
 * A value is `jsonb`, which compares, groups and orders as JSON. A map or a list the statement builds is `json`, which
 * keeps its keys in the order written, and is cast to `jsonb` where it is compared. A list of ids is an array of
 * `bigint`. A statement that writes carries its rows as `jsonb`, so a map carried past a write has its keys in
 * `jsonb`'s order.
 */
export class PostgresCypherCompiler extends SqlCypherCompiler {
    readonly temporalSql: TemporalSql = new PostgresTemporalSql(this.sharedList);
    readonly noIds = 'CAST(ARRAY[] AS bigint[])';
    readonly rowNumber = 'ROW_NUMBER() OVER ()';

    /**
     * Each float in it that is a whole number written out in full with a fraction, `10000000.0`: as JavaScript writes
     * `1e21`, `jsonb` reads it as a whole number, which is then read back as an integer. See {@link jsonText}.
     */
    literalJson(value: any): string {
        return `CAST(${literal(jsonText(value, true))} AS jsonb)`;
    }

    parameterText(value: any): string {
        return jsonText(value, true);
    }

    parameterJson(marker: string): string {
        return `CAST(${marker} AS jsonb)`;
    }

    parameterCount(marker: string): string {
        return `CAST(${marker} AS bigint)`;
    }

    comparable(value: JsonValue): string {
        return value.ordered ? `CAST(${value.sql} AS jsonb)` : value.sql;
    }

    scalar(sql: string): string {
        return `to_jsonb(${sql})`;
    }

    typeOf(json: string): string {
        return `jsonb_typeof(${json})`;
    }

    isJsonNull(json: string): string {
        return `COALESCE(jsonb_typeof(${json}), 'null') = 'null'`;
    }

    nullIfJsonNull(json: string): string {
        return `NULLIF(${json}, 'null'::jsonb)`;
    }

    number(json: string): string {
        return this.shared(
            [json],
            ([x]) => `CASE WHEN jsonb_typeof(${x}) = 'number' THEN CAST(${x} #>> '{}' AS numeric) END`
        );
    }

    integral(json: string): string {
        return this.shared([json], ([x]) => `(jsonb_typeof(${x}) = 'number' AND (${x} #>> '{}') ~ '^-?[0-9]+$')`);
    }

    text(json: string): string {
        return this.shared([json], ([x]) => `CASE WHEN jsonb_typeof(${x}) = 'string' THEN ${x} #>> '{}' END`);
    }

    boolOf(json: string): string {
        return this.shared([json], ([x]) => `CASE WHEN jsonb_typeof(${x}) = 'boolean' THEN CAST(${x} AS boolean) END`);
    }

    /**
     * A `numeric` with a fraction, so a whole one is written `2.0`, as a graph engine writes a float, and stays one in
     * arithmetic; without the zeros its scale leaves after its digits (`trim_scale`), so `avg` of whole numbers is
     * `1999.0`, not `1999.0000000000000000`.
     */
    float(sql: string): string {
        return `(trim_scale(CAST(${sql} AS numeric)) + 0.0)`;
    }

    /**
     * As any store works it out, in `numeric`, and a quotient without the zeros `numeric`'s division leaves after its
     * digits: `4.0 / 2` is `2.0`, not `2.0000000000000000`. Postgres works a float out exactly, so a result may differ from
     * a double's in the last digits: `0.1 * 3` is `0.3`, where Cypher gives `0.30000000000000004` (drivine4j#188).
     */
    arithmetic(a: string, b: string, operator: string): string {
        return operator === '/'
            ? this.scalar(this.float(`(${this.number(a)} / ${this.number(b)})`))
            : super.arithmetic(a, b, operator);
    }

    jsonArray(items: string[]): string {
        return `json_build_array(${items.join(', ')})`;
    }

    jsonObject(entries: [string, string][]): string {
        return `json_build_object(${entries.map(([key, value]) => `${literal(key)}, ${value}`).join(', ')})`;
    }

    withEntries(json: string, entries: [string, string][]): string {
        return `(${json} || CAST(${this.jsonObject(entries)} AS jsonb))`;
    }

    propertyOf(json: string, key: string): string {
        return `(${json} -> ${literal(key)})`;
    }

    element(json: string, index: string): string {
        return `(${json} -> CAST(${index} #>> '{}' AS int))`;
    }

    keyed(json: string, key: string): string {
        return `${json} -> (${key} #>> '{}')`;
    }

    containsAll(props: string, map: string): string {
        return `${props} @> ${map}`;
    }

    hasLabel(labels: string, label: string): string {
        return `${labels} @> ${literal(jsonText([label]))}`;
    }

    /** The property's text, as a range index or a uniqueness constraint reads it with `->>`, compared with the value's. */
    indexedEquality(property: string, value: string): string | undefined {
        const read = READ_PROPERTY.exec(property);
        return read ? `(${read[1]} ->> ${read[2]}) = (${value} #>> '{}')` : undefined;
    }

    elements(json: string, alias: string): string {
        return `jsonb_array_elements(${json}) WITH ORDINALITY ${alias} (item, item_no)`;
    }

    itemAt(json: string, index: number): string {
        return `(${json} -> ${index})`;
    }

    listSize(json: string): string {
        return `jsonb_array_length(${json})`;
    }

    holdsNull(json: string): string {
        return `jsonb_path_exists(${json}, '$.** ? (@ == null)')`;
    }

    /**
     * The pairs of `x`'s and `y`'s items, and of their items', at any depth, walked together: a list's by place, a map's by
     * key, where the two are lists or maps both. A place or a key that one has and the other has not pairs a value with
     * SQL's null. Each one's items and keys are arrays unnested, so the planner's estimate brings in no JIT.
     */
    nullsEqual(x: string, y: string, equals: (x: string, y: string) => string): string {
        const entries = (json: string, alias: string): string =>
            `SELECT CAST(${alias}e.n AS text) AS k, ${alias}e.v FROM unnest(ARRAY(SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(${json}) = 'array' THEN ${json} END))) WITH ORDINALITY ${alias}e (v, n) ` +
            `UNION ALL SELECT ${alias}o.key, ${json} -> ${alias}o.key FROM unnest(ARRAY(SELECT jsonb_object_keys(CASE WHEN jsonb_typeof(${json}) = 'object' THEN ${json} END))) ${alias}o (key)`;
        const pair =
            "CASE WHEN eqw.a IS NULL OR eqw.b IS NULL THEN FALSE WHEN jsonb_typeof(eqw.a) = 'null' OR jsonb_typeof(eqw.b) = 'null' THEN NULL " +
            `WHEN jsonb_typeof(eqw.a) <> jsonb_typeof(eqw.b) THEN FALSE WHEN jsonb_typeof(eqw.a) IN ('array', 'object') THEN TRUE ELSE ${equals(
                'eqw.a',
                'eqw.b'
            )} END`;
        return (
            `(WITH RECURSIVE eqw (a, b) AS (SELECT ${x}, ${y} UNION ALL ` +
            `SELECT eqp.a, eqp.b FROM eqw CROSS JOIN LATERAL (SELECT eqa.v AS a, eqb.v AS b FROM (${entries(
                'eqw.a',
                'eqa'
            )}) eqa FULL JOIN (${entries('eqw.b', 'eqb')}) eqb ON eqa.k = eqb.k) eqp ` +
            "WHERE jsonb_typeof(eqw.a) = jsonb_typeof(eqw.b) AND jsonb_typeof(eqw.a) IN ('array', 'object')) " +
            `SELECT CASE WHEN bool_or(NOT eqt.v) THEN FALSE WHEN bool_or(eqt.v IS NULL) THEN NULL ELSE TRUE END FROM (SELECT ${pair} AS v FROM eqw) eqt)`
        );
    }

    aggregateList(value: string, order?: string): string {
        return `COALESCE(json_agg(${value}${order ? ` ORDER BY ${order}` : ''}), '[]'::json)`;
    }

    collect(value: string, order?: string): string {
        return `COALESCE(json_agg(${value}${
            order ? ` ORDER BY ${order}` : ''
        }) FILTER (WHERE ${value} IS NOT NULL), '[]'::json)`;
    }

    distinctItems(list: string): string {
        return (
            "(SELECT COALESCE(json_agg(d.item ORDER BY d.first), '[]'::json) " +
            `FROM (SELECT min(e.item_no) AS first, e.item FROM ${this.elements(list, 'e')} GROUP BY e.item) d)`
        );
    }

    firstOfEach(list: string, identities: string): string {
        return (
            `(SELECT ${this.aggregateList('v.item', 'v.item_no')} FROM ${this.elements(list, 'v')} ` +
            `JOIN (SELECT min(e.item_no) AS first FROM ${this.elements(
                identities,
                'e'
            )} GROUP BY e.item) f ON f.first = v.item_no)`
        );
    }

    /**
     * Postgres has no min or max of jsonb, which orders: the first of the values in order is the least, by `key` where
     * there is one.
     */
    extreme(value: string, min: boolean, key?: string): string {
        const direction = min ? 'ASC' : 'DESC';
        return (
            `(array_agg(${value} ORDER BY ${this.kindOrder(value)} ${direction}, ${key ?? value} ${direction}) ` +
            `FILTER (WHERE COALESCE(jsonb_typeof(${value}), 'null') <> 'null'))[1]`
        );
    }

    add(a: string, b: string, given: [unknown, unknown] = [undefined, undefined]): string {
        return (
            `CASE WHEN jsonb_typeof(${a}) = 'number' AND jsonb_typeof(${b}) = 'number' THEN to_jsonb(${this.number(
                a
            )} + ${this.number(b)}) ` +
            `WHEN jsonb_typeof(${a}) = 'array' AND jsonb_typeof(${b}) = 'array' THEN ${a} || ${b} ` +
            `WHEN jsonb_typeof(${a}) = 'array' THEN ${a} || jsonb_build_array(${b}) ` +
            `WHEN jsonb_typeof(${b}) = 'array' THEN jsonb_build_array(${a}) || ${b} ` +
            `WHEN jsonb_typeof(${a}) IN ('string', 'number') AND jsonb_typeof(${b}) IN ('string', 'number') THEN ` +
            `to_jsonb(${this.summed(a, given[0], given[1])} || ${this.summed(b, given[1], given[0])}) END`
        );
    }

    /**
     * A list as `jsonb` that Postgres orders as Cypher orders lists, item by item: each item, from the first, a list of
     * three, of where its kind comes (`itemRank`), the item, and what follows it so written, the end an empty list.
     * `jsonb` orders the shorter of two lists first, and every list here but the last is of three. An item that is a list
     * is followed by its own items, at any depth, then by its end, which comes before any item. Any other value sorts as
     * itself, as before. Only a value the statement makes a list sorts so: the planner costs the walk at thousands a row,
     * which brings in its JIT for a sort of more than a few dozen rows (drivine4j#223).
     */
    listSortKey(json: string): string {
        return this.shared(
            [json],
            ([x]) =>
                `CASE WHEN jsonb_typeof(${x}) = 'array' THEN CAST(${this.listKey(
                    x
                )} AS jsonb) ELSE ${this.nullIfJsonNull(x)} END`
        );
    }

    idTokens(ids: string, key: string): string {
        return `CAST(regexp_replace(CAST(${ids} AS text), '(-?[0-9]+)', ${literal(`{"${key}": \\1}`)}, 'g') AS jsonb)`;
    }

    modulo(a: string, b: string): string {
        return `(${a} % ${b})`;
    }

    startsWith(a: string, b: string): string {
        return `starts_with(${a}, ${b})`;
    }

    endsWith(a: string, b: string): string {
        return this.shared([b], ([x]) => `right(${a}, length(${x})) = ${x}`);
    }

    containsText(a: string, b: string): string {
        return `strpos(${a}, ${b}) > 0`;
    }

    function(name: string, json: string): string | undefined {
        const functions: Record<string, () => string> = {
            keys: () =>
                this.shared(
                    [json],
                    ([x]) =>
                        `CASE WHEN jsonb_typeof(${x}) = 'object' THEN (SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb) FROM jsonb_object_keys(${x}) k) END`
                ),
            size: () =>
                `CASE jsonb_typeof(${json}) WHEN 'array' THEN to_jsonb(jsonb_array_length(${json})) WHEN 'string' THEN to_jsonb(length(${json} #>> '{}')) END`,
            tolower: () => `to_jsonb(lower(${this.text(json)}))`,
            toupper: () => `to_jsonb(upper(${this.text(json)}))`,
            trim: () => `to_jsonb(btrim(${this.text(json)}))`,
            tostring: () => `to_jsonb(${this.asText(json)})`,
            tointeger: () => `to_jsonb(trunc(${this.numeric(json)}))`,
            tofloat: () => `to_jsonb(${this.float(this.numeric(json))})`,
            head: () => `(${json} -> 0)`,
            last: () => `(${json} -> -1)`,
            abs: () => `to_jsonb(abs(${this.number(json)}))`
        };
        return Object.prototype.hasOwnProperty.call(functions, name) ? functions[name]() : undefined;
    }

    page(skip?: string, limit?: string): string[] {
        return [...(skip ? [`OFFSET ${skip}`] : []), ...(limit ? [`LIMIT ${limit}`] : [])];
    }

    ids(id: string): string {
        return `ARRAY[${id}]`;
    }

    joinIds(lists: string[]): string {
        return `(${lists.join(' || ')})`;
    }

    storeIds(json: string): string {
        return this.shared(
            [json],
            ([ids]) =>
                `CASE WHEN ${ids} IS NOT NULL THEN ARRAY(SELECT CAST(x.id AS bigint) FROM jsonb_array_elements_text(${ids}) WITH ORDINALITY x (id, ord) ORDER BY x.ord) END`
        );
    }

    idIn(id: string, list: string): string {
        return `${id} = ANY (${list})`;
    }

    idsOverlap(a: string, b: string): string {
        return `${a} && ${b}`;
    }

    idCount(list: string): string {
        return `to_jsonb(cardinality(${list}))`;
    }

    idRows(list: string, alias: string): string {
        return `unnest(${list}) WITH ORDINALITY ${alias} (id, ord)`;
    }

    /** A lateral recursive query from the node walked from, which reads its row. */
    walk(walk: Walk): Walked {
        const w = walk.step;
        const { joins, reached, distinct }: Steps = this.steps(walk, `${w}.nid`);
        const eids = walk.hops.map((it) => `${it.edge}.eid`);
        const conditions = [
            ...eids.map((it) => `${it} <> ALL (${w}.eids)`),
            ...distinct,
            ...(walk.max !== undefined ? [`${w}.depth < ${walk.max}`] : []),
            ...walk.conditions
        ];
        const text = [
            `WITH RECURSIVE ${w} (nid, depth, nids, eids) AS (`,
            `    SELECT ${walk.from}, 0, ${this.noIds}, ${this.noIds}`,
            '    UNION ALL',
            // Walked backwards, each node it leaves goes first, so its nodes end with the one it started from.
            walk.backwards
                ? `    SELECT ${reached[0]}, ${w}.depth + 1, ${w}.nid || ${w}.nids, ${eids[0]} || ${w}.eids`
                : `    SELECT ${reached[reached.length - 1]}, ${w}.depth + 1, ${w}.nids || ARRAY[${reached.join(
                      ', '
                  )}], ${w}.eids || ARRAY[${eids.join(', ')}]`,
            `    FROM ${w}`,
            ...joins.map((it) => `    ${it}`),
            `    WHERE ${conditions.join(' AND ')}`,
            ')',
            `SELECT nid, nids, eids FROM ${w} WHERE depth >= ${walk.min}`
        ].join('\n');
        return {
            source: `LATERAL (\n${indent(text)}\n) ${walk.name}`,
            condition: `${walk.name}.nid = ${walk.to}`,
            eids: `${walk.name}.eids`,
            nids: `${walk.name}.nids`
        };
    }

    nodeJson(node: NodeValue): string {
        return (
            `CASE WHEN ${node.nid} IS NOT NULL THEN ${node.props} || ` +
            `jsonb_strip_nulls(jsonb_build_object(${literal(Stamps.PROPERTY)}, ${node.stamp})) END`
        );
    }

    /** A recursive query, a row for each item taken, that reads the row it is in, as Postgres's may. */
    reduce(name: string, initial: string, list: string, step: (accumulator: string, item: string) => string): string {
        return this.shared([list], ([items]) => this.fold(name, initial, items, step));
    }

    range(from: string, to: string, step: string): string {
        return (
            `(SELECT COALESCE(jsonb_agg(g ORDER BY o), '[]'::jsonb) FROM generate_series(CAST(${from} AS bigint), ` +
            `CAST(${to} AS bigint), CAST(${step} AS bigint)) WITH ORDINALITY r (g, o))`
        );
    }

    /**
     * Postgres pulls a subquery of no table up into the query that reads it, and writes each of its values out again
     * where it is read: values bound in one another so grow exponentially as it plans, and a duration added to a date
     * read from the store took the server's memory. `OFFSET 0` keeps the subquery apart.
     */
    boundSelect(columns: string): string {
        return `SELECT ${columns} OFFSET 0`;
    }

    /**
     * Flags the pattern opens with, `(?i)`, are put before the anchors, where Postgres reads them, after `p`: a dot
     * matches no line break, as Java's does, unless the pattern says `(?s)`. The anchors are `\A` and `\Z`, the text's
     * start and end, which `(?m)` leaves as they are: it lets the pattern's own `^` and `$` match at a line break.
     * Postgres's `s` and `m` each undo the other, so the two together end in `w`, which keeps both.
     */
    matches(text: string, pattern: string): string {
        const anchored = `regexp_replace(${pattern}, '^(\\(\\?([a-z]+)\\))?(.*)$', '(?p\\2)\\\\A(\\3)\\\\Z')`;
        return `(${text} ~ regexp_replace(${anchored}, '^\\(\\?([a-z]*(s[a-z]*m|m[a-z]*s)[a-z]*)\\)', '(?\\1w)'))`;
    }

    /**
     * An empty separator cuts the text at each character, as Cypher's does: `string_to_array` does so for a null one.
     * The empty text is a list of itself, where `string_to_array` gives an empty one.
     */
    split(text: string, separator: string): string {
        return this.shared(
            [text, separator],
            ([t, s]) =>
                `CASE WHEN ${s} IS NOT NULL THEN CASE WHEN ${t} = '' THEN jsonb_build_array(${t}) ELSE to_jsonb(string_to_array(${t}, NULLIF(${s}, ''))) END END`
        );
    }

    reverseText(text: string): string {
        return `reverse(${text})`;
    }

    uuid(): string {
        return 'CAST(gen_random_uuid() AS text)';
    }

    /**
     * Worked out as a `double precision`, as Neo4j works it out as a Java double, and written back as the text of that
     * double: a cast to `numeric` would keep 15 of its digits. Postgres fails where Neo4j gives NaN or an infinity,
     * `ln(0)`, `sqrt(-1)`, `asin(2)`, `exp(1000)` and `1 / tan(0)` among them, but for an exponent too small for a
     * double, which Neo4j gives as 0.0, and Postgres would fail on as an underflow.
     */
    math(name: string, numbers: string[]): string {
        const doubles = numbers.map((it) => `CAST(${it} AS double precision)`);
        const x = doubles[0];
        const functions: Record<string, () => string> = {
            exp: () => this.shared([x], ([d]) => `CASE WHEN ${d} < ${EXP_UNDERFLOW} THEN 0 ELSE exp(${d}) END`),
            log: () => `ln(${x})`,
            log10: () => `log(${x})`,
            cot: () => `(1 / tan(${x}))`,
            haversin: () => `((1 - cos(${x})) / 2)`,
            // By the ratio Java multiplies by, where Postgres divides by its inverse: see RADIANS_TO_DEGREES.
            degrees: () => `(${x} * CAST(${RADIANS_TO_DEGREES} AS double precision))`,
            atan2: () => `atan2(${x}, ${doubles[1]})`
        };
        const result = Object.prototype.hasOwnProperty.call(functions, name) ? functions[name]() : `${name}(${x})`;
        return this.float(`CAST(${result} AS text)`);
    }

    rightText(text: string, count: string): string {
        return `right(${text}, ${count})`;
    }

    /**
     * A function of the session's own, `pg_temp`, made for the procedure and called: Postgres runs a block that returns
     * rows or takes parameters no other way. It is named for its text, so a statement run again replaces it with itself.
     * It is made before the statement that calls it, which binds the parameters: Postgres's driver binds a statement of
     * one command.
     */
    procedure(body: string[]): ProcedureCall {
        const saved = Array.from({ length: NESTING }, (_, i) => [
            `    ${SAVED}${i + 1} jsonb;`,
            `    ${GATHERED}${i + 1} jsonb;`,
            `    ${CALLER}${i + 1} jsonb;`
        ]);
        const text = [
            '#variable_conflict use_column',
            'DECLARE',
            `    ${ROWS} jsonb;`,
            `    ${OUT} jsonb;`,
            `    ${ROW} jsonb;`,
            `    ${VALUE} jsonb;`,
            `    ${ID} bigint;`,
            `    ${COUNT} bigint;`,
            `    ${FOUND} boolean;`,
            `    ${DOOMED} jsonb;`,
            `    ${RECORD} record;`,
            `    ${MATCHED} record;`,
            ...saved.flat(),
            'BEGIN',
            indent(body.join('\n')),
            'END'
        ].join('\n');
        const digest = createHash('sha256').update(text).digest('hex');
        const fn = `pg_temp.drivine_cypher_${digest.substring(0, 24)}`;
        // The body is quoted with dollars, by a tag no text in it holds: a text of `$cy$` would end it early.
        let quote = '$cy$';
        for (let i = 1; text.includes(quote); i++) {
            quote = `$cy${i}$`;
        }
        return {
            setup: [
                `CREATE OR REPLACE FUNCTION ${fn}(${PARAMS} jsonb) RETURNS SETOF json LANGUAGE plpgsql AS ${quote}\n${text}\n${quote};`
            ],
            sql: `SELECT cy.result FROM ${fn}(CAST($${PARAMETERS_OBJECT} AS jsonb)) AS cy (result)`
        };
    }

    returnRows(query: string): string[] {
        return [`RETURN QUERY SELECT CAST(cy_q.result AS json) FROM (\n${indent(query)}\n) cy_q;`];
    }

    raise(message: string): string {
        return `RAISE EXCEPTION USING MESSAGE = ${literal(message)};`;
    }

    /** A text that is no whole number, cast to one: Postgres fails with the text in its message. */
    failure(message: string, value: string): string {
        return `CAST(${literal(`${message} `)} || CAST(${value} AS text) AS integer)`;
    }

    idOf(json: string, key?: string): string {
        return key !== undefined ? `CAST(${json} ->> ${literal(key)} AS bigint)` : `CAST(${json} #>> '{}' AS bigint)`;
    }

    appended(list: string, item: string): string {
        return `(${list} || jsonb_build_array(${item}))`;
    }

    stripNulls(json: string): string {
        return `jsonb_strip_nulls(CAST(${json} AS jsonb))`;
    }

    merged(props: string, map: string): string {
        return `jsonb_strip_nulls(${props} || CAST(${map} AS jsonb))`;
    }

    withoutLabel(labels: string, label: string): string {
        return `(${labels} - ${literal(label)})`;
    }

    /** The side `json` of a `+` that the statement gives as `given`, and the other side as `other`, as text: see `summedText`. */
    private summed(json: string, given: unknown, other: unknown): string {
        return this.summedText(
            json,
            given,
            other,
            (it) => `(${it} #>> '{}')`,
            (it) => this.asText(it)
        );
    }

    /**
     * The JSON `json`, a text, a number or a truth value, as `toString` gives it: a float, a `numeric` with a fraction,
     * without the zeros `numeric`'s scale leaves after its digits (`trim_scale`), as Java writes a double: with no
     * exponent from 10^-3 up to 10^7, a point and a digit after it at least, `2.0`, and else as `1.0E7`, `1.2E-4`.
     * Postgres works a float out in `numeric`, exactly, so its digits may differ from a double's in the last places:
     * `0.1 * 3` is `0.3`.
     */
    private asText(json: string): string {
        return this.shared([json], ([x]) => {
            const exact = `trim_scale(CAST(${x} #>> '{}' AS numeric))`;
            return (
                `CASE WHEN jsonb_typeof(${x}) = 'number' AND NOT ${this.integral(x)} ` +
                `THEN ${this.shared([exact], ([n]) => this.floatText(n))} ELSE ${x} #>> '{}' END`
            );
        });
    }

    /** The `numeric` `n`, a float without trailing zeros, as Java writes a double: see {@link asText}. */
    private floatText(n: string): string {
        // `to_char` writes 17 digits and the exponent, ` 1.0000000000000000e+07`: the digits without the zeros after them,
        // a point and one at least.
        const scientific = `to_char(${n}, '9.9999999999999999EEEE')`;
        const mantissa = `regexp_replace(rtrim(btrim(split_part(${scientific}, 'e', 1)), '0'), '\\.$', '.0')`;
        return (
            `CASE WHEN ${n} = 0 THEN '0.0' WHEN abs(${n}) >= 0.001 AND abs(${n}) < 10000000 THEN to_char(${n}, '${PLAIN_FLOAT}') ` +
            `ELSE ${mantissa} || 'E' || CAST(split_part(${scientific}, 'e', 2) AS int) END`
        );
    }

    /**
     * The list `list` as {@link listSortKey} writes it, as text: its items and the items of each that is a list, all the
     * way down, by their places, each list held in it as its kind, then its items, then its end, ranked 0.
     */
    private listKey(list: string): string {
        // Each list's items as an array unnested: the planner takes an array it cannot see for 10 items, and a
        // set-returning function's for 100, which it multiplies through the walk, to a cost 150 times as high.
        const items = (json: string): string => `unnest(ARRAY(SELECT jsonb_array_elements(${json})))`;
        const walked =
            `SELECT ARRAY[ke.item_no] AS place, ke.item FROM ${items(list)} WITH ORDINALITY ke (item, item_no) ` +
            `UNION ALL SELECT kn.place || kc.item_no, kc.item FROM kn, ` +
            `${items(
                "CASE WHEN jsonb_typeof(kn.item) = 'array' THEN kn.item ELSE '[]'::jsonb END"
            )} WITH ORDINALITY kc (item, item_no)`;
        const ends =
            "SELECT kn.place || CAST(jsonb_array_length(kn.item) + 1 AS bigint), 0, 'null' FROM kn WHERE jsonb_typeof(kn.item) = 'array'";
        const tokens =
            `SELECT kn.place, ${this.itemRank('kn.item')} AS rank, ` +
            "CASE WHEN jsonb_typeof(kn.item) = 'array' THEN 'null' ELSE CAST(kn.item AS text) END AS item " +
            `FROM kn UNION ALL ${ends}`;
        return (
            `(WITH RECURSIVE kn (place, item) AS (${walked}) ` +
            "SELECT COALESCE(string_agg('[' || kt.rank || ', ' || kt.item || ', ', '' ORDER BY kt.place), '') || '[]' || " +
            `repeat(']', COUNT(*)::int) FROM (${tokens}) kt)`
        );
    }

    /** The JSON `json` as a `numeric`, where it is a number or a text that writes one: null for any other text, as Cypher converts it. */
    private numeric(json: string): string {
        return this.shared(
            [json],
            ([x]) =>
                `CASE WHEN jsonb_typeof(${x}) = 'number' OR (${x} #>> '{}') ~ ${literal(
                    NUMERIC_TEXT
                )} THEN CAST(${x} #>> '{}' AS numeric) END`
        );
    }

    private fold(
        name: string,
        initial: string,
        list: string,
        step: (accumulator: string, item: string) => string
    ): string {
        const text = [
            `WITH RECURSIVE ${name} (i, acc) AS (`,
            `    SELECT 0, CAST(${initial} AS jsonb)`,
            '    UNION ALL',
            `    SELECT ${name}.i + 1, CAST(${step(
                `${name}.acc`,
                `(${list} -> ${name}.i)`
            )} AS jsonb) FROM ${name} WHERE ${name}.i < jsonb_array_length(${list})`,
            ')',
            `SELECT acc FROM ${name} ORDER BY i DESC LIMIT 1`
        ].join('\n');
        return `CASE WHEN jsonb_typeof(${list}) = 'array' THEN (\n${indent(text)}\n) END`;
    }
}
