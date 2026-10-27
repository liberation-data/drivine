import { Integer } from 'neo4j-driver';
import { DrivineError } from '@/DrivineError';
import { Direction } from '@/cypher/ast/Pattern';
import { CypherReader } from '@/cypher/CypherReader';
import { Query, Return } from '@/cypher/ast/Query';
import { CompiledCypher } from '@/cypher/sql/CompiledCypher';
import { CypherWriter } from '@/cypher/sql/CypherWriter';
import {
    indent,
    isGivenNumber,
    literal,
    MADE_TEXT,
    RoundingMode,
    unsupported,
    writes
} from '@/cypher/sql/CypherSyntax';
import { jsonText, LONG_RANGE } from '@/cypher/sql/JsonText';
import { Parameters } from '@/cypher/sql/Parameters';
import { Procedure, ProcedureCall, Steps, Walk, Walked } from '@/cypher/sql/Procedure';
import { Shared, TemporalSql } from '@/cypher/sql/TemporalSql';
import { Temporals } from '@/cypher/sql/Temporals';
import { json, JsonValue, NodeValue } from '@/cypher/sql/Value';
import { CypherFloat } from '@/cypher/ast/Expression';

/** How long a value {@link SqlCypherCompiler.shared} binds may be written where it is read, in characters. */
const SHARED_ABOVE = 200;

/**
 * The format a float from 10^-3 up to 10^7 is written in by `TO_CHAR` or `to_char`, as Java writes a double: no
 * exponent, a digit before the point and one after it at least, and as many more as its shortest decimal has.
 */
export const PLAIN_FLOAT = 'FM9999990.0999999999999999999999';

/**
 * A number the statement gives, as Java writes it: a float as a double, `1.0E7`, `2.5`. A JavaScript number with no
 * fraction is a whole number, as a parameter binds it, but past a whole number's range, where it is a float, `1.0E21`.
 */
function givenText(value: number | bigint | CypherFloat | Integer): string {
    if (value instanceof CypherFloat) {
        return javaDouble(value.value);
    }
    return typeof value === 'number' && (!Number.isInteger(value) || Math.abs(value) >= LONG_RANGE)
        ? javaDouble(value)
        : value.toString();
}

/**
 * The double `value` as Java's `Double.toString` writes it: with no exponent from 10^-3 up to 10^7, a point and a digit
 * after it at least, and else as `1.0E7`, `1.2E-4`, from the shortest decimal that reads back as it.
 */
export function javaDouble(value: number): string {
    if (Number.isNaN(value)) {
        return 'NaN';
    }
    if (!Number.isFinite(value)) {
        return value > 0 ? 'Infinity' : '-Infinity';
    }
    if (value === 0) {
        return Object.is(value, -0) ? '-0.0' : '0.0';
    }
    const magnitude = Math.abs(value);
    if (magnitude >= 1e-3 && magnitude < 1e7) {
        const text = String(value);
        return text.includes('.') ? text : `${text}.0`;
    }
    // Two digits at least, as Java writes them: the least double, 5e-324, is 4.9E-324.
    const [shortest] = value.toExponential().split('e');
    const [mantissa, exponent] = (shortest.includes('.') ? value.toExponential() : value.toExponential(1)).split('e');
    return `${mantissa}E${Number(exponent)}`;
}

