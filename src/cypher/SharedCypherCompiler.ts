import { isInt } from '@/utils/Integers';
import { nodeRequire } from '@/utils/NodeRequire';
import { parseExactIntegers } from '@/utils/ExactIntegers';
import { DrivineError } from '@/DrivineError';
import { CompiledCypher } from '@/cypher/CompiledCypher';
import { CypherFloat } from '@/cypher/CypherFloat';
import { DrivineLogger } from '@/logger/DrivineLogger';

/** The stores the shared compiler compiles Cypher for. */
export type SharedStore = 'postgres' | 'oracle' | 'sqlite';

/**
 * What a compiler compiles a statement with: anything with {@link SharedCypherCompiler.compile}'s shape, so a test can
 * hand a connection its own.
 */
export interface CypherCompiler {
    compile(cypher: string, parameters?: Record<string, any>): CompiledCypher;
}

/**
 * The graph a statement is compiled against, and on Oracle what its store keeps: whether the graph's stored
 * `nullsEqual` and `era` functions may be called, and which labels' properties have an index (`[label, property]`).
 */
export interface SharedGraph {
    name: string;
    nullsEqualStored?: boolean;
    eraStored?: boolean;
    indexedProperties?: ReadonlyArray<readonly [string, string]>;
}

/** The shared compiler's entry point: a request as JSON text in, the answer as JSON text out. */
type Compile = (request: string) => string;

/**
 * A call of one of the module's SQLite host functions by its SQL name, its arguments and its answer each written as the
 * package's README says ("Host functions from JavaScript"): see SqliteHostFunctions.
 */
type HostCall = (name: string, args: string) => string;

/** What Drivine uses of the shared compiler's package. */
export interface CypherCompilerModule {
    compile: Compile;
    hostCall: HostCall;
}

const PACKAGE = '@liberation-data/drivine-cypher-compiler';
let loaded: CypherCompilerModule | undefined;

/**
 * The shared compiler, required on the first compile for a SQL store, the first full-text search, or the first call of
 * a host function on SQLite, so an application on a graph engine that doesn't search by text never loads it. The
 * package's own entry starts its Wasm module on its first call, not on `require`.
 */
export function cypherCompilerModule(): CypherCompilerModule {
    loaded ??= nodeRequire<CypherCompilerModule>(PACKAGE);
    return loaded;
}

function compileFunction(): Compile {
    return cypherCompilerModule().compile;
}

/**
 * Has Drivine use `compiler`, the shared compiler's package, rather than requiring it: as in a page, which imports the
 * package's ES module itself, since that loads its Wasm by `fetch`. Its `compile` compiles Cypher, and its `hostCall`
 * runs the host functions compiled SQL calls on SQLite. Set before the first compile.
 *
 *     import * as compiler from '@liberation-data/drivine-cypher-compiler';
 *     useCypherCompiler(compiler);
 */
export function useCypherCompiler(compiler: CypherCompilerModule): void {
    loaded = compiler;
}

/** Whether the shared compiler has been loaded in this process: for the test that a graph engine's app never loads it. */
export function sharedCompilerLoaded(): boolean {
    return loaded !== undefined;
}

/**
 * Cypher compiled to SQL over a graph's tables by the shared compiler, the Kotlin Multiplatform module of
 * drivine-cypher-spec, built for Wasm: the compiler drivine4j runs, so a statement gives the same SQL in both, byte for
 * byte, but for an Oracle write's rows (see graphJson), and a compiler fix lands once, in the module. A compiler compiles one statement at a
 * time; after it, {@link callsStoredNullsEqual} and {@link callsStoredEra} say which of an Oracle graph's stored
 * functions the last statement calls.
 */
export class SharedCypherCompiler implements CypherCompiler {
    /** Whether the last statement compiled calls the graph's stored `nullsEqual` function (Oracle). */
    callsStoredNullsEqual = false;
    /** Whether the last statement compiled calls the graph's stored `era` function (Oracle). */
    callsStoredEra = false;

    private readonly logger = new DrivineLogger(SharedCypherCompiler.name);

    constructor(
        private readonly store: SharedStore,
        private readonly graph: SharedGraph
    ) {}

