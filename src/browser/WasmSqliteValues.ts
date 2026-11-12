import type { SqliteValue } from '@/connection/sqlite/SqliteDriver';

/** How a value is read, for the one of SQLite's types it holds. */
export interface WasmSqliteReaders {
    int64(): bigint;
    double(): number;
    text(): string;
    blob(): Uint8Array;
}

/**
 * A value of SQLite's `type`, read by `read`, as node:sqlite gives it: an integer a bigint where `big`, else a number,
 * and refused where it is past 2^53, which a number can't hold. `capi` is the wasm build's C API, which names the types.
 */
export function wasmSqliteValue(capi: any, type: number, read: WasmSqliteReaders, big: boolean): SqliteValue {
    switch (type) {
        case capi.SQLITE_INTEGER: {
            const n = read.int64();
            if (big) {
                return n;
            }
            if (n < BigInt(Number.MIN_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER)) {
                throw new Error(`Value is too large to be represented as a JavaScript number: ${n}`);
            }
            return Number(n);
        }
        case capi.SQLITE_FLOAT:
            return read.double();
        case capi.SQLITE_TEXT:
            return read.text();
        case capi.SQLITE_BLOB:
            return read.blob();
        default:
            return null;
    }
}

/** A value as SQLite binds it: a boolean as 1 or 0, as node:sqlite binds one. */
export function bindable(v: unknown): unknown {
    return typeof v === 'boolean' ? (v ? 1 : 0) : v;
}

/** What the wasm build puts before SQLite's own message: the result code's name and number. */
const WASM_PREFIX = /^SQLITE_\w+: sqlite3 result code \d+: /;

/**
 * `e` with SQLite's message alone, as node:sqlite gives it: the wasm build's error names the result code first, which a
 * page would show before the message of a failed query.
 */
export function nodeSqliteError(e: unknown): unknown {
    if (e instanceof Error && typeof (e as { resultCode?: unknown }).resultCode === 'number') {
        e.message = e.message.replace(WASM_PREFIX, '');
    }
    return e;
}