/**
 * Compiles a Cypher statement to SQL over a graph's tables, `<graph>_node` and `<graph>_edge`, so a statement written
 * for a graph engine runs on a SQL store and gives the same rows. What is the same on each store is here and in
 * {@link CypherWriter}; a store's own SQL, for JSON, lists, walks and paging, is its subclass's. A compiler compiles one
 * statement.
 *
 * - A `MATCH` is a join of node and relationship rows, its patterns' labels, types, directions and properties its
 *   conditions. Two relationships of one `MATCH` are two relationships, as in Cypher.
 * - A variable-length relationship, `*min..max`, is a recursive walk from the end of it that is pinned down, which
 *   takes no relationship twice. A variable on one is the list of its relationships.
 * - A path, `p = (…)`, is the ids of its nodes and relationships, read by `nodes`, `relationships` and `length`. It is
 *   not returned whole: each graph engine's driver gives a path as a value of its own.
 * - An `OPTIONAL MATCH` is a lateral join that keeps the row with nulls where nothing is found.
 * - A `WITH` is a query of its own, which the rest of the statement reads from.
 * - A projection that aggregates is grouped by what it holds outside its aggregates, as Cypher groups it.
 * - A value is JSON, so a comparison is JSON's and `'7'` is not `7`, and a missing property is null and meets no
 *   comparison. A map the statement builds keeps its keys in the order written, as a graph engine gives them.
 * - The statement returns one value a row, as Drivine's statements are written to: the one item a `RETURN` has, or a
 *   list of its items when it has more, as Drivine gives a row of several columns. A node is its properties, as Drivine
 *   gives a node.
 *
 * A statement that writes (`CREATE`, `MERGE`, `SET`, `REMOVE`, `DELETE`) is a procedure, the store's own, which runs as
 * one statement and so is applied whole or not at all. Its rows are carried from clause to clause as a JSON list, a
 * node or a relationship in a row as its id, and each write is made for one row after another, as Cypher makes it: a
 * `MERGE` finds what an earlier row made. A read after a write sees what it wrote. Its parameters are bound as one
 * object, `_cy_params`.
 *
 * The store's SQL is public, for the writer reads it; it is not Drivine's API.
 */
export abstract class SqlCypherCompiler {
    readonly nodes: string;
    readonly edges: string;

    /** Whether the statement is a procedure, which declares no function of its own a query of it may call. */
    procedural = false;

    /** Whether the store aggregates a `CASE` whose result holds a subquery: see `CypherWriter.casesFirst`. */
    readonly aggregatesCaseSubqueries: boolean = true;

    /**
     * Whether `min` and `max` of a list the statement makes order it by {@link listSortKey}, item by item, as an
     * `ORDER BY` sorts it: where the store's own JSON order puts the shorter list first.
     */
    readonly extremesByListKey: boolean = true;

    /**
     * Whether {@link shared} binds a long value: not in an expression that aggregates, whose aggregate a subquery would
     * take from its group, nor in a term a projection beside a variable-length walk sorts by that is none of its items
     * (see `CypherWriter.sorts`).
     */
    sharing = true;

    /**
     * Whether a walk reads the row it is in: a condition of a quantified path pattern may then read a variable bound
     * outside it.
     */
    readonly walksReadRow: boolean = true;

    /** The functions a query of the statement calls, which it declares before it: see {@link declare}. */
    private readonly functions: string[] = [];

    /** How many values {@link shared} has bound, to name each subquery it binds one in. */
    private shares = 0;

    private temporalsOf?: Temporals;

    /** The store's SQL for temporal values, which {@link temporals} works openCypher's out of. */
    abstract readonly temporalSql: TemporalSql;

    /** The list of no ids. */
    abstract readonly noIds: string;

    /** The number of a row of a query, counted from 1 in the order the query gives its rows. */
    abstract readonly rowNumber: string;

    constructor(graph: string) {
        this.nodes = `${graph}_node`;
        this.edges = `${graph}_edge`;
    }

    /** {@link shared}, of a list of values, as {@link Temporals} and a store's {@link TemporalSql} take it. */
    readonly sharedList: Shared = (values, body) => this.shared(values, body);

    /** openCypher's temporal values: see {@link Temporals}. */
    get temporals(): Temporals {
        this.temporalsOf ??= new Temporals(this.temporalSql, this.sharedList);
        return this.temporalsOf;
    }

    /** The statement `cypher`, with its parameters' values `parameters`, as SQL. */
    compile(cypher: string, parameters: Record<string, any> = {}): CompiledCypher {
        return this.compileQuery(CypherReader.read(cypher), parameters);
    }

    /**
     * The statement `query`, read already, with its parameters' values `parameters`, as SQL: a query, or a procedure
     * where it writes.
     */
    compileQuery(query: Query, parameters: Record<string, any>): CompiledCypher {
        if (query.unions.length > 0) {
            return this.withFunctions(this.union(query, parameters));
        }
        if (!query.clauses.some(writes)) {
            const writer = new CypherWriter(this, this.readParameters(parameters));
            return this.withFunctions({ sql: writer.query(query), parameters: writer.parameters.values, setup: [] });
        }
        this.procedural = true;
        // A procedure takes its parameters as one object, and reads each from it.
        const writer = new CypherWriter(
            this,
            new Parameters(
                parameters,
                (it) => this.nullIfJsonNull(this.propertyOf(Procedure.PARAMS, it)),
                (it) => this.number(this.propertyOf(Procedure.PARAMS, it)),
                true,
                (it) => this.parameterText(it),
                this.parameterPath && ((name, keys) => this.parameterPath!(Procedure.PARAMS, [name, ...keys]))
            )
        );
        const call = this.procedure(writer.procedure(query));
        return { sql: call.sql, parameters: writer.parameters.values, setup: call.setup };
    }

