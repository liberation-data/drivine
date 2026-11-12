import type { SqliteStatement, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { bindable, wasmSqliteValue } from '@/browser/WasmSqliteValues';

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
        this.stmt = db.prepare(sql);
    }

    setReadBigInts(enabled: boolean): void {
        this.big = enabled;
    }

    setReturnArrays(enabled: boolean): void {
        this.arrays = enabled;
    }

    all(...values: any[]): Record<string, SqliteValue>[] {
        this.bind(values);
        const rows = [];
        while (this.stmt.step()) {
            rows.push(this.row());
        }
        this.stmt.reset();
        return rows;
    }

    get(...values: any[]): Record<string, SqliteValue> | undefined {
        this.bind(values);
        const row = this.stmt.step() ? this.row() : undefined;
        this.stmt.reset();
        return row;
    }

    run(...values: any[]): { changes: number | bigint; lastInsertRowid: number | bigint } {
        this.bind(values);
        while (this.stmt.step()) {
            // A statement that gives rows is run to its end.
        }
        this.stmt.reset();
        const capi = this.sqlite3.capi;
        return {
            changes: capi.sqlite3_changes(this.db.pointer),
            lastInsertRowid: capi.sqlite3_last_insert_rowid(this.db.pointer)
        };
    }

    *iterate(...values: any[]): IterableIterator<Record<string, SqliteValue>> {
        this.bind(values);
        try {
            while (this.stmt.step()) {
                yield this.row();
            }
        } finally {
            this.stmt.reset();
        }
    }

    /** Binds `values`: positional ones in order, or one object's by the parameter's name without its `$`, `:` or `@`. */
    private bind(values: any[]): void {
        const capi = this.sqlite3.capi;
        this.stmt.reset(true);
        const [first] = values;
        if (values.length === 1 && first !== null && typeof first === 'object' && !(first instanceof Uint8Array)) {
            const count = capi.sqlite3_bind_parameter_count(this.stmt.pointer);
            for (let i = 1; i <= count; i++) {
                const name: string | null = capi.sqlite3_bind_parameter_name(this.stmt.pointer, i);
                const key = name ? name.slice(1) : undefined;
                if (key !== undefined && Object.prototype.hasOwnProperty.call(first, key)) {
                    this.stmt.bind(i, bindable(first[key]));
                }
            }
        } else if (values.length) {
            this.stmt.bind(values.map(bindable));
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
