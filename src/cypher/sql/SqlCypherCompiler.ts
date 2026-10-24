import { DrivineError } from '@/DrivineError';
import { CypherReader } from '@/cypher/CypherReader';
import { Query, Return } from '@/cypher/ast/Query';
import { CompiledCypher } from '@/cypher/sql/CompiledCypher';
import { CypherWriter } from '@/cypher/sql/CypherWriter';
import { indent, unsupported, writes } from '@/cypher/sql/CypherSyntax';
import { Parameters } from '@/cypher/sql/Parameters';
import { Procedure, ProcedureCall, Walk, Walked } from '@/cypher/sql/Procedure';
import { Shared, TemporalSql } from '@/cypher/sql/TemporalSql';
import { Temporals } from '@/cypher/sql/Temporals';
import { json, JsonValue, NodeValue } from '@/cypher/sql/Value';

/** How long a value {@link SqlCypherCompiler.shared} binds may be written where it is read, in characters. */
const SHARED_ABOVE = 200;

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

    /** Whether {@link shared} binds a long value: not in an expression that aggregates, whose aggregate a subquery would take from its group. */
    sharing = true;

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
                true
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

    /** `a op b` of the JSON numbers `a` and `b`, as JSON: `operator` is `+`, `-`, `*` or `/`. */
    arithmetic(a: string, b: string, operator: string): string {
        return this.scalar(`(${this.number(a)} ${operator} ${this.number(b)})`);
    }

    /** The parameters of a statement that only reads, each bound at a marker of its own. */
    private readParameters(parameters: Record<string, any>): Parameters {
        return new Parameters(
            parameters,
            (it) => this.parameterJson(it),
            (it) => this.parameterCount(it)
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

    /** The values `value` of a group, or of a query's rows ordered by `order`, as a JSON list: empty where there are none. */
    abstract aggregateList(value: string, order?: string): string;

    /**
     * `collect`: the values `value` of a group that are not null, as a JSON list, in the `order` of the rows where they
     * have one; once each with `distinct`, in no order.
     */
    abstract collect(value: string, distinct: boolean, order?: string): string;

    /** `min` or `max` of the JSON values `value` of a group: of values of several kinds, as {@link kindOrder} orders them. */
    abstract extreme(value: string, min: boolean): string;

    /** `a + b` of the JSON values `a` and `b`: numbers added, lists joined, texts put together. */
    abstract add(a: string, b: string): string;

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

    /** A walk of a variable-length relationship: see {@link Walk}. */
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