    /** Declares `fn`, a function's whole text, for the statement to call: a query's own, before it. */
    declare(fn: string): void {
        this.functions.push(fn);
    }

    /**
     * `body` over `values`, each read by name where one is long: bound once in a subquery, so a body that reads a value
     * more than once (to test its kind, then to read it) does not write it out again, and operations nested in one
     * another do not grow the statement exponentially. Short values are written where they are read. Oracle groups by
     * no subquery, so a projection that would group by a value so bound works it out first.
     */
    shared(values: string[], body: (names: string[]) => string): string {
        if (!this.sharing || values.every((it) => it.length <= SHARED_ABOVE)) {
            return body(values);
        }
        return this.bound(values, body);
    }

    /** `body` over `values`, each bound in a subquery and read by name whatever its length: see {@link shared}. */
    bound(values: string[], body: (names: string[]) => string): string {
        const alias = `sh${++this.shares}`;
        const named = values.map((value, i) => `${value} AS v${i + 1}`).join(', ');
        return `(SELECT ${body(values.map((_, i) => `${alias}.v${i + 1}`))} FROM (${this.boundSelect(
            named
        )}) ${alias})`;
    }

    /**
     * The subquery {@link bound} binds its values in, of the columns `columns`: kept apart from the query that reads it,
     * where a store would merge the two, so the planner does not write each value out again where it is read.
     */
    boundSelect(columns: string): string {
        return `SELECT ${columns}`;
    }

    /**
     * The query of a `CALL { … }`, `query`, as the row that reads what it returns joins it: kept apart from that row's
     * query, where a store would merge the two and read a value bound in the row wrongly.
     */
    called(query: string): string {
        return query;
    }

    /**
     * The query `query` that makes a value anew for each row, `randomUUID()`, kept apart from the query that reads it,
     * where a store would merge the two and make the value again for each read: a `WITH`'s, and a projection's sorted by
     * it.
     */
    once(query: string): string {
        return this.called(query);
    }

    /**
     * `round(value)`, and `round(value, 0)`: the SQL number `number` to a whole number, half toward +infinity, as Java's
     * `Math.round` rounds. Worked out in decimal, as `numeric` and `NUMBER` hold a number, exactly.
     */
    roundWhole(number: string): string {
        return `FLOOR(${number} + 0.5)`;
    }

    /** `round(value, precision)`: the SQL number `number` to `precision` places, half away from zero, as SQL's `ROUND` rounds. */
    roundPlaces(number: string, precision: string): string {
        return `ROUND(${number}, ${precision})`;
    }

    /** The sign of the SQL number `number`: 1, -1 or 0, as SQL's `SIGN` gives it, and null where it is null. */
    signOf(number: string): string {
        return `SIGN(${number})`;
    }

    /**
     * `round(value, precision, mode)`: the SQL number `number` rounded to `precision` decimal places by `mode`, as a SQL
     * number. Worked out in decimal, as Neo4j works it out with Java's `BigDecimal`, so 2.345 is halfway between 2.34 and
     * 2.35: a store whose numbers are decimal (`numeric`, `NUMBER`) takes this.
     */
    roundTo(number: string, precision: string, mode: RoundingMode): string {
        return this.shared([number, precision], ([n, p]) => {
            const scale = `POWER(CAST(10 AS NUMERIC), ${p})`;
            const scaled = `(ABS(${n}) * ${scale})`;
            // Rounded as a magnitude, then given the number's sign: UP, DOWN and the HALF_ modes round toward or away from 0.
            const magnitudes: Partial<Record<RoundingMode, string>> = {
                UP: `CEIL(${scaled})`,
                DOWN: `FLOOR(${scaled})`,
                HALF_UP: `FLOOR(${scaled} + 0.5)`,
                HALF_DOWN: `CEIL(${scaled} - 0.5)`,
                HALF_EVEN: `CASE WHEN ${scaled} - FLOOR(${scaled}) = 0.5 THEN FLOOR(${scaled}) + MOD(FLOOR(${scaled}), 2) ELSE FLOOR(${scaled} + 0.5) END`
            };
            if (mode === 'CEILING') {
                return `(CEIL(${n} * ${scale}) / ${scale})`;
            }
            if (mode === 'FLOOR') {
                return `(FLOOR(${n} * ${scale}) / ${scale})`;
            }
            return `(${this.signOf(n)} * ${magnitudes[mode]} / ${scale})`;
        });
    }

