import type { SqliteValue } from '@/connection/sqlite/SqliteDriver';

/** How a value is read, for the one of SQLite's types it holds. */
export interface WasmSqliteReaders {
    int64(): bigint;
    double(): number;
    text(): string;
    blob(): Uint8Array;
}

/**
 * A value of SQLite's `type`, read by `read`, as node:sqlite gives it: an integer a bigint where `big`, else a number
 * where it fits and a bigint where it doesn't. `capi` is the wasm build's C API, which names the types.
 */
export function wasmSqliteValue(capi: any, type: number, read: WasmSqliteReaders, big: boolean): SqliteValue {
    switch (type) {
        case capi.SQLITE_INTEGER: {
            const n = read.int64();
            return big || n < BigInt(Number.MIN_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER) ? n : Number(n);
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
