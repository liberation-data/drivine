import { isInt } from 'neo4j-driver';
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

const PACKAGE = '@liberation-data/drivine-cypher-compiler';
let loaded: Compile | undefined;

/**
 * The shared compiler, required on the first compile for a SQL store, so an application on a graph engine alone never
 * loads it. The package's own entry starts its Wasm module on its first `compile`, not on `require`.
 */
function compileFunction(): Compile {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded ??= (require(PACKAGE) as { compile: Compile }).compile;
    return loaded;
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
    return JSON.parse(text, (_key, value, context?: { source?: string }) =>
        typeof value === 'number' &&
        !Number.isSafeInteger(value) &&
        context?.source &&
        /^-?[0-9]+$/.test(context.source)
            ? BigInt(context.source)
            : value
    );
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
 * - a `Date` is `{"$temporal": "DATE_TIME", "text": <its toISOString()>}`, as Drivine binds it.
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
    if (value instanceof Uint8Array || value instanceof Int8Array) {
        const base64 = Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
        return `{"$bytes":${JSON.stringify(base64)}}`;
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

function float(value: number): string {
    return `{"$float":${JSON.stringify(Object.is(value, -0) ? '-0' : String(value))}}`;
}