    /**
     * Where the JSON `json`'s kind comes among the others, as Cypher orders values of several kinds: a map, a list, a
     * text, a truth value, then a number. JSON orders them otherwise on each store.
     */
    kindOrder(jsonSql: string): string {
        return this.shared(
            [jsonSql],
            ([x]) =>
                `CASE ${this.typeOf(
                    x
                )} WHEN 'object' THEN 1 WHEN 'array' THEN 2 WHEN 'string' THEN 3 WHEN 'boolean' THEN 4 WHEN 'number' THEN 5 END`
        );
    }

    /** Whether the labels `labels`, a JSON list, hold each of `all`. */
    hasLabels(labels: string, all: string[]): string {
        return all.map((it) => this.hasLabel(labels, it)).join(' AND ');
    }

    /**
     * A test an index answers, to stand beside the comparison of the `property`, read as {@link propertyOf} gives it,
     * with the `value`, a text or a truth value; undefined where there is none.
     */
    indexedEquality(_property: string, _value: string): string | undefined {
        return undefined;
    }

    /**
     * Whether the identities `x` and `y`, neither of them null, are equal: see `CypherWriter.identityOf`. A list of a few
     * thousand relationships' tokens is larger than Oracle's `=` compares, so Oracle compares them otherwise.
     */
    identityEquals(x: string, y: string): string {
        return `${x} = ${y}`;
    }

    /** Whether the JSON values `x` and `y`, neither of them null, are equal as JSON. */
    jsonEquals(x: string, y: string): string {
        return `${x} = ${y}`;
    }

    /** Whether the JSON values `x` and `y`, of one kind, a number, a text or a truth value, stand as `operator` says (`<`, `>=`…). */
    ordered(x: string, operator: string, y: string): string {
        return `${x} ${operator} ${y}`;
    }

    /** What an order sorts the JSON value `json` by: JSON's null as SQL's, which comes last, as a graph engine orders null. */
    sortKey(jsonSql: string): string {
        return this.nullIfJsonNull(jsonSql);
    }

    /**
     * What an order sorts the JSON value `json` by where the statement makes it a list ({@link JsonValue.list}): as
     * {@link sortKey} where the store orders lists as Cypher does.
     */
    listSortKey(jsonSql: string): string {
        return this.sortKey(jsonSql);
    }

    /** Where the kind of the JSON `json`, an item of a list, comes among the others as Cypher orders them: as {@link kindOrder}, null last. */
    itemRank(jsonSql: string): string {
        return `COALESCE(${this.kindOrder(jsonSql)}, 6)`;
    }

    /**
     * The text the JSON `json`, a side of a `+` that may put a number and a text together, is written as there: by
     * `written`, as `toString` writes it, a float as Java writes a double. Where the statement gives it a number, `given`,
     * it is that number's text, worked out here; and where it gives the other side, `other`, a number, or this side a text,
     * it is its own text, `plain`, for a side is put together with a number only where it is a text. So is a side the
     * statement makes a text ({@link MADE_TEXT}), as `'x' + toString(i)`. So only a side the statement gives or makes
     * neither way, which may be a float, is written as `toString` writes it, which is long: `c.name + 1` compiles as it
     * did before floats were so written. NaN and the infinities count as given neither way.
     */
    summedText(
        jsonSql: string,
        given: unknown,
        other: unknown,
        plain: (json: string) => string,
        written: (json: string) => string
    ): string {
        if (isGivenNumber(given)) {
            return literal(givenText(given));
        }
        return typeof given === 'string' || given === MADE_TEXT || isGivenNumber(other)
            ? plain(jsonSql)
            : written(jsonSql);
    }

    /** `a op b` of the JSON numbers `a` and `b`, as JSON: `operator` is `+`, `-`, `*` or `/`. */
    arithmetic(a: string, b: string, operator: string): string {
        return this.scalar(`(${this.number(a)} ${operator} ${this.number(b)})`);
    }