    compile(cypher: string, parameters: Record<string, any> = {}): CompiledCypher {
        const request = `{"store":${JSON.stringify(this.store)},"graph":${JSON.stringify(
            graphJson(this.store, this.graph)
        )},"cypher":${JSON.stringify(cypher)},"parameters":${parametersJson(parameters)}}`;
        const answer = answerOf(compileFunction()(request));
        if ('refusal' in answer) {
            throw new DrivineError(answer.refusal);
        }
        if ('error' in answer) {
            throw new DrivineError(`The Cypher compiler can't read the request: ${answer.error}`);
        }
        // What it warns of, such as a RETURN of several items, logged as drivine4j logs it.
        for (const warning of answer.warnings ?? []) {
            this.logger.warn(warning);
        }
        this.callsStoredNullsEqual = answer.storedFunctions?.nullsEqual ?? false;
        this.callsStoredEra = answer.storedFunctions?.era ?? false;
        return {
            sql: answer.sql,
            parameters: counts(decoded(answer.parameters), parameters),
            setup: answer.setup ?? [],
            // On Oracle a write's rows come back in one row, as text (`oracleRowsAsText`): see graphJson.
            rows: 'one',
            nonFinite: answer.nonFinite ?? false
        };
    }
}

/** The stores the shared module writes a full-text search for: the SQL stores, and the graph engines' heads. */
export type SearchStore = SharedStore | 'neo4j' | 'memgraph' | 'falkordb';

/**
 * What the library found of a full-text index, as the module's search request gives it: on Postgres whether its trigram
 * index is made, on Oracle the table its Oracle Text index is over, and on Neo4j and Memgraph the index's name.
 */
export interface SearchIndex {
    trigram?: boolean;
    oracleText?: string;
    name?: string;
}

/**
 * A full-text search, as the module's `search` request has it (its README, "Full-text search"): the root's labels, the
 * index's first; every property the index covers, in the order it declares them; the user's query; what was found of the
 * index; and on a graph engine how many rows the search wants, whether its hits are filtered after the index, and what
 * the head names a hit's node and score.
 */
export interface SearchRequest {
    labels: string[];
    properties: string[];
    query: string;
    index?: SearchIndex;
    topK?: number;
    filtered?: boolean;
    alias?: string;
    scoreAlias?: string;
}

/**
 * A full-text search as the module writes it: on a SQL store one query of the ranked candidates, `nid` and `score`, the
 * best scoring 1, which the library joins back to its node table; on a graph engine the search's head, the index's `CALL`
 * and each hit's node and score against the best. Its parameters are named `_cy_ft<n>`, which no caller binds.
 */
export interface SearchPlan {
    statement: string;
    parameters: Record<string, any>;
}

/**
 * The full-text search `request` asks of `store`, over the graph named `graph` on a SQL store, as the shared module plans
 * it: drivine4j's statements, byte for byte. What it warns of is logged. Throws the module's refusal of a query with no
 * word to look for.
 */
export function fullTextSearch(store: SearchStore, graph: string | undefined, request: SearchRequest): SearchPlan {
    const answer = searchAnswer({ store, ...(graph !== undefined ? { graph: { name: graph } } : {}), search: request });
    for (const warning of answer.warnings ?? []) {
        new DrivineLogger('FullTextSearch').warn(warning);
    }
    const statement = answer.sql ?? answer.cypher;
    if (typeof statement !== 'string') {
        throw new DrivineError(`The full-text search on ${store} gave no statement.`);
    }
    return { statement, parameters: decoded(answer.parameters) };
}

/**
 * The statement that finds what the graph's catalog records of the full-text index on `label`'s `properties`, as the
 * shared module writes it: on Postgres a row where its trigram index is made, on Oracle the table its Oracle Text index
 * is over, and no row where none is made. Undefined on a store that keeps no record of it.
 */
export function fullTextIndexLookup(
    store: SharedStore,
    graph: string,
    label: string,
    properties: string[]
): SearchPlan | undefined {
    const answer = searchAnswer({ store, graph: { name: graph }, searchIndex: { label, properties } });
    return typeof answer.sql === 'string'
        ? { statement: answer.sql, parameters: decoded(answer.parameters) }
        : undefined;
}

/**
 * What the module's `idSql` request writes (its `IdSql`): `hasId`, whether the node's id is the id whose JSON, as the node
 * holds it, is `json`; `keyText`, the id held as the text a write plan keys a node by (a temporal value's tag read as its
 * text `v`); `property`, the property read as text, which a range index is made over; and `hasProperty`, whether the node
 * has the property at all.
 */
export type IdSqlHelper = 'hasId' | 'keyText' | 'property' | 'hasProperty';

