import { createHash } from 'crypto';
import { Stamps } from '@/model/Stamps';
import { indent, literal } from '@/cypher/sql/CypherSyntax';
import { jsonText } from '@/cypher/sql/JsonText';
import { PARAMETERS_OBJECT } from '@/cypher/sql/Parameters';
import { PostgresTemporalSql } from '@/cypher/sql/PostgresTemporalSql';
import { Procedure, ProcedureCall, Walk, Walked } from '@/cypher/sql/Procedure';
import { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
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
    NESTING,
    DOOMED,
    RECORD,
    MATCHED
}: typeof Procedure = Procedure;

/** A text Postgres reads as a `numeric`, spaces around it allowed. */
const NUMERIC_TEXT = '^\\s*[+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?\\s*$';

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

    literalJson(value: any): string {
        return `CAST(${literal(jsonText(value))} AS jsonb)`;
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

    /** A `numeric` with a fraction, so a whole one is written `2.0`, as a graph engine writes a float, and stays one in arithmetic. */
    float(sql: string): string {
        return `(CAST(${sql} AS numeric) + 0.0)`;
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

    aggregateList(value: string, order?: string): string {
        return `COALESCE(json_agg(${value}${order ? ` ORDER BY ${order}` : ''}), '[]'::json)`;
    }

    /** Distinct values are in no order: Postgres orders a `DISTINCT` aggregate by its argument alone. */
    collect(value: string, distinct: boolean, order?: string): string {
        const gathered = distinct ? `DISTINCT ${value}` : `${value}${order ? ` ORDER BY ${order}` : ''}`;
        return `COALESCE(json_agg(${gathered}) FILTER (WHERE ${value} IS NOT NULL), '[]'::json)`;
    }

    /** Postgres has no min or max of jsonb, which orders: the first of the values in order is the least. */
    extreme(value: string, min: boolean): string {
        const direction = min ? 'ASC' : 'DESC';
        return (
            `(array_agg(${value} ORDER BY ${this.kindOrder(value)} ${direction}, ${value} ${direction}) ` +
            `FILTER (WHERE COALESCE(jsonb_typeof(${value}), 'null') <> 'null'))[1]`
        );
    }

    add(a: string, b: string): string {
        return (
            `CASE WHEN jsonb_typeof(${a}) = 'number' AND jsonb_typeof(${b}) = 'number' THEN to_jsonb(${this.number(
                a
            )} + ${this.number(b)}) ` +
            `WHEN jsonb_typeof(${a}) = 'array' AND jsonb_typeof(${b}) = 'array' THEN ${a} || ${b} ` +
            `WHEN jsonb_typeof(${a}) = 'array' THEN ${a} || jsonb_build_array(${b}) ` +
            `WHEN jsonb_typeof(${b}) = 'array' THEN jsonb_build_array(${a}) || ${b} ` +
            `WHEN jsonb_typeof(${a}) IN ('string', 'number') AND jsonb_typeof(${b}) IN ('string', 'number') THEN to_jsonb((${a} #>> '{}') || (${b} #>> '{}')) END`
        );
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
            tostring: () => `to_jsonb(${json} #>> '{}')`,
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
        const e = walk.edge;
        const [join, far] = {
            OUTGOING: [`${e}.src = ${w}.nid`, `${e}.dst`],
            INCOMING: [`${e}.dst = ${w}.nid`, `${e}.src`],
            // Either way, and a relationship from a node to itself once.
            EITHER: [
                `(${e}.src = ${w}.nid OR ${e}.dst = ${w}.nid)`,
                `CASE WHEN ${e}.src = ${w}.nid THEN ${e}.dst ELSE ${e}.src END`
            ]
        }[walk.direction];
        const conditions = [
            `${e}.eid <> ALL (${w}.eids)`,
            ...(walk.max !== undefined ? [`${w}.depth < ${walk.max}`] : []),
            ...walk.conditions
        ];
        const text = [
            `WITH RECURSIVE ${w} (nid, depth, nids, eids) AS (`,
            `    SELECT ${walk.from}, 0, ${this.noIds}, ${this.noIds}`,
            '    UNION ALL',
            // Walked backwards, each node it leaves goes first, so its nodes end with the one it started from.
            walk.backwards
                ? `    SELECT ${far}, ${w}.depth + 1, ${w}.nid || ${w}.nids, ${e}.eid || ${w}.eids`
                : `    SELECT ${far}, ${w}.depth + 1, ${w}.nids || ${far}, ${w}.eids || ${e}.eid`,
            `    FROM ${w} JOIN ${this.edges} ${e} ON ${join}`,
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
     * matches no line break, as Java's does, unless the pattern says `(?s)`.
     */
    matches(text: string, pattern: string): string {
        return `(${text} ~ regexp_replace(${pattern}, '^(\\(\\?([a-z]+)\\))?(.*)$', '(?p\\2)^(\\3)$'))`;
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
            `    ${GATHERED}${i + 1} jsonb;`
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
