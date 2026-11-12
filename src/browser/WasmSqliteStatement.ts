import type { SqliteStatement, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { bindable, nodeSqliteError, wasmSqliteValue } from '@/browser/WasmSqliteValues';

/**
 * Finalizes a wasm statement once its WasmSqliteStatement is collected, as node:sqlite's statements are: the wasm
 * build's database holds each statement it prepared until it closes, and Drivine prepares one for each query.
 */
const finalizer: { register(target: object, held: unknown): void } = new (globalThis as any).FinalizationRegistry(
    (stmt: any) => {
        try {
            stmt.finalize();
        } catch {
            // Its database is closed, and finalized it.
        }
    }
);

/** As much of node:sqlite's `StatementSync` as Drivine uses, over a statement of SQLite's wasm build. */
export class WasmSqliteStatement implements SqliteStatement {
    private readonly stmt: any;
    private big = false;
    private arrays = false;

    constructor(
        private readonly sqlite3: any,
        private readonly db: any,
        sql: string
    ) {
        try {
            this.stmt = db.prepare(sql);
        } catch (e) {
            throw nodeSqliteError(e);
        }
        finalizer.register(this, this.stmt);
    }

    setReadBigInts(enabled: boolean): void {
        this.big = enabled;
    }

    setReturnArrays(enabled: boolean): void {
        this.arrays = enabled;
    }

    all(...values: any[]): Record<string, SqliteValue>[] {
        const rows = [];
        try {
            this.bind(values);
            while (this.stmt.step()) {
                rows.push(this.row());
            }
        } catch (e) {
            throw nodeSqliteError(e);
        } finally {
            this.done();
        }
        return rows;
    }

    get(...values: any[]): Record<string, SqliteValue> | undefined {
        try {
            this.bind(values);
            return this.stmt.step() ? this.row() : undefined;
        } catch (e) {
            throw nodeSqliteError(e);
        } finally {
            this.done();
        }
    }

    run(...values: any[]): { changes: number | bigint; lastInsertRowid: number | bigint } {
        try {
            this.bind(values);
            while (this.stmt.step()) {
                // A statement that gives rows is run to its end.
            }
        } catch (e) {
            throw nodeSqliteError(e);
        } finally {
            this.done();
        }
        const capi = this.sqlite3.capi;
        return {
            changes: capi.sqlite3_changes(this.db.pointer),
            lastInsertRowid: capi.sqlite3_last_insert_rowid(this.db.pointer)
        };
    }

    *iterate(...values: any[]): IterableIterator<Record<string, SqliteValue>> {
        try {
            this.bind(values);
            while (this.stmt.step()) {
                yield this.row();
            }
        } catch (e) {
            throw nodeSqliteError(e);
        } finally {
            this.done();
        }
    }

    /**
     * Resets the statement once it has run, or failed, as node:sqlite's is, so it holds no table it read and runs again.
     * A step that failed fails the reset too: that error is the step's, already on its way, so it isn't thrown again.
     */
    private done(): void {
        try {
            this.stmt.reset();
        } catch {
            // The failed step's error, thrown already.
        }
    }

    /**
     * Binds `values`: positional ones in order, or one object's by the parameter's name, with or without its `$`, `:` or
     * `@`, as node:sqlite's (SqlitePlanWriter gives `$1`). A number is bound as a float, as node:sqlite binds every number, and a bigint as an integer.
     */
    private bind(values: any[]): void {
        const capi = this.sqlite3.capi;
        this.stmt.reset(true);
        const [first] = values;
        if (values.length === 1 && first !== null && typeof first === 'object' && !(first instanceof Uint8Array)) {
            const count = capi.sqlite3_bind_parameter_count(this.stmt.pointer);
            for (let i = 1; i <= count; i++) {
                const name: string | null = capi.sqlite3_bind_parameter_name(this.stmt.pointer, i);
                const key = [name, name?.slice(1)].find(
                    (it) => it != null && Object.prototype.hasOwnProperty.call(first, it)
                );
                if (key != null) {
                    this.bindOne(i, first[key]);
                }
            }
        } else {
            values.forEach((value, i) => this.bindOne(i + 1, value));
        }
    }

    private bindOne(index: number, value: unknown): void {
        if (typeof value === 'number') {
            this.db.checkRc(this.sqlite3.capi.sqlite3_bind_double(this.stmt.pointer, index, value));
        } else {
            this.stmt.bind(index, bindable(value));
        }
    }

    /** The current row: an array of its columns where setReturnArrays, else an object by the columns' names. */
    private row(): any {
        const capi = this.sqlite3.capi;
        const p = this.stmt.pointer;
        const cells: SqliteValue[] = [];
        for (let i = 0; i < this.stmt.columnCount; i++) {
            const read = {
                int64: () => BigInt(capi.sqlite3_column_int64(p, i)),
                double: () => capi.sqlite3_column_double(p, i),
                text: () => capi.sqlite3_column_text(p, i),
                blob: () => this.stmt.get(i, capi.SQLITE_BLOB)
            };
            cells.push(wasmSqliteValue(capi, capi.sqlite3_column_type(p, i), read, this.big));
        }
        if (this.arrays) {
            return cells;
        }
        const names: string[] = this.stmt.getColumnNames();
        return Object.fromEntries(names.map((name, i) => [name, cells[i]]));
    }
}