/** The SQL the module wrote for each request asked of {@link idSql}, by the request: it is the same every time. */
const idSqlWritten = new Map<string, string>();

/**
 * The SQL of `helper` over the property `key` of the node row `alias` on `store`, as the shared module writes it, each
 * comparison of an id written over the expressions the store's range index and uniqueness constraint are made over, so
 * the index answers it, and a temporal id's tag is equal only to the same value's (liberation-data/drivine-cypher-spec#107).
 * `key` is given as the node holds it (see heldKey). `json`, for `hasId`, is the SQL of the id's JSON as it is bound,
 * written in as given: on Oracle and SQLite more than once, so it is bound by name. Cached, since the SQL is static.
 */
export function idSql(store: SharedStore, helper: IdSqlHelper, alias: string, key: string, json?: string): string {
    const request = JSON.stringify({ idSql: { store, helper, alias, key, ...(json !== undefined ? { json } : {}) } });
    let sql = idSqlWritten.get(request);
    if (sql === undefined) {
        const answer = JSON.parse(compileFunction()(request)) as { sql?: string; error?: string };
        if (typeof answer.sql !== 'string') {
            throw new DrivineError(`The shared module wrote no ${helper} for ${store}: ${answer.error ?? 'no SQL'}`);
        }
        sql = answer.sql;
        idSqlWritten.set(request, sql);
    }
    return sql;
}

/**
 * A row of the library's own SQL that a fragment's Cypher names as a variable: a node, `{node: "<alias>", labels}`, where
 * `labels` are those the statement knows it has, so an equality of its property is answered by that label's index; or a
 * relationship, `{relationship: "<alias>"}`. The alias ends with `_`, as none the compiler names its own rows does: the
 * module refuses another.
 */
export type FragmentVariable = { node: string; labels?: string[] } | { relationship: string };

/**
 * The part of a statement a fragment is, as the module's `fragment` request gives it: a `condition` for a `WHERE` to keep
 * rows by, a `value` for the library's SQL to group or bind by, or an `order`, descending where `descending` is true. Each
 * is a Cypher expression over the {@link FragmentVariable}s, of the forms the module's README lists ("Fragments").
 */
export type FragmentPart = { condition: string } | { value: string } | { order: string; descending?: boolean };

/**
 * A fragment as the module compiles it: its `terms`, one for a condition or a value and an order's in their order; the
 * `parameters` they bind, `$p` as `_cy_p` and on Oracle `_cyk_p` (the key a property is compared with it by); whether a
 * value they give may be NaN or an infinity (`nonFinite`); the optimizer `hints` the statement's outermost `SELECT` is to
 * carry (Oracle's); and on Oracle which of the graph's stored functions the terms call.
 */
export interface SqlFragment {
    terms: string[];
    parameters: Record<string, any>;
    nonFinite: boolean;
    hints: string[];
    storedFunctions: { nullsEqual: boolean; era: boolean; temporalArithmetic: boolean };
    /**
     * The labels every row a condition keeps carries, by variable, as the module says (drivine-cypher-spec#373): on
     * Oracle, those of each equality it reads through a label's index that is one of the condition's own conjuncts. A
     * statement needn't test them again. Empty for a value and an order, and on Postgres and SQLite.
     */
    impliedLabels: Record<string, string[]>;
}

/**
 * The fragment `part`, a Cypher expression over `variables`, rows of the library's own SQL, with `parameters`, as the
 * shared module compiles it for `store`'s layout of `graph` (its README, "Fragments"; liberation-data/drivine-cypher-spec#161),
 * so a filter or an order the library writes itself compares, sorts and binds a value as a compiled statement does. The
 * parameters are written as a statement's are ({@link parametersJson}). Throws the module's refusal of a form it doesn't
 * take as a DrivineError. One statement's fragments are named apart by {@link SqlFragments}.
 */
export function fragment(
    store: SharedStore,
    graph: SharedGraph,
    part: FragmentPart,
    variables: Record<string, FragmentVariable>,
    parameters: Record<string, any> = {}
): SqlFragment {
    const request = `{"store":${JSON.stringify(store)},"graph":${JSON.stringify(
        graphJson(store, graph)
    )},"fragment":${JSON.stringify({ ...part, variables })},"parameters":${parametersJson(parameters)}}`;
    const answer = answerOf(compileFunction()(request)) as unknown as
        | FragmentAnswer
        | { refusal: string }
        | { error: string };
    if ('refusal' in answer) {
        throw new DrivineError(answer.refusal);
    }
    if ('error' in answer) {
        throw new DrivineError(`The Cypher compiler can't read the fragment's request: ${answer.error}`);
    }
    return {
        terms: answer.terms,
        parameters: decoded(answer.parameters),
        nonFinite: answer.nonFinite ?? false,
        hints: answer.hints ?? [],
        storedFunctions: {
            nullsEqual: answer.storedFunctions?.nullsEqual ?? false,
            era: answer.storedFunctions?.era ?? false,
            temporalArithmetic: answer.storedFunctions?.temporalArithmetic ?? false
        },
        impliedLabels: answer.impliedLabels ?? {}
    };
}

