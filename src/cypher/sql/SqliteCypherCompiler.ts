import { quoted } from '@/backend/sqlite/SqliteGraph';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { chunked, indent, isGivenNumber, literal, MOST_ARGUMENTS, RoundingMode } from '@/cypher/sql/CypherSyntax';
import { jsonText } from '@/cypher/sql/JsonText';
import { PARAMETERS_OBJECT } from '@/cypher/sql/Parameters';
import { Procedure, ProcedureCall, ProcedureStep, Steps, Walk, Walked } from '@/cypher/sql/Procedure';
import { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { SqliteTemporalSql } from '@/cypher/sql/SqliteTemporalSql';
import { TemporalSql } from '@/cypher/sql/TemporalSql';
import { JsonValue, NodeValue } from '@/cypher/sql/Value';
import { Stamps } from '@/model/Stamps';

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

/** The variables of a procedure, which a step's SQL reads as numbered parameters: see {@link SqliteCypherCompiler.procedure}. */
const VARIABLES = new Set([
    PARAMS,
    ROWS,
    OUT,
    ROW,
    VALUE,
    ID,
    COUNT,
    FOUND,
    DOOMED,
    ...Array.from({ length: NESTING }, (_, i) => [
        `${SAVED}${i + 1}`,
        `${GATHERED}${i + 1}`,
        `${CALLER}${i + 1}`
    ]).flat()
]);

/** The records of a procedure's loops, whose `item` a step reads. */
const RECORDS = new Set([RECORD, MATCHED]);

/** A text SQLite reads as a number, spaces around it allowed. */
const NUMERIC_TEXT = '^\\s*[+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?\\s*$';

/** The characters `trim` takes off a text's ends, as Cypher's does: SQLite's own takes spaces alone. */
const WHITESPACE = 'char(32, 9, 10, 11, 12, 13)';

/** A property read as `propertyOf` reads it, `(alias.props -> '$."key"')`: its row's column, and its path's literal. */
const READ_PROPERTY = /^\(([\w.]+) -> ('(?:[^']|'')*')\)$/;

/**
 * Compiles a Cypher statement to SQL over a graph's tables on SQLite: see {@link SqlCypherCompiler}. A statement it
 * compiles is read with its text values as JSON: the connection gives it `/* drivine:json *\/` to open with.
 *
 * - **A value** is JSON text, which SQLite's JSON functions read: SQLite has no JSON type, and a value that passes
 *   through a subquery is text again, so a value put into a list or a map is read as JSON there with `json(…)`.
 * - **What Cypher does with values** that SQLite's JSON does not, functions Drivine registers on each connection do
 *   (see {@link SqliteFunctions}): values compare as Cypher compares them, `1` equal to `1.0` and a map to a map of the
 *   same entries in any order, and lists and texts are added. A value orders by the SQL value `->>` reads of it.
 * - **Temporal values** are worked out by {@link SqliteTemporalSql}.
 * - **A lateral query** (an `OPTIONAL MATCH`, a `CALL { … }`, a shortest path, a walk) is not one SQLite joins: its
 *   rows are gathered as a JSON list of maps in a subquery, which may read the row it is in, and that list is joined
 *   with `json_each`, whose argument may read the row too. Each column is read back out of the map.
 * - **A list of ids** is text, each id between commas (`,1,2,`), as on Oracle.
 *
 * A statement that writes is a procedure, as on the other stores, which a function Drivine registers carries out: see
 * {@link procedure}. drivine4j's `SqliteCypherCompiler` is the reference: the two compile a statement alike.
 */
export class SqliteCypherCompiler extends SqlCypherCompiler {
    readonly temporalSql: TemporalSql = new SqliteTemporalSql(this.sharedList);
    readonly noIds = "','";
    readonly rowNumber = 'ROW_NUMBER() OVER ()';

    /** A float the statement writes as Java writes a double, `1.0E9`, as drivine4j's JSON writes it. */
    literalJson(value: any): string {
        return literal(jsonText(value, 'java'));
    }

    /**
     * A JavaScript number past a whole number's range written as a float, as drivine4j binds a double: JSON's text of it,
     * `100000000000000000000`, SQLite reads as a whole number. See {@link jsonText}.
     */
    parameterText(value: any): string {
        return jsonText(value, true);
    }

    parameterJson(marker: string): string {
        return marker;
    }

    parameterCount(marker: string): string {
        return `CAST(${marker} AS INTEGER)`;
    }

    /** A map or a list the statement builds with its maps' keys in order, so two of the same entries group and are kept once as one. */
    comparable(value: JsonValue): string {
        return value.ordered ? `${SqliteFunctions.CANONICAL}(${value.sql})` : value.sql;
    }

    /** Null as SQL's null, where `json_quote` writes it as JSON's. */
    scalar(sql: string): string {
        return `NULLIF(json_quote(${sql}), 'null')`;
    }

    /** SQLite has no failing expression of its own: Drivine's function fails with the text. */
    failure(message: string, value: string): string {
        return `${SqliteFunctions.FAIL}(${literal(`${message} `)} || ${value})`;
    }

    typeOf(json: string): string {
        return (
            `(CASE json_type(${json}) WHEN 'integer' THEN 'number' WHEN 'real' THEN 'number' WHEN 'text' THEN 'string' WHEN 'true' THEN 'boolean' ` +
            "WHEN 'false' THEN 'boolean' WHEN 'array' THEN 'array' WHEN 'object' THEN 'object' WHEN 'null' THEN 'null' END)"
        );
    }

    isJsonNull(json: string): string {
        return `COALESCE(json_type(${json}), 'null') = 'null'`;
    }

    nullIfJsonNull(json: string): string {
        return `NULLIF(${json}, 'null')`;
    }

    number(json: string): string {
        return this.shared([json], ([x]) => `CASE WHEN json_type(${x}) IN ('integer', 'real') THEN ${x} ->> '$' END`);
    }

    integral(json: string): string {
        return `(json_type(${json}) = 'integer')`;
    }

    text(json: string): string {
        return this.shared([json], ([x]) => `CASE WHEN json_type(${x}) = 'text' THEN ${x} ->> '$' END`);
    }

    boolOf(json: string): string {
        return `(CASE json_type(${json}) WHEN 'true' THEN 1 WHEN 'false' THEN 0 END)`;
    }

    boolJson(sql: string): string {
        return `(CASE (${sql}) WHEN 1 THEN 'true' WHEN 0 THEN 'false' END)`;
    }

    float(sql: string): string {
        return `(${sql} + 0.0)`;
    }

    /**
     * SQLite takes no more than 100 arguments to a function (drivine4j#332): past them, the first 100 items are a
     * `json_array`, and the rest are appended to it in parts, each by a `json_insert` of as many as it takes.
     */
    jsonArray(items: string[]): string {
        const first = `json_array(${items
            .slice(0, MOST_ARGUMENTS)
            .map((it) => `json(${it})`)
            .join(', ')})`;
        return chunked(items.slice(MOST_ARGUMENTS), Math.floor((MOST_ARGUMENTS - 1) / 2)).reduce(
            (list, part) => `json_insert(${list}, ${part.map((it) => `'$[#]', json(${it})`).join(', ')})`,
            first
        );
    }

    /** Past 50 entries, as for {@link jsonArray}, the rest are set over the first 50 by {@link withEntries}. */
    jsonObject(entries: [string, string][]): string {
        const first = `json_object(${entries
            .slice(0, MOST_ARGUMENTS / 2)
            .map(([key, value]) => `${literal(key)}, json(${value})`)
            .join(', ')})`;
        return this.withEntries(first, entries.slice(MOST_ARGUMENTS / 2));
    }

    /** In parts, as for {@link jsonArray}: a `json_set` of as many entries as it takes, each set over the last. */
    withEntries(json: string, entries: [string, string][]): string {
        return chunked(entries, Math.floor((MOST_ARGUMENTS - 1) / 2)).reduce(
            (map, part) => `json_set(${map}, ${part.map(([key, value]) => `${path(key)}, json(${value})`).join(', ')})`,
            json
        );
    }

    propertyOf(json: string, key: string): string {
        return `(${json} -> ${path(key)})`;
    }

    /** Counted from the end where negative, as SQLite's `->` counts an index. */
    element(json: string, index: string): string {
        return `(${json} -> CAST(${index} ->> '$' AS INTEGER))`;
    }

    keyed(json: string, key: string): string {
        return `(${json} -> ('$.' || json_quote(${key} ->> '$')))`;
    }

    containsAll(props: string, map: string): string {
        return `${SqliteFunctions.CONTAINS}(${props}, ${map})`;
    }

    /** The test a partial index over the label's nodes is made with: see `holdsLabel` in `SqliteGraph`. */
    hasLabel(labels: string, label: string): string {
        return `instr(${labels}, ${literal(quoted(label))}) > 0`;
    }

    /**
     * The property's text, as a range index or a uniqueness constraint reads it (see `propertyText` in `SqliteGraph`),
     * compared with the value's: a string's text, or a truth value's JSON.
     */
    indexedEquality(property: string, value: string): string | undefined {
        const read = READ_PROPERTY.exec(property);
        if (!read) {
            return undefined;
        }
        const [props, at] = [read[1], read[2]];
        const text = `(CASE json_type(${props}, ${at}) WHEN 'text' THEN ${props} ->> ${at} WHEN 'null' THEN NULL ELSE ${props} -> ${at} END)`;
        return `${text} = (CASE json_type(${value}) WHEN 'text' THEN ${value} ->> '$' ELSE ${value} END)`;
    }

    elements(json: string, alias: string): string {
        return `json_each(${json}) AS ${alias}`;
    }

    /** `json_each` gives a string, a number or a truth value as the SQL value it is, and a list or a map as JSON. */
    item(alias: string): string {
        return (
            `(CASE ${alias}.type WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' WHEN 'null' THEN 'null' WHEN 'array' THEN ${alias}.value ` +
            `WHEN 'object' THEN ${alias}.value ELSE json_quote(${alias}.value) END)`
        );
    }

    itemNo(alias: string): string {
        return `(${alias}.key + 1)`;
    }

    itemAt(json: string, index: number): string {
        return this.element(json, this.literalJson(index));
    }

    listSize(json: string): string {
        return this.number(this.function('size', json)!);
    }

    jsonEquals(x: string, y: string): string {
        return `${SqliteFunctions.EQUAL}(${x}, ${y})`;
    }

    identityEquals(x: string, y: string): string {
        return this.jsonEquals(x, y);
    }

    /** `drivine_equal` compares a value that holds a null as Cypher does, null where no item or entry differs. */
    holdsNull(_json: string): string | undefined {
        return undefined;
    }

    nullsEqual(x: string, y: string, equals: (x: string, y: string) => string): string {
        return equals(x, y);
    }

    /** A text, a number or a truth value the statement gives is compared without the function that compares any two values. */
    givenEquals(x: string, y: string, given: unknown): string {
        if (typeof given === 'string') {
            return this.shared([x, y], ([a, b]) => `(json_type(${a}) = 'text' AND (${a} ->> '$') = (${b} ->> '$'))`);
        }
        if (isGivenNumber(given)) {
            return this.shared(
                [x, y],
                ([a, b]) => `(json_type(${a}) IN ('integer', 'real') AND (${a} ->> '$') = (${b} ->> '$'))`
            );
        }
        if (typeof given === 'boolean') {
            return `(json_type(${x}) = json_type(${y}))`;
        }
        return this.jsonEquals(x, y);
    }

    ordered(x: string, operator: string, y: string): string {
        return `((${x} ->> '$') ${operator} (${y} ->> '$'))`;
    }

    /** By `drivine_list_order`, which walks the two as Cypher does. */
    listOrder(x: string, y: string): string {
        return `${SqliteFunctions.LIST_ORDER}(${x}, ${y})`;
    }

    /** A list as `drivine_sort_key` writes it, which orders as Cypher orders lists; any other value as the SQL value `->>` reads. */
    sortKey(json: string): string {
        return this.shared(
            [json],
            ([x]) =>
                `CASE WHEN json_type(${x}) = 'array' THEN ${SqliteFunctions.SORT_KEY}(${x}) ELSE (${x} ->> '$') END`
        );
    }

    /**
     * Where the kind comes, then the SQL value `->>` reads, which orders a number before a text, and a truth value, 1 or
     * 0, among the numbers. The first term is a text: the kind's rank, a list's followed by itself as `drivine_sort_key`
     * writes it, so a list is ordered by it; and null for null. The value is read once more, not twice, as
     * {@link sortKey} reads it, and each term is a value JSON holds, as a `CALL { … }` carries it out.
     */
    openSortKey(json: string): string[] {
        const rank = this.shared(
            [json],
            ([x]) =>
                `CASE json_type(${x}) WHEN 'object' THEN '1' WHEN 'array' THEN '2' || ${SqliteFunctions.SORT_KEY}(${x}) WHEN 'text' THEN '3' ` +
                "WHEN 'true' THEN '4' WHEN 'false' THEN '4' WHEN 'integer' THEN '5' WHEN 'real' THEN '5' END"
        );
        return [rank, this.shared([json], ([x]) => `(${x} ->> '$')`)];
    }

    /** SQLite puts null first when ascending, and Cypher last. */
    orderTerm(term: string, descending: boolean): string {
        return descending ? `${term} DESC NULLS FIRST` : `${term} NULLS LAST`;
    }

    /** SQLite divides one whole number by another to a whole number, toward zero. */
    wholeQuotient(a: string, b: string): string {
        return `(${a} / ${b})`;
    }

    aggregateList(value: string, order?: string): string {
        return `json_group_array(json(${value})${order ? ` ORDER BY ${order}` : ''})`;
    }

    collect(value: string, order?: string): string {
        return `json_group_array(json(${value})${
            order ? ` ORDER BY ${order}` : ''
        }) FILTER (WHERE ${value} IS NOT NULL)`;
    }

    joinedTexts(text: string, order: string): string {
        return `group_concat(${text}, '' ORDER BY ${order})`;
    }

    distinctItems(list: string): string {
        return (
            `(SELECT json_group_array(json(d.item) ORDER BY d.first) FROM (SELECT min(${this.itemNo(
                'e'
            )}) AS first, ${this.item('e')} AS item ` +
            `FROM ${this.elements(list, 'e')} GROUP BY ${SqliteFunctions.CANONICAL}(${this.item('e')})) d)`
        );
    }

    /** Each item read at its place: `json_each` is no table a join can look a place up in, so a join reads it whole for each. */
    firstOfEach(list: string, identities: string): string {
        return (
            `(SELECT json_group_array(json(${list} -> ('$[' || f.first || ']')) ORDER BY f.first) ` +
            `FROM (SELECT min(e.key) AS first FROM ${this.elements(identities, 'e')} GROUP BY ${
                SqliteFunctions.CANONICAL
            }(${this.item('e')})) f)`
        );
    }

    /** The first of the values in order, the nulls left out: SQLite's `min` and `max` order no JSON. */
    extreme(value: string, min: boolean, key?: string): string {
        const direction = min ? 'ASC' : 'DESC';
        return (
            `(json_group_array(json(${value}) ORDER BY ${this.kindOrder(value)} ${direction}, ${
                key ?? `(${value} ->> '$')`
            } ${direction}) ` + `FILTER (WHERE NOT ${this.isJsonNull(value)}) -> 0)`
        );
    }

    idTokens(ids: string, key: string): string {
        return this.shared(
            [ids],
            ([x]) =>
                `CASE WHEN ${x} IS NOT NULL THEN (SELECT json_group_array(CASE WHEN t.type = 'null' THEN json('null') ELSE json_object(${literal(
                    key
                )}, t.value) END ORDER BY t.key) FROM json_each(${x}) t) END`
        );
    }

    add(a: string, b: string): string {
        return `${SqliteFunctions.ADD}(${a}, ${b})`;
    }

    /** `%` of two whole numbers, and of any other two `mod`, which keeps the fraction: SQLite's `%` takes whole numbers alone. */
    modulo(a: string, b: string): string {
        return this.shared(
            [a, b],
            ([x, y]) =>
                `CASE WHEN typeof(${x}) = 'integer' AND typeof(${y}) = 'integer' THEN ${x} % ${y} ELSE mod(${x}, ${y}) END`
        );
    }

    startsWith(a: string, b: string): string {
        return this.shared(
            [a, b],
            ([x, y]) => `CASE WHEN ${x} IS NOT NULL AND ${y} IS NOT NULL THEN substr(${x}, 1, length(${y})) = ${y} END`
        );
    }

    endsWith(a: string, b: string): string {
        return this.shared(
            [a, b],
            ([x, y]) =>
                `CASE WHEN ${x} IS NOT NULL AND ${y} IS NOT NULL THEN (${y} = '' OR substr(${x}, -length(${y})) = ${y}) END`
        );
    }

    containsText(a: string, b: string): string {
        return `(instr(${a}, ${b}) > 0)`;
    }

    function(name: string, json: string): string | undefined {
        const functions: Record<string, () => string> = {
            keys: () =>
                this.shared(
                    [json],
                    ([x]) =>
                        `CASE WHEN json_type(${x}) = 'object' THEN (SELECT json_group_array(k.key ORDER BY k.key) FROM json_each(${x}) k) END`
                ),
            size: () =>
                this.shared(
                    [json],
                    ([x]) =>
                        `CASE json_type(${x}) WHEN 'array' THEN json_quote(json_array_length(${x})) WHEN 'text' THEN json_quote(length(${x} ->> '$')) END`
                ),
            tolower: () => this.scalar(`${SqliteFunctions.LOWER}(${this.text(json)})`),
            toupper: () => this.scalar(`${SqliteFunctions.UPPER}(${this.text(json)})`),
            trim: () => this.scalar(`trim(${this.text(json)}, ${WHITESPACE})`),
            // A string is itself; anything else is the text of its JSON.
            tostring: () =>
                this.shared(
                    [json],
                    ([x]) =>
                        `CASE json_type(${x}) WHEN 'text' THEN ${x} WHEN 'null' THEN NULL WHEN 'real' THEN json_quote(${SqliteFunctions.FLOAT_TEXT}(${x} ->> '$')) ELSE json_quote('' || ${x}) END`
                ),
            tointeger: () =>
                this.shared(
                    [json],
                    ([x]) =>
                        `CASE json_type(${x}) WHEN 'integer' THEN ${x} WHEN 'real' THEN json_quote(CAST(${x} ->> '$' AS INTEGER)) ` +
                        `WHEN 'text' THEN CASE WHEN trim(${x} ->> '$') REGEXP '^[+-]?[0-9]+$' THEN json_quote(CAST(trim(${x} ->> '$') AS INTEGER)) ` +
                        `WHEN (${x} ->> '$') REGEXP ${literal(
                            NUMERIC_TEXT
                        )} THEN json_quote(CAST(CAST(trim(${x} ->> '$') AS REAL) AS INTEGER)) END END`
                ),
            tofloat: () =>
                this.shared(
                    [json],
                    ([x]) =>
                        `CASE json_type(${x}) WHEN 'integer' THEN json_quote(CAST(${x} ->> '$' AS REAL)) WHEN 'real' THEN ${x} ` +
                        `WHEN 'text' THEN CASE WHEN (${x} ->> '$') REGEXP ${literal(
                            NUMERIC_TEXT
                        )} THEN json_quote(CAST(trim(${x} ->> '$') AS REAL)) END END`
                ),
            head: () => `(${json} -> 0)`,
            last: () => `(${json} -> -1)`,
            abs: () => this.scalar(`abs(${this.number(json)})`)
        };
        return Object.prototype.hasOwnProperty.call(functions, name) ? functions[name]() : undefined;
    }

    page(skip?: string, limit?: string): string[] {
        if (skip === undefined && limit === undefined) {
            return [];
        }
        return [`LIMIT ${limit ?? '-1'}${skip !== undefined ? ` OFFSET ${skip}` : ''}`];
    }

    ids(id: string): string {
        return `(',' || ${id} || ',')`;
    }

    joinIds(lists: string[]): string {
        return `(${lists[0]}${lists
            .slice(1)
            .map((it) => ` || substr(${it}, 2)`)
            .join('')})`;
    }

    storeIds(json: string): string {
        return this.shared(
            [json],
            ([ids]) =>
                `CASE WHEN ${ids} IS NOT NULL THEN (SELECT ',' || COALESCE(group_concat(x.value, ',' ORDER BY x.key) || ',', '') FROM json_each(${ids}) x) END`
        );
    }

    idIn(id: string, list: string): string {
        return `instr(${list}, ',' || ${id} || ',') > 0`;
    }

    idsOverlap(a: string, b: string): string {
        return `EXISTS (SELECT 1 FROM ${this.idRows(a, 'ov')} WHERE instr(${b}, ',' || ${this.rowId(
            'ov'
        )} || ',') > 0)`;
    }

    idCount(list: string): string {
        return this.shared([list], ([l]) => `json_quote(length(${l}) - length(replace(${l}, ',', '')) - 1)`);
    }

    idRows(list: string, alias: string): string {
        return `json_each('[' || trim(${list}, ',') || ']') AS ${alias}`;
    }

    rowId(alias: string): string {
        return `${alias}.value`;
    }

    rowOrd(alias: string): string {
        return `(${alias}.key + 1)`;
    }

    /**
     * The source `source` joined to those before it as an inner join `ON TRUE`: SQLite reads a `CROSS JOIN` as an
     * instruction to keep the order it is written in, so `MATCH (n)-[r]->(m)` would read every pair of nodes before an
     * edge (liberation-data/drivine#589). A source that reads an earlier one's column, such as a `json_each`, is still
     * read after it.
     */
    crossJoin(source: string): string {
        return `JOIN ${source} ON TRUE`;
    }

    /**
     * A relationship of either direction keeps its OR across the two directions here, which SQLite plans as a
     * `MULTI-INDEX OR`, probing the index on each end. Read both ways round, as on Postgres and Oracle
     * (liberation-data/drivine#588), SQLite builds an index over all of it for each statement: at 20,000 nodes a walk
     * from 20 of them took 59 ms, against 9.5 ms with the OR, and a single step 66 ms against 30
     * (liberation-data/drivine4j#574).
     */
    undirectedBothWays(): boolean {
        return false;
    }

    /**
     * A JSON list of maps, a map for each row of `query`, gathered in a subquery that may read the row it is in, and
     * joined as `json_each` gives its items: SQLite joins no lateral query.
     */
    lateral(query: string, name: string, optional: boolean, columns: [string, boolean][]): string {
        const rows = this.gathered(query, name, columns);
        return optional ? `LEFT JOIN ${rows} ON TRUE` : this.crossJoin(rows);
    }

    /**
     * JSON's null, which a column of SQL's null is in the map, as SQL's null again: a list of nodes that is null is not
     * the list `[null]`.
     */
    lateralColumn(name: string, column: string, json: boolean): string {
        return json ? `NULLIF(${name}.value -> '$.${column}', 'null')` : `(${name}.value ->> '$.${column}')`;
    }

    /**
     * A recursive query from the node walked from, which reads its row, its rows gathered as {@link lateral} gathers a
     * query's: each the node a walk reached, and the ids of the nodes and relationships it took to get there.
     */
    walk(walk: Walk): Walked {
        const w = walk.step;
        const { joins, reached, distinct }: Steps = this.steps(walk, `${w}.nid`);
        const eids = walk.hops.map((it) => `${it.edge}.eid`);
        const conditions = [
            ...eids.map((it) => `instr(${w}.eids, ',' || ${it} || ',') = 0`),
            ...distinct,
            ...(walk.max !== undefined ? [`${w}.depth < ${walk.max}`] : []),
            ...walk.conditions
        ];
        const text = [
            `WITH RECURSIVE ${w} (nid, depth, nids, eids) AS (`,
            `    SELECT ${walk.from}, 0, ',', ','`,
            '    UNION ALL',
            // Walked backwards, each node it leaves goes first, so its nodes end with the one it started from.
            walk.backwards
                ? `    SELECT ${reached[0]}, ${w}.depth + 1, ',' || ${w}.nid || ${w}.nids, ',' || ${eids[0]} || ${w}.eids`
                : `    SELECT ${reached[reached.length - 1]}, ${w}.depth + 1, ${w}.nids${reached
                      .map((it) => ` || ${it} || ','`)
                      .join('')}, ${w}.eids${eids.map((it) => ` || ${it} || ','`).join('')}`,
            `    FROM ${w}`,
            ...joins.map((it) => `    ${it}`),
            `    WHERE ${conditions.join(' AND ')}`,
            ')',
            `SELECT nid, nids, eids FROM ${w} WHERE depth >= ${walk.min}`
        ].join('\n');
        const name = walk.name;
        const rows = this.gathered(text, name, [
            ['nid', false],
            ['nids', false],
            ['eids', false]
        ]);
        return {
            source: rows,
            condition: `${this.lateralColumn(name, 'nid', false)} = ${walk.to}`,
            eids: this.lateralColumn(name, 'eids', false),
            nids: this.lateralColumn(name, 'nids', false)
        };
    }

    nodeJson(node: NodeValue): string {
        return (
            `CASE WHEN ${node.nid} IS NOT NULL THEN CASE WHEN ${node.stamp} IS NULL THEN ${node.props} ` +
            `ELSE json_set(${node.props}, ${path(Stamps.PROPERTY)}, ${node.stamp}) END END`
        );
    }

    /** A recursive query, a row for each item taken, that reads the row it is in, as SQLite's may. */
    reduce(name: string, initial: string, list: string, step: (accumulator: string, item: string) => string): string {
        return this.shared([list], ([items]) => {
            const text = [
                `WITH RECURSIVE ${name} (i, acc) AS (`,
                `    SELECT 0, ${initial}`,
                '    UNION ALL',
                `    SELECT ${name}.i + 1, ${step(
                    `${name}.acc`,
                    `(${items} -> ${name}.i)`
                )} FROM ${name} WHERE ${name}.i < json_array_length(${items})`,
                ')',
                `SELECT acc FROM ${name} ORDER BY i DESC LIMIT 1`
            ].join('\n');
            return `CASE WHEN json_type(${items}) = 'array' THEN (\n${indent(text)}\n) END`;
        });
    }

    /** A recursive query, a row for each number: SQLite's `generate_series` is an extension its build leaves out. */
    range(from: string, to: string, step: string): string {
        return this.shared([from, to, step], ([first, last, by]) => {
            const within = (g: string): string =>
                `CASE WHEN ${by} > 0 THEN ${g} <= CAST(${last} AS INTEGER) ELSE ${g} >= CAST(${last} AS INTEGER) END`;
            const text = [
                'WITH RECURSIVE r (g, o) AS (',
                `    SELECT CAST(${first} AS INTEGER), 1`,
                '    UNION ALL',
                `    SELECT r.g + CAST(${by} AS INTEGER), r.o + 1 FROM r WHERE ${within(
                    `r.g + CAST(${by} AS INTEGER)`
                )}`,
                ')',
                `SELECT json_group_array(r.g ORDER BY r.o) FROM r WHERE ${within('r.g')}`
            ].join('\n');
            // A step of 0 would never end, and Cypher refuses it.
            return `CASE WHEN CAST(${by} AS INTEGER) <> 0 THEN (\n${indent(text)}\n) END`;
        });
    }

    uuid(): string {
        return `${SqliteFunctions.UUID}()`;
    }

    /** Materialized, as SQLite otherwise flattens the query into the one that reads it, and makes a `randomUUID()` again for each read. */
    once(query: string): string {
        return `WITH once AS MATERIALIZED (\n${indent(query)}\n)\nSELECT * FROM once`;
    }

    /**
     * By Java's `Math`, as Neo4j works these out: see `drivine_math`. SQLite's own give null where Neo4j gives NaN or
     * negative infinity.
     */
    math(name: string, numbers: string[]): string {
        return `${SqliteFunctions.MATH}(${literal(name)}, ${numbers.join(', ')})`;
    }

    /** In decimal, as Neo4j rounds: see `drivine_round`. SQLite's numbers are binary, and 2.345 is below 2.345 there. */
    roundTo(number: string, precision: string, mode: RoundingMode): string {
        return `${SqliteFunctions.ROUND}(${number}, ${precision}, ${literal(mode)})`;
    }

    /**
     * Half up, as Neo4j rounds by two arguments, by Drivine's function as a mode rounds: SQLite's `ROUND` keeps no more
     * than 15 places of a fraction, so 1.0E-100 to 120 places would be 0.
     */
    roundPlaces(number: string, precision: string): string {
        return this.roundTo(number, precision, 'HALF_UP');
    }

    /** Half toward +infinity, by Drivine's function as a mode rounds: half up above 0, half down below. */
    roundWhole(number: string): string {
        return this.shared(
            [number],
            ([n]) =>
                `CASE WHEN ${n} < 0 THEN ${this.roundTo(n, '0', 'HALF_DOWN')} ELSE ${this.roundTo(
                    n,
                    '0',
                    'HALF_UP'
                )} END`
        );
    }

    rightText(text: string, count: string): string {
        return this.shared(
            [text, count],
            ([t, n]) =>
                `CASE WHEN ${t} IS NULL OR ${n} IS NULL THEN NULL WHEN ${n} >= length(${t}) THEN ${t} WHEN ${n} > 0 THEN substr(${t}, -${n}) ELSE '' END`
        );
    }

    /**
     * The whole of the text matches, as `=~` asks: `REGEXP` finds a match anywhere. It ends at `\z`, the text's end,
     * where Java's `$` would match before a line break that ends the text too.
     */
    matches(text: string, pattern: string): string {
        return `(${text} REGEXP ('^(?:' || ${pattern} || ')\\z'))`;
    }

    split(text: string, separator: string): string {
        return `${SqliteFunctions.SPLIT}(${text}, ${separator})`;
    }

    reverseText(text: string): string {
        return `${SqliteFunctions.REVERSE}(${text})`;
    }

    /**
     * The procedure's steps carried out one by one by the function Drivine registers on each connection, under a
     * savepoint of its own, so the statement is applied whole or not at all (see `drivine_cypher`): SQLite has no
     * procedural language. The steps are given as JSON, each with its SQL, in which each variable of the procedure it
     * reads is a numbered parameter, `?1`, and the variables bound to them in turn. The rows it returns are JSON's, in a
     * list.
     */
    procedure(program: ProcedureStep[]): ProcedureCall {
        const steps = JSON.stringify({ steps: program.map((it) => this.step(it)) });
        const c = 'cy';
        return {
            setup: [],
            sql: `SELECT ${this.item(c)} AS result FROM json_each(${SqliteFunctions.CYPHER}(${literal(
                steps
            )}, $${PARAMETERS_OBJECT})) AS ${c} ORDER BY ${c}.key`
        };
    }

    idOf(json: string, key?: string): string {
        return `CAST(${json} ->> ${key !== undefined ? path(key) : "'$'"} AS INTEGER)`;
    }

    appended(list: string, item: string): string {
        return `json_insert(${list}, '$[#]', json(${item}))`;
    }

    /** A merge patch onto an empty map leaves out each entry whose value is null. */
    stripNulls(json: string): string {
        return `json_patch('{}', ${json})`;
    }

    merged(props: string, map: string): string {
        return `json_patch(${props}, ${map})`;
    }

    withoutLabel(labels: string, label: string): string {
        return `(SELECT json_group_array(l.value ORDER BY l.key) FROM json_each(${labels}) l WHERE l.value <> ${literal(
            label
        )})`;
    }

    /** `step` as the function that carries it out reads it. */
    private step(step: ProcedureStep): Record<string, unknown> {
        switch (step.kind) {
            case 'Select':
                return { ...stepSql('select', `SELECT ${step.expression}${step.from}`), variable: step.variable };
            case 'Let':
                return { ...stepSql('select', `SELECT ${step.expression}`), variable: step.variable };
            case 'Loop':
                return {
                    ...stepSql('loop', step.query),
                    record: `${step.record}.item`,
                    body: step.body.map((it) => this.step(it))
                };
            case 'If':
                return {
                    ...stepSql('if', `SELECT CASE WHEN ${step.condition} THEN 1 ELSE 0 END`),
                    body: step.body.map((it) => this.step(it))
                };
            case 'Raise':
                return { op: 'raise', message: step.message };
            case 'Execute':
                return { ...stepSql('execute', step.statement), variable: step.into ?? null };
            default:
                return stepSql('return', step.query);
        }
    }

    /** The rows of `query`, of the columns `columns`, as `json_each` gives the JSON list of maps they are gathered in, named `name`: see {@link lateral}. */
    private gathered(query: string, name: string, columns: [string, boolean][]): string {
        const entries = columns
            .map(([column, json]) => `${literal(column)}, ${json ? `json(q.${column})` : `q.${column}`}`)
            .join(', ');
        return `json_each((SELECT json_group_array(json_object(${entries})) FROM (\n${indent(query)}\n) q)) AS ${name}`;
    }
}

/** The path of the key `key` of a map, as SQLite's JSON functions read one: a key of any characters, in quotes. */
function path(key: string): string {
    return literal(`$.${quoted(key)}`);
}

/** Whether `c` is a character of a name: a letter, a digit or `_`. */
function isWord(c: string | undefined): boolean {
    return c !== undefined && /[\p{L}\p{Nd}_]/u.test(c);
}

/** The end of the literal or the quoted name that starts at `start` in `sql`, past its closing quote. */
function quotedEnd(sql: string, start: number): number {
    const quote = sql[start];
    let end = start + 1;
    while (end < sql.length) {
        if (sql[end] !== quote) {
            end++;
        } else if (end + 1 < sql.length && sql[end + 1] === quote) {
            end += 2;
        } else {
            break;
        }
    }
    return Math.min(end + 1, sql.length);
}

/** The name that starts at `start` in `sql`, a record's `item` with it, and where it ends. */
function nameAt(sql: string, start: number): [string, number] {
    let end = start;
    while (end < sql.length && isWord(sql[end])) {
        end++;
    }
    const name = sql.substring(start, end);
    if (RECORDS.has(name) && sql.startsWith('.item', end) && !isWord(sql[end + 5])) {
        return [`${name}.item`, end + 5];
    }
    return [name, end];
}

/**
 * The step `op` of the SQL `sql`, each variable it reads a numbered parameter, and the variables, in the parameters'
 * order. A literal or a quoted name is read past whole: a text may hold what reads as a variable.
 */
function stepSql(op: string, sql: string): Record<string, unknown> {
    const variables: string[] = [];
    let written = '';
    let i = 0;
    while (i < sql.length) {
        const c = sql[i];
        if (c === "'" || c === '"') {
            const end = quotedEnd(sql, i);
            written += sql.substring(i, end);
            i = end;
        } else if (/[\p{L}_]/u.test(c) && (i === 0 || !(isWord(sql[i - 1]) || sql[i - 1] === '.'))) {
            const [name, end] = nameAt(sql, i);
            if (VARIABLES.has(name) || (name.endsWith('.item') && RECORDS.has(name.slice(0, -5)))) {
                if (!variables.includes(name)) {
                    variables.push(name);
                }
                written += `?${variables.indexOf(name) + 1}`;
            } else {
                written += name;
            }
            i = end;
        } else {
            written += c;
            i++;
        }
    }
    return { op, sql: written, variables };
}
