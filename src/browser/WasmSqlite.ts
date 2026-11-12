import type { SqliteDatabase, SqliteStatement, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { WasmSqliteStatement } from '@/browser/WasmSqliteStatement';
import { wasmSqliteValue } from '@/browser/WasmSqliteValues';

/** A database of SQLite's wasm build, the connections open on it, and its functions' pointers, to free with it. */
interface SharedDatabase {
    db: any;
    count: number;
    functions: Map<string, number>;
}

/**
 * As much of node:sqlite's `DatabaseSync` as Drivine uses, over a database of SQLite's wasm build that the connections
 * to one path share (see wasmSqliteDriver).
 */
export class WasmSqliteDatabase implements SqliteDatabase {
    private readonly shared: SharedDatabase;

    constructor(
        private readonly sqlite3: any,
        private readonly open: Map<string, SharedDatabase>,
        private readonly path: string
    ) {
        let shared = open.get(path);
        if (!shared) {
            shared = { db: new sqlite3.oo1.DB(':memory:', 'c'), count: 0, functions: new Map() };
            open.set(path, shared);
        }
        shared.count++;
        this.shared = shared;
    }

    prepare(sql: string): SqliteStatement {
        return new WasmSqliteStatement(this.sqlite3, this.shared.db, sql);
    }

    exec(sql: string): void {
        this.shared.db.exec(sql);
    }

    /** Closes this connection, and the database with its functions once no other connection has it open. */
    close(): void {
        if (--this.shared.count === 0 && this.open.get(this.path) === this.shared) {
            this.shared.db.close();
            this.shared.functions.forEach((pointer) => this.sqlite3.wasm.uninstallFunction(pointer));
            this.open.delete(this.path);
        }
    }

    /**
     * Registers `fn` as SQLite function `name`, given each argument as SQLite holds it, an integer a bigint where
     * `useBigIntArguments`, as node:sqlite's. It is installed as a raw function pointer: the wasm build's own wrapper
     * would convert the arguments itself, an integer past 2^53 to a rounded number.
     */
    function(
        name: string,
        options: { deterministic?: boolean; varargs?: boolean; useBigIntArguments?: boolean },
        fn: (...args: SqliteValue[]) => SqliteValue | boolean | undefined
    ): void {
        const { capi, wasm }: { capi: any; wasm: any } = this.sqlite3;
        const big = !!options?.useBigIntArguments;
        const flags = capi.SQLITE_UTF8 | (options?.deterministic ? capi.SQLITE_DETERMINISTIC : 0);
        const xFunc = (pCtx: number, argc: number, pArgv: number): void => {
            const args: SqliteValue[] = [];
            for (let i = 0; i < argc; i++) {
                const pv = wasm.peekPtr(pArgv + wasm.ptr.size * i);
                const read = {
                    int64: () => BigInt(capi.sqlite3_value_int64(pv)),
                    double: () => capi.sqlite3_value_double(pv),
                    text: () => capi.sqlite3_value_text(pv),
                    blob: () => capi.sqlite3_value_to_js(pv)
                };
                args.push(wasmSqliteValue(capi, capi.sqlite3_value_type(pv), read, big));
            }
            try {
                const result = fn(...args);
                capi.sqlite3_result_js(pCtx, typeof result === 'boolean' ? (result ? 1 : 0) : result);
            } catch (e) {
                capi.sqlite3_result_error(pCtx, String((e as Error)?.message ?? e), -1);
            }
        };
        const pointer = wasm.installFunction('v(pip)', xFunc);
        const arity = options?.varargs ? -1 : fn.length;
        const rc = capi.sqlite3_create_function_v2(this.shared.db.pointer, name, arity, flags, 0, pointer, 0, 0, 0);
        if (rc !== 0) {
            wasm.uninstallFunction(pointer);
            throw new Error(`SQLite refused function ${name}: ${capi.sqlite3_errstr(rc)}`);
        }
        // Each connection registers its functions again, on the one database: SQLite no longer calls the one replaced.
        const key = `${name}/${arity}`;
        const replaced = this.shared.functions.get(key);
        this.shared.functions.set(key, pointer);
        if (replaced !== undefined) {
            wasm.uninstallFunction(replaced);
        }
    }
}

/**
 * As much of node:sqlite as Drivine uses (see SqliteDriver), over SQLite's official wasm build
 * (`@sqlite.org/sqlite-wasm`), so Drivine runs on SQLite in a page. Pass what the package's default export resolves to:
 *
 *     useSqliteDriver(wasmSqliteDriver(await sqlite3InitModule()));
 *
 * A page has no files: each database is held in memory, one for each path, shared by the connections that open it as
 * one file is, so Drivine's connections all see the one graph. It and its functions are freed when its last connection
 * closes.
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