interface FragmentAnswer {
    terms: string[];
    parameters: Record<string, any>;
    nonFinite?: boolean;
    hints?: string[];
    storedFunctions?: { nullsEqual?: boolean; era?: boolean; temporalArithmetic?: boolean };
    impliedLabels?: Record<string, string[]>;
}

interface SearchAnswer {
    sql?: string | null;
    cypher?: string;
    parameters: Record<string, any>;
    warnings?: string[];
}

/** The module's answer to a full-text request; its refusal, or its error, thrown. */
function searchAnswer(request: Record<string, any>): SearchAnswer {
    const answer = answerOf(compileFunction()(JSON.stringify(request))) as
        | SearchAnswer
        | { refusal: string }
        | { error: string };
    if ('refusal' in answer) {
        throw new DrivineError(answer.refusal);
    }
    if ('error' in answer) {
        throw new DrivineError(`The full-text search can't be asked of the shared module: ${answer.error}`);
    }
    return answer;
}

/** The graph as the request has it: Oracle's options only on Oracle, where they mean something. */
function graphJson(store: SharedStore, graph: SharedGraph): Record<string, any> {
    if (store !== 'oracle') {
        return { name: graph.name };
    }
    return {
        name: graph.name,
        // A write's rows in one row, as JSON text in the column `rows:json`, not a row each in a JSON column: in
        // node-oracledb's thin mode, an implicit result's JSON column gives only the rows it prefetched, and some values
        // fail with NJS-126 (oracle/node-oracledb#1795). Drop it once a release of node-oracledb reads them all.
        oracleRowsAsText: true,
        // Each value a statement returns encoded again, JSON_TRANSFORM(value, KEEP '$'): a document updated in place comes
        // back as OSON version 2, which node-oracledb's thin mode can't read (NJS-126, oracle/node-oracledb#1796,
        // liberation-data/drivine-cypher-spec#165). oracleRowsAsText covers a write's rows; this covers reads too.
        oracleReencodeJson: true,
        // A read's rows each as its extended JSON text, a CLOB, not JSON: node-oracledb's thin mode reads a JSON value's
        // numbers through a JavaScript number, so a whole number past 2^53 lost its digits (#737,
        // liberation-data/drivine-cypher-spec#198). The text keeps them, and marks a float as one; see OracleConnection.
        oracleReadsAsText: true,
        nullsEqualStored: graph.nullsEqualStored ?? true,
        eraStored: graph.eraStored ?? true,
        indexedProperties: (graph.indexedProperties ?? []).map(([label, property]) => [label, property])
    };
}

interface Answer {
    sql: string;
    parameters: Record<string, any>;
    setup?: string[];
    warnings?: string[];
    nonFinite?: boolean;
    storedFunctions?: { nullsEqual?: boolean; era?: boolean };
}

/** The compiler's answer, read: a whole number past 2^53 as a `bigint`, as Drivine binds a count of the Neo4j driver's Integer. */
function answerOf(text: string): Answer | { refusal: string } | { error: string } {
    return parseExactIntegers(text);
}

/**
 * The values the answer binds, with its tags read: a float, `{"$float": "2.0"}`, the number; a decimal,
 * `{"$decimal": "2.5"}`, its text, as Drivine binds a decimal. Most are JSON text already, bound as such.
 */
function decoded(value: any): any {
    if (Array.isArray(value)) {
        return value.map(decoded);
    }
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 1 && keys[0] === '$float') {
            return Number(value.$float);
        }
        if (keys.length === 1 && keys[0] === '$decimal') {
            return String(value.$decimal);
        }
        return Object.fromEntries(keys.map((key) => [key, decoded(value[key])]));
    }
    return value;
}

