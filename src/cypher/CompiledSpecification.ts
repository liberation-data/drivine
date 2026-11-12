import { isInt } from '@/utils/Integers';
import { QuerySpecification } from '@/query/QuerySpecification';
import type { CypherCompiler } from '@/cypher/SharedCypherCompiler';
import { CompiledRows } from '@/cypher/CompiledCypher';
import { CypherFloat } from '@/cypher/CypherFloat';

/**
 * A specification of a Cypher statement compiled to SQL, and what runs before it on the same connection; how its rows
 * come back, and whether they may hold numbers that stand for NaN or an infinity, as the compiler said (see
 * CompiledCypher).
 */
export interface CompiledSpecification<T> {
    spec: QuerySpecification<T>;
    setup: string[];
    rows: CompiledRows;
    nonFinite: boolean;
}

/**
 * The Cypher statement of `spec` compiled to the store's SQL by `compiler`, as a specification of that SQL with the
 * same paging and post-processors: so a statement written for a graph engine runs on a SQL store and gives the same
 * rows. It is compiled with `parameters`, by default {@link cypherParameters} of `spec`: a caller that compiles the
 * statement again reads them once and passes each compile the same ones.
 */
export function compiledSpecification<T>(
    spec: QuerySpecification<T>,
    compiler: CypherCompiler,
    parameters: Record<string, any> = cypherParameters(spec)
): CompiledSpecification<T> {
    const compiled = compiler.compile(spec.statement.text, parameters);
    const sql = new QuerySpecification<T>()
        .withStatement({ text: compiled.sql, language: 'SQL' })
        .skip(spec._skip)
        .limit(spec._limit)
        .bind(compiled.parameters)
        .addPostProcessors(...spec.postProcessors);
    return { spec: Object.freeze(sql), setup: compiled.setup, rows: compiled.rows, nonFinite: compiled.nonFinite };
}

/**
 * The parameters of `spec` as a compiler takes them: those given by position named by it, from 1, as a graph engine
 * names them, and each iterator in them {@link drained}, so that a second compile of the statement sees its items too.
 */
export function cypherParameters(spec: QuerySpecification<unknown>): Record<string, any> {
    return drained(
        Array.isArray(spec.parameters)
            ? Object.fromEntries(spec.parameters.map((it, i) => [String(i + 1), it]))
            : spec.parameters ?? {}
    );
}

/**
 * `parameters`, with each iterator in a value turned into the array of its items: a generator or `map.values()`, at any
 * depth in a list, a map, a `Map` or a `Set`. An iterator gives its items only once, and a statement may be compiled
 * more than once (on Oracle, again to call none of the store's functions the session may not), so a later compile
 * would bind the list as empty (drivine#408, drivine#662). Another iterable that is not an array, a `Set`, a `Map` or
 * bytes is its items' array too, as it may give them only once. A value with none of these in it is kept as it is.
 */
export function drained(parameters: Record<string, any>): Record<string, any> {
    return mapDrained(parameters) as Record<string, any>;
}

/** `value`, with each iterator in it the array of its items, as {@link drained}; `value` itself where none is. */
function drainedValue(value: any): unknown {
    if (value === null || typeof value !== 'object' || value instanceof Uint8Array || value instanceof Int8Array) {
        return value;
    }
    if (writtenAsMap(value)) {
        return mapDrained(value);
    }
    if (typeof value[Symbol.iterator] !== 'function') {
        return value;
    }
    // Asked for its iterator once, as a compile reads it: an iterable may hand out only one.
    const items = Array.from(value as Iterable<unknown>);
    const drainedItems = items.map(drainedValue);
    return !givesItemsAgain(value) || drainedItems.some((it, i) => it !== items[i]) ? drainedItems : value;
}

/**
 * Whether `value`, an iterable, is a collection, which gives its items again: another, as one handing out the one
 * iterator it holds, may not.
 */
function givesItemsAgain(value: object): boolean {
    return Array.isArray(value) || value instanceof Set || value instanceof Map || ArrayBuffer.isView(value);
}

/** The map `value`, with each iterator in it the array of its items; `value` itself where none is. */
function mapDrained(value: Record<string, unknown>): Record<string, unknown> {
    const entries = Object.entries(value);
    const drainedEntries = entries.map(([key, item]) => [key, drainedValue(item)] as const);
    return drainedEntries.some(([, item], i) => item !== entries[i][1]) ? Object.fromEntries(drainedEntries) : value;
}

/** Whether `value` is a map the compiler's parameters write as one: none of the objects written as something else. */
function writtenAsMap(value: unknown): value is Record<string, unknown> {
    return (
        value !== null &&
        typeof value === 'object' &&
        !(value instanceof Date) &&
        !(value instanceof CypherFloat) &&
        !isInt(value) &&
        typeof (value as any)[Symbol.iterator] !== 'function'
    );
}
