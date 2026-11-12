import type { SqliteDatabase, SqliteStatement, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { WasmSqliteStatement } from '@/browser/WasmSqliteStatement';
import { nodeSqliteError, wasmSqliteValue } from '@/browser/WasmSqliteValues';

/** A function registered on a database: its pointer, and what it calls, which a connection replaces. */
interface SharedFunction {
    pointer: number;
    fn: (...args: SqliteValue[]) => SqliteValue | boolean | undefined;
    big: boolean;
}

/** A database of SQLite's wasm build and its functions by name and arity. */
interface SharedDatabase {
    db: any;
    functions: Map<string, SharedFunction>;
}

/**
 * As much of node:sqlite's `DatabaseSync` as Drivine uses, over a database of SQLite's wasm build that the connections
 * to one path share (see wasmSqliteDriver).
 */
export class WasmSqliteDatabase implements SqliteDatabase {
    private readonly shared: SharedDatabase;
    private closed = false;

    constructor(
        private readonly sqlite3: any,
        open: Map<string, SharedDatabase>,
        path: string
    ) {
        let shared = open.get(path);
        if (!shared) {
            shared = { db: new sqlite3.oo1.DB(':memory:', 'c'), functions: new Map() };
            open.set(path, shared);
        }
        this.shared = shared;
    }

    prepare(sql: string): SqliteStatement {
        return new WasmSqliteStatement(this.sqlite3, this.shared.db, sql);
    }

    exec(sql: string): void {
        try {
            this.shared.db.exec(sql);
        } catch (e) {
            throw nodeSqliteError(e);
        }
    }

    /**
     * Closes this connection. The database stays, as a file outlives the connections to it: a connection closed
     * because its statement failed, or because its provider ended, is often the only one open. A connection closed
     * twice is refused, as node:sqlite's.
     */
    close(): void {
        if (this.closed) {
            throw new Error('database is not open');
        }
        this.closed = true;
    }

    /**
     * Registers `fn` as SQLite function `name`, given each argument as SQLite holds it, an integer a bigint where
     * `useBigIntArguments`, as node:sqlite's. It is installed as a raw function pointer: the wasm build's own wrapper
     * would convert the arguments itself, an integer past 2^53 to a rounded number, and give a whole number back as an
     * integer, where node:sqlite gives every number back as a float.
     *
     * Each connection registers its functions again, on the one database. SQLite refuses to replace a function while
     * any statement on the database is running (a cursor on another connection), so a function is installed once, and
     * a later registration only changes what it calls.
     */
    function(
        name: string,
        options: { deterministic?: boolean; varargs?: boolean; useBigIntArguments?: boolean },
        fn: (...args: SqliteValue[]) => SqliteValue | boolean | undefined
    ): void {
        const arity = options?.varargs ? -1 : fn.length;
        const key = `${name}/${arity}`;
        const big = !!options?.useBigIntArguments;
        const registered = this.shared.functions.get(key);
        if (registered) {
            registered.fn = fn;
            registered.big = big;
            return;
        }
        const { capi, wasm }: { capi: any; wasm: any } = this.sqlite3;
        const flags = capi.SQLITE_UTF8 | (options?.deterministic ? capi.SQLITE_DETERMINISTIC : 0);
        const entry: SharedFunction = { pointer: 0, fn, big };
        const xFunc = (pCtx: number, argc: number, pArgv: number): void => {
            try {
                const args: SqliteValue[] = [];
                for (let i = 0; i < argc; i++) {
                    const pv = wasm.peekPtr(pArgv + wasm.ptr.size * i);
                    const read = {
                        int64: () => BigInt(capi.sqlite3_value_int64(pv)),
                        double: () => capi.sqlite3_value_double(pv),
                        text: () => capi.sqlite3_value_text(pv),
                        // The wasm build gives an empty blob as null; node:sqlite gives it as no bytes.
                        blob: () => capi.sqlite3_value_to_js(pv) ?? new Uint8Array(0)
                    };
                    args.push(wasmSqliteValue(capi, capi.sqlite3_value_type(pv), read, entry.big));
                }
                const result = entry.fn(...args);
                if (typeof result === 'number') {
                    capi.sqlite3_result_double(pCtx, result);
                } else {
                    capi.sqlite3_result_js(pCtx, typeof result === 'boolean' ? (result ? 1 : 0) : result);
                }
            } catch (e) {
                capi.sqlite3_result_error(pCtx, String((e as Error)?.message ?? e), -1);
            }
        };
        entry.pointer = wasm.installFunction('v(pip)', xFunc);
        const rc = capi.sqlite3_create_function_v2(
            this.shared.db.pointer,
            name,
            arity,
            flags,
            0,
            entry.pointer,
            0,
            0,
            0
        );
        if (rc !== 0) {
            wasm.uninstallFunction(entry.pointer);
            throw new Error(`SQLite refused function ${name}: ${capi.sqlite3_errstr(rc)}`);
        }
        this.shared.functions.set(key, entry);
    }
}

/**
 * As much of node:sqlite as Drivine uses (see SqliteDriver), over SQLite's official wasm build
 * (`@sqlite.org/sqlite-wasm`), so Drivine runs on SQLite in a page. Pass what the package's default export resolves to:
 *
 *     useSqliteDriver(wasmSqliteDriver(await sqlite3InitModule()));
 *
 * A page has no files: each database is held in memory, one for each path, shared by the connections that open it as
 * one file is, so Drivine's connections all see the one graph. It lasts as long as the page, or the driver, as a file
 * would, through any number of connections closing.
 */
export function wasmSqliteDriver(sqlite3: any): {
    DatabaseSync: new (path: string, options?: Record<string, unknown>) => SqliteDatabase;
} {
    const open = new Map<string, SharedDatabase>();
    // A constructor that gives the database it makes, as `new` takes it: one class to the file.
    const DatabaseSync = function (path: string): SqliteDatabase {
        return new WasmSqliteDatabase(sqlite3, open, path);
    } as unknown as new (path: string, options?: Record<string, unknown>) => SqliteDatabase;
    return { DatabaseSync };
}