/** A count (`SKIP`, `LIMIT`) bound as Drivine binds it: a `bigint` where the caller gave a `bigint` or the Neo4j driver's Integer. */
function counts(bound: Record<string, any>, given: Record<string, any>): Record<string, any> {
    for (const key of Object.keys(bound)) {
        const name = key.startsWith('_cyn_') ? key.substring(5) : undefined;
        if (name !== undefined && (typeof given[name] === 'bigint' || isInt(given[name])) && bound[key] !== null) {
            bound[key] = BigInt(bound[key]);
        }
    }
    return bound;
}

const LONG_RANGE = 2 ** 63;

/**
 * A statement's parameters as the tagged JSON the shared compiler reads (its README, "drivine4j's own calls"), keeping
 * what plain JSON loses of the kinds the compiled SQL depends on:
 *
 * - a JavaScript number that is whole, from -2^63 to below 2^63, is an integer, written as its digits; one with a
 *   fraction a float, written as JSON writes it (`2.5`, `1e-7`). A whole one past a long's range, NaN and the
 *   infinities are floats too, written `{"$float": "<text>"}`, which JSON has no plain form of. -0, a whole number,
 *   is the integer 0.
 * - a `bigint` and the Neo4j driver's `Integer` are their digits, unquoted: a whole number however large.
 * - a {@link CypherFloat} is a float, `{"$float": "<text>"}`, even where it is whole: `cypherFloat(5)` is 5.0, and
 *   `cypherFloat(-0)` is -0.0, `{"$float": "-0"}`.
 * - a `Date` is `{"$temporal": "DATE_TIME", "text": <its toISOString()>}`, as Drivine binds it. Each of the Neo4j
 *   driver's temporal values (`Date`, `Time`, `LocalTime`, `LocalDateTime`, `DateTime`, `Duration`) and each `Temporal`
 *   one (`PlainDate`, `PlainTime`, `PlainDateTime`, `ZonedDateTime`, `Instant`, `Duration`) is tagged by its kind, with
 *   its ISO 8601 text (see temporalKind).
 * - bytes (`Buffer`, `Uint8Array`, `Int8Array`) are `{"$bytes": "<base64>"}`.
 * - any other iterable (a `Set`, a `Map`'s entries, a generator) is the list of its items; a map is its entries in
 *   order, those undefined left out, wrapped as `{"$map": {...}}` where a key starts with `$`, so no map a caller binds
 *   is read as a tag.
 */
export function parametersJson(parameters: Record<string, any>): string {
    return written(parameters);
}

function written(value: any): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'number') {
        return number(value);
    }
    if (typeof value === 'bigint' || isInt(value)) {
        return value.toString();
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
        return JSON.stringify(value);
    }
    return typeof value === 'object' ? composite(value) : 'null';
}

/** A JavaScript number: a whole one in a long's range an integer, one with a fraction a float, else a tagged float. */
function number(value: number): string {
    if (Number.isInteger(value) && value >= -LONG_RANGE && value < LONG_RANGE) {
        return Object.is(value, -0) ? '0' : String(BigInt(value));
    }
    return Number.isFinite(value) && !Number.isInteger(value) ? JSON.stringify(value) : float(value);
}

/** `bytes` as base64, by `btoa`, which Node and a page both have: a page has no `Buffer`. */
export function base64(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    return btoa(binary);
}