    /**
     * The condition that the relationship row `edge` leaves the node whose id is `at` in `direction`, and the id of the
     * node it reaches.
     */
    leaves(edge: string, direction: Direction, at: string): [string, string] {
        switch (direction) {
            case 'OUTGOING':
                return [`${edge}.src = ${at}`, `${edge}.dst`];
            case 'INCOMING':
                return [`${edge}.dst = ${at}`, `${edge}.src`];
            default:
                // Either way, and a relationship from a node to itself once.
                return [
                    `(${edge}.src = ${at} OR ${edge}.dst = ${at})`,
                    `CASE WHEN ${edge}.src = ${at} THEN ${edge}.dst ELSE ${edge}.src END`
                ];
        }
    }

    /**
     * The joins of a walk's step from the node whose id is `at`: each hop's relationship, and each node a condition
     * reads. Gives them, the ids of the nodes the hops reach, in turn, and that no two relationships of the step are one.
     */
    steps(walk: Walk, at: string): Steps {
        if (walk.nodes.length !== walk.hops.length + 1) {
            throw new DrivineError("A walk's step has one node more than it has hops.");
        }
        if (walk.backwards && walk.hops.length !== 1) {
            throw new DrivineError('A walk of more than one hop a step is walked forwards.');
        }
        const joins: string[] = [];
        const reached: string[] = [];
        if (walk.nodes[0] !== undefined) {
            joins.push(`JOIN ${this.nodes} ${walk.nodes[0]} ON ${walk.nodes[0]}.nid = ${at}`);
        }
        walk.hops.forEach((hop, i) => {
            const [join, far] = this.leaves(hop.edge, hop.direction, reached[reached.length - 1] ?? at);
            joins.push(`JOIN ${this.edges} ${hop.edge} ON ${join}`);
            reached.push(far);
            const node = walk.nodes[i + 1];
            if (node !== undefined) {
                joins.push(`JOIN ${this.nodes} ${node} ON ${node}.nid = ${far}`);
            }
        });
        const distinct = walk.hops.flatMap((a, i) =>
            walk.hops.slice(i + 1).map((b) => `${a.edge}.eid <> ${b.edge}.eid`)
        );
        return { joins, reached, distinct };
    }

    /** A parameter's value `value` as the JSON text it is bound as. */
    parameterText(value: any): string {
        return jsonText(value);
    }

    /**
     * The property `key` of the node or relationship whose properties are `props`, where it is an item of a `RETURN` or
     * a `WITH`, returned or passed on: as {@link propertyOf} reads it, but on a store that must read such an item apart.
     */
    itemProperty(props: string, key: string): string {
        return this.propertyOf(props, key);
    }

    /**
     * The value at `keys`, each of a map in the one before, in the row a write is making (`Procedure.ROW`), where a
     * statement of the write reads it to work out what it writes: as {@link propertyOf} reads each key, but on a store
     * that must read it apart.
     */
    rowValue(keys: string[]): string {
        return keys.reduce((json, key) => this.propertyOf(json, key), Procedure.ROW);
    }

    /** The parameters of a statement that only reads, each bound at a marker of its own. */
    private readParameters(parameters: Record<string, any>): Parameters {
        return new Parameters(
            parameters,
            (it) => this.parameterJson(it),
            (it) => this.parameterCount(it),
            false,
            (it) => this.parameterText(it),
            this.parameterPath?.bind(this)
        );
    }

    /** `compiled` with the functions it calls declared before it. */
    private withFunctions(compiled: CompiledCypher): CompiledCypher {
        return this.functions.length === 0
            ? compiled
            : { ...compiled, sql: `WITH\n${this.functions.join('\n')}\n${compiled.sql}` };
    }

