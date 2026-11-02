import type { SqliteDatabase, SqliteStatement, SqliteValue } from '@/connection/sqlite/SqliteDriver';

/**
 * The statements a function runs on the connection it is registered on, each prepared the first time it is run and
 * kept: a save runs the same few for every node it writes. The query a `patch` step asks has its values written into
 * it, so it may be new for every patch: the statements kept are the most recently run.
 */
export class SqliteStatements {
    private static readonly MAX = 256;
    private readonly prepared = new Map<string, SqliteStatement>();

    constructor(private readonly db: SqliteDatabase) {}

    statement(sql: string): SqliteStatement {
        let found = this.prepared.get(sql);
        if (found) {
            this.prepared.delete(sql);
        } else {
            found = this.db.prepare(sql);
            if (this.prepared.size >= SqliteStatements.MAX) {
                this.prepared.delete(this.prepared.keys().next().value!);
            }
        }
        this.prepared.set(sql, found);
        return found;
    }

    /** Runs `sql` with `values`, and gives how many rows it changed. */
    update(sql: string, ...values: SqliteValue[]): number {
        return Number(this.statement(sql).run(...values).changes);
    }

    /** The rows `sql` with `values` reads, each as an array of its columns. */
    rows(sql: string, ...values: SqliteValue[]): SqliteValue[][] {
        return this.statement(sql)
            .all(...values)
            .map((it) => Object.values(it));
    }

    /** Runs `sql`, a statement of no values, such as a savepoint's. */
    run(sql: string): void {
        this.db.exec(sql);
    }
}