/** A `Date`, bytes, a list or another iterable, or a map. */
function composite(value: object): string {
    if (value instanceof CypherFloat) {
        return float(value.value);
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? 'null'
            : `{"$temporal":"DATE_TIME","text":${JSON.stringify(value.toISOString())}}`;
    }
    const temporal = temporalKind(value);
    if (temporal) {
        return `{"$temporal":"${temporal}","text":${JSON.stringify(temporalText(value))}}`;
    }
    if (value instanceof Uint8Array || value instanceof Int8Array) {
        return `{"$bytes":${JSON.stringify(base64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)))}}`;
    }
    if (Array.isArray(value)) {
        return `[${value.map(written).join(',')}]`;
    }
    if (typeof (value as any)[Symbol.iterator] === 'function') {
        return written(Array.from(value as Iterable<unknown>));
    }
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    const map = `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${written(item)}`).join(',')}}`;
    return entries.some(([key]) => key.startsWith('$')) ? `{"$map":${map}}` : map;
}

/**
 * The kind the shared compiler's tag names (`{"$temporal": <kind>, "text": …}`) of `value`, where it is one of the Neo4j
 * driver's temporal values or a `Temporal` one, each of which its `toString()` writes as ISO 8601 text; undefined for
 * anything else (#767, a port of drivine4j#833: each was bound as a map of its fields). Told by the driver's own marker
 * of each kind and by `Temporal`'s `Symbol.toStringTag`, not by importing either, so code that runs in a page needs
 * neither, as {@link isInt} tells an integer. A `Temporal.Instant` is a datetime at UTC.
 */
function temporalKind(value: object): string | undefined {
    const it = value as Record<string, unknown>;
    for (const [marker, kind] of DRIVER_TEMPORAL_KINDS) {
        if (it[marker] === true) {
            return kind;
        }
    }
    return TEMPORAL_KINDS[(value as any)[Symbol.toStringTag]];
}

/**
 * The ISO 8601 text of `value`, a temporal value ([temporalKind]), as the store layout holds it: a datetime in a named
 * zone at its offset, the zone dropped, as the store holds no named zone (the spec's README, "A time"). One in a named
 * zone with no offset, as the Neo4j driver's `DateTime` may be, is refused by name: its offset isn't known here. One
 * whose zone is itself an offset (`[+01:00]`) is at that offset. A `Temporal.ZonedDateTime` is written at its exact
 * `offset`, as its `toString()` rounds one of seconds (a zone's local mean time, `-00:44:30`) to the minute. The driver and `Temporal` write a year before 1 or past 9999 with six
 * digits, and the module reads one of fewer than five with four (`-0005`, not `-000005`).
 */
function temporalText(value: object): string {
    const text = zonedAtOffset(value);
    // The module reads an offset to the minute, and bound a tag of one with seconds as a text (drivine-cypher-spec#357).
    if (/[+-]\d\d:\d\d:\d\d$/.test(text)) {
        throw new DrivineError(
            `A temporal parameter at an offset with seconds (${text}) can't be bound on a SQL store, which holds an offset to the minute.`
        );
    }
    return text;
}

/** The ISO 8601 text of `value`, a temporal value, in the ISO calendar, its named zone dropped to its offset (see temporalText). */
function zonedAtOffset(value: object): string {
    // In the ISO calendar, as the store keeps no other: `toString()` annotates another (`2024-01-15[u-ca=hebrew]`).
    const it = typeof (value as any).withCalendar === 'function' ? (value as any).withCalendar('iso8601') : value;
    const text = (
        it[Symbol.toStringTag] === 'Temporal.ZonedDateTime' ? `${it.toPlainDateTime()}${it.offset}` : String(it)
    ).replace(/^([+-])00(\d{4}-)/, '$1$2');
    const zone = text.indexOf('[');
    if (zone < 0) {
        return text;
    }
    const kept = text.slice(0, zone);
    const offsetZone = /^\[([+-]\d\d:\d\d(:\d\d)?)\]$/.exec(text.slice(zone));
    if (offsetZone && !/(Z|[+-]\d\d:\d\d(:\d\d)?)$/.test(kept)) {
        return kept + offsetZone[1];
    }
    if (!/(Z|[+-]\d\d:\d\d(:\d\d)?)$/.test(kept)) {
        throw new DrivineError(
            `A datetime parameter in a named zone with no offset (${text}) can't be bound on a SQL store, which holds a datetime's offset, not its zone: give its offset too.`
        );
    }
    return kept;
}

/** Each of the Neo4j driver's temporal kinds by the property it marks its values with, and the tag's kind of it. */
const DRIVER_TEMPORAL_KINDS: [string, string][] = [
    ['__isDate__', 'DATE'],
    ['__isTime__', 'TIME'],
    ['__isLocalTime__', 'LOCAL_TIME'],
    ['__isLocalDateTime__', 'LOCAL_DATE_TIME'],
    ['__isDateTime__', 'DATE_TIME'],
    ['__isDuration__', 'DURATION']
];

/** Each `Temporal` kind by its `Symbol.toStringTag`, and the tag's kind of it. */
const TEMPORAL_KINDS: Record<string, string> = {
    'Temporal.PlainDate': 'DATE',
    'Temporal.PlainTime': 'LOCAL_TIME',
    'Temporal.PlainDateTime': 'LOCAL_DATE_TIME',
    'Temporal.ZonedDateTime': 'DATE_TIME',
    'Temporal.Instant': 'DATE_TIME',
    'Temporal.Duration': 'DURATION'
};

function float(value: number): string {
    return `{"$float":${JSON.stringify(Object.is(value, -0) ? '-0' : String(value))}}`;
}