    /**
     * A `UNION`: each query's rows, in the order of the queries and each query's own order, as a graph engine gives
     * them; without `ALL`, each row once, where it is first given.
     */
    private union(query: Query, parameters: Record<string, any>): CompiledCypher {
        const parts = [query.clauses, ...query.unions.map((it) => it.clauses)];
        if (parts.some((part) => part.some(writes))) {
            unsupported('A write in a UNION');
        }
        if (new Set(query.unions.map((it) => it.all)).size > 1) {
            throw new DrivineError('UNION and UNION ALL are not mixed in one statement, as in Cypher.');
        }
        const names = parts.map((part) => (part[part.length - 1] as Return).projection.items.map((it) => it.name));
        if (new Set(names.map((it) => JSON.stringify(it))).size > 1) {
            throw new DrivineError(
                `Each query of a UNION returns the same names, as in Cypher: ${names
                    .map((it) => `(${it.join(', ')})`)
                    .join(' and ')}.`
            );
        }
        const writer = new CypherWriter(this, this.readParameters(parameters));
        const rows = parts
            .map(
                (clauses, i) =>
                    `SELECT ${i + 1} AS part, ${this.rowNumber} AS n, q.result FROM (\n${indent(
                        writer.query({ clauses, unions: [] })
                    )}\n) q`
            )
            .join('\nUNION ALL\n');
        let sql: string;
        if (query.unions[0].all) {
            sql = `SELECT u.result FROM (\n${indent(rows)}\n) u\nORDER BY u.part, u.n`;
        } else {
            // A row is given once, where it is first given: its rows are compared as JSON compares them.
            const key = this.comparable(json('u.result', { ordered: true }));
            const grouped = `SELECT ${key} AS result, MIN(u.part * 1000000000.0 + u.n) AS k FROM (\n${indent(
                rows
            )}\n) u\nGROUP BY ${key}`;
            sql = `SELECT d.result FROM (\n${indent(grouped)}\n) d\nORDER BY d.k`;
        }
        return { sql, parameters: writer.parameters.values, setup: [] };
    }
    // ----- A store's SQL -----

    /** A value `value` the statement writes, as JSON. */
    abstract literalJson(value: any): string;

    /** The parameter bound as `marker`, JSON text, as JSON. */
    abstract parameterJson(marker: string): string;

    /**
     * Where a store reads a value in a parameter that is a map, `$p.text`, straight from the JSON text bound as `marker`
     * (in a procedure, from the parameters' object, with the parameter's name first among `keys`): the value at `keys`,
     * as JSON. None where the store reads the parameter as JSON, then each key of it.
     */
    parameterPath?(marker: string, keys: string[]): string;

    /** The parameter bound as `marker`, a whole number, as one. */
    abstract parameterCount(marker: string): string;

    /** A JSON value as what compares, groups and orders as JSON. */
    abstract comparable(value: JsonValue): string;

    /** A SQL value `sql`, a number, a text or a truth value, as JSON. */
    abstract scalar(sql: string): string;

    /** The kind of the JSON `json`: `number`, `string`, `boolean`, `array`, `object` or `null`, as text. */
    abstract typeOf(jsonSql: string): string;

    /** Whether the JSON `json` is null, or JSON's null: no value, as on a graph engine. */
    abstract isJsonNull(jsonSql: string): string;

    /** The JSON `json`, or null where it is JSON's null. */
    abstract nullIfJsonNull(jsonSql: string): string;

    /** The JSON `json` as a number, where it is one. */
    abstract number(jsonSql: string): string;

    /** Whether the JSON `json` is a whole number. */
    abstract integral(jsonSql: string): string;

    /** The JSON `json` as text, where it is a string. */
    abstract text(jsonSql: string): string;

    /** The JSON `json` as a condition, where it is `true` or `false`. */
    abstract boolOf(jsonSql: string): string;

    /** The SQL number `sql` as a floating-point number. */
    abstract float(sql: string): string;

    /** A list of `items`, JSON each, nulls kept. */
    abstract jsonArray(items: string[]): string;

    /** A map of `entries`, JSON each, its keys in the order given. */
    abstract jsonObject(entries: [string, string][]): string;

    /** The map `json` with `entries` set over it. */
    abstract withEntries(jsonSql: string, entries: [string, string][]): string;

    /** The value of `key` in the JSON map `json`; null where there is none. */
    abstract propertyOf(jsonSql: string, key: string): string;

    /** The item of the JSON list `json` at the JSON `index`, counted from the end where it is negative. */
    abstract element(jsonSql: string, index: string): string;

    /**
     * The value of the JSON map `json` at the key the JSON `key` names; undefined where the store reads no key an
     * expression names, where such a key reads as null.
     */
    abstract keyed(jsonSql: string, key: string): string | undefined;

    /** Whether the JSON map `props` holds every entry of the JSON map `map`. */
    abstract containsAll(props: string, map: string): string;

    /** Whether the labels `labels`, a JSON list, hold `label`. */
    abstract hasLabel(labels: string, label: string): string;

    /** The items of the JSON list `json` as rows named `alias`, with columns `item` and `item_no`, counted from 1. */
    abstract elements(jsonSql: string, alias: string): string;

    /** The item at `index`, counted from 0, of the JSON list `jsonSql`: null where it has none. */
    abstract itemAt(jsonSql: string, index: number): string;

    /** How many items the JSON list `jsonSql` holds, as a SQL number. */
    abstract listSize(jsonSql: string): string;

    /**
     * Whether the JSON value `jsonSql`, not null, holds a null in a list or a map, at any depth: exactly, as an `IN` takes
     * a value that holds one to be equal to no item.
     */
    abstract holdsNull(jsonSql: string): string;

    /**
     * Whether the JSON values `x` and `y`, neither of them null, are equal, as Cypher compares values that may hold a
     * null: item by item and key by key, at any depth, false where a pair differs (a list's length, a map's keys, a
     * value's kind among them), else null where a pair holds a null, else true. Called where {@link holdsNull} says one
     * of them holds one; `equals` compares two that hold none, as {@link jsonEquals} or {@link identityEquals} does.
     */
    abstract nullsEqual(x: string, y: string, equals: (x: string, y: string) => string): string;

    /** The values `value` of a group, or of a query's rows ordered by `order`, as a JSON list: empty where there are none. */
    abstract aggregateList(value: string, order?: string): string;

    /** `collect`: the values `value` of a group that are not null, as a JSON list, in the `order` of the rows where they have one. */
    abstract collect(value: string, order?: string): string;

    /**
     * The items of the JSON list `list` once each, where each is first: what `collect(DISTINCT …)` keeps of what a `WITH`
     * before it collected, for a store dedupes no aggregate in the query that makes it.
     */
    abstract distinctItems(list: string): string;

    /**
     * The items of the JSON list `list` whose item in `identities`, a list as long, is first among those equal to it, as
     * {@link distinctItems} finds them: what `collect(DISTINCT …)` keeps of what holds a node or a relationship, by its
     * identity. Worked out in one pass, where comparing each identity with those before it took seconds over a few
     * thousand.
     */
    abstract firstOfEach(list: string, identities: string): string;

    /**
     * `min` or `max` of the JSON values `value` of a group: of values of several kinds, as {@link kindOrder} orders them;
     * of one kind, as JSON orders them, or by `key` where there is one, what orders them.
     */
    abstract extreme(value: string, min: boolean, key?: string): string;

    /**
     * The JSON list of ids `ids` with each id the map `{[key]: id}`, a node's or a relationship's identity (see
     * `CypherWriter.identityOf`), and null where the list is: by its text, so it reads no aggregate in a subquery, as
     * Oracle reads none.
     */
    abstract idTokens(ids: string, key: string): string;

    /**
     * `a + b` of the JSON values `a` and `b`: numbers added, lists joined, texts put together. `given` is what the
     * statement gives each as, where it does, or {@link MADE_TEXT} where it makes it a text without giving it: see
     * {@link summedText}.
     */
    abstract add(a: string, b: string, given?: [unknown, unknown]): string;

    /** The remainder of the SQL numbers `a` and `b`. */
    abstract modulo(a: string, b: string): string;

    /** Whether the text `a` starts with the text `b`. */
    abstract startsWith(a: string, b: string): string;

    /** Whether the text `a` ends with the text `b`. */
    abstract endsWith(a: string, b: string): string;

    /** Whether the whole of the text `text` matches the regular expression `pattern`, as `=~` matches it. */
    abstract matches(text: string, pattern: string): string;

    /** `split`: the SQL text `text` cut at each `separator`, a SQL text, as a JSON list of texts. */
    abstract split(text: string, separator: string): string;

    /** The SQL text `text`, its characters backwards. */
    abstract reverseText(text: string): string;

    /** Whether the text `a` holds the text `b`. */
    abstract containsText(a: string, b: string): string;

    /**
     * A function of one argument `json` whose SQL is the store's own: `size`, `toLower`, `head`…; undefined when there
     * is none.
     */
    abstract function(name: string, jsonSql: string): string | undefined;

    /** The `OFFSET` and `LIMIT` of a query, each a SQL whole number or undefined. */
    abstract page(skip?: string, limit?: string): string[];

    /** The list of ids holding only `id`. */
    abstract ids(id: string): string;

    /** The lists of ids `lists`, one after another. */
    abstract joinIds(lists: string[]): string;

    /** The JSON list of ids `json` as the store's list of ids, in its order: null where the JSON is. */
    abstract storeIds(jsonSql: string): string;

    /** Whether the id `id` is among the list of ids `list`. */
    abstract idIn(id: string, list: string): string;

    /** Whether two lists of ids share an id. */
    abstract idsOverlap(a: string, b: string): string;

    /** How many ids the list `list` holds, as JSON. */
    abstract idCount(list: string): string;

    /** The ids of the list `list` as rows named `alias`, with columns `id` and `ord`, in its order. */
    abstract idRows(list: string, alias: string): string;

    /** A walk of a variable-length relationship or a quantified path pattern: see {@link Walk}. */
    abstract walk(walk: Walk): Walked;

    /**
     * `reduce`: the JSON list `list` folded from `initial`, the JSON each step gives of the value so far and the item,
     * as `step` writes it, as JSON; null where the list is. `name` names what the fold reads from. Where the step is
     * worked out where it cannot read the row, it is `contextStep`, which reads what the step reads of the row, and the
     * statement's parameters, from the JSON map `context` gives: asked for only there, for a value such as a path is not
     * JSON.
     */
    abstract reduce(
        name: string,
        initial: string,
        list: string,
        step: (accumulator: string, item: string) => string,
        context: () => string,
        contextStep: (accumulator: string, item: string, context: string) => string
    ): string;

    /** `randomUUID()`: a new UUID, as SQL text in its usual form. */
    abstract uuid(): string;

    /**
     * One of openCypher's functions of numbers, `name`, one of `MATH_FUNCTIONS` or `atan2`, of `numbers`, the store's SQL
     * numbers, as a SQL float: null where one is null. Neo4j works these out as Java's doubles, and gives NaN or an
     * infinity for some (`log(0)`, `sqrt(-1)`, `exp(1000)`, `cot(0)`), which JSON holds neither of: there, the store
     * fails.
     */
    abstract math(name: string, numbers: string[]): string;

    /** `right`: the last `count` characters of the SQL text `text`, or all of it where it has fewer. */
    abstract rightText(text: string, count: string): string;

    /** `range`: the whole numbers from `from` to `to`, `step` apart, SQL numbers each, as a JSON list. */
    abstract range(from: string, to: string, step: string): string;

    /** A node as JSON: its properties, its stamp among them, as Drivine gives a node; null where there is no node. */
    abstract nodeJson(node: NodeValue): string;

    // ----- A store's procedure, for a statement that writes -----

    /**
     * The statement that runs the procedure whose statements are `body`, each ending in `;`, and gives the rows it
     * returns, of one column, {@link returnRows}. The procedure declares the variables {@link Procedure} names and sets
     * its parameters from the object bound at {@link PARAMETERS_OBJECT}.
     */
    abstract procedure(body: string[]): ProcedureCall;

    /** The statements that return the rows of the query `query`, whose one column is `result`. */
    abstract returnRows(query: string): string[];

    /** The statement that fails the procedure with `message`. */
    abstract raise(message: string): string;

    /**
     * A whole number that fails the statement when it is worked out, with `message` and the SQL value `value` it names:
     * what a compiled statement does where Neo4j fails on a value it reads. No store works it out before a row that
     * needs it, even where `value` is a constant, as a store may work out a failing expression of constants alone. But
     * in a WHERE, one that reads nothing of a row is tested before any row on Postgres, which tests such a condition
     * once, first: as it does any expression that fails, such as `1 / 0`.
     */
    abstract failure(message: string, value: string): string;

    /** The id at `key` of the JSON map `json`, or with no key the id `json` is, as the store's id. */
    abstract idOf(jsonSql: string, key?: string): string;

    /** The JSON list `list` with the JSON `item` after its items. */
    abstract appended(list: string, item: string): string;

    /** The JSON map `json` without the entries whose values are null. */
    abstract stripNulls(jsonSql: string): string;

    /** The JSON map `props` with the entries of `map` set over it, an entry whose value is null removing its key. */
    abstract merged(props: string, map: string): string;

    /** The labels `labels`, a JSON list, without `label`. */
    abstract withoutLabel(labels: string, label: string): string;
}
