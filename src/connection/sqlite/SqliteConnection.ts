import { randomBytes } from 'crypto';
import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { StatementLogger } from '@/logger/StatementLogger';
import { DrivineLogger } from '@/logger';
import { DrivineError } from '@/DrivineError';
import { ensuringStatements, JSON_ROWS } from '@/backend/sqlite/SqliteGraph';
import { SqliteSpecCompiler } from '@/connection/sqlite/SqliteSpecCompiler';
import { SqliteCursor } from '@/connection/sqlite/SqliteCursor';
import { SqliteDatabase, SqliteValue, waitingOutLocks } from '@/connection/sqlite/SqliteDriver';

/** How long a transaction may hold the file's write lock before its end is warned of: drivine4j's five seconds. */
export const LONG_LOCK_MILLIS = 5_000;

/**
 * A connection to a SQLite file, through Node's own synchronous driver. It runs SQL only: Cypher on SQLite comes with
 * the compiler that targets it.
 *
 * - A transaction takes the file's write lock as it begins (`BEGIN IMMEDIATE`), so one that reads and then writes is
 *   never turned away for what another wrote in between: two such transactions wait their turn. One that holds the lock
 *   longer than five seconds is warned of when it ends, committed, rolled back or released.
 * - A connection that finds the file locked waits for it, up to the provider's busy timeout, without holding up the
 *   process: the driver is synchronous, so SQLite's own wait would stop every other connection of the process too,
 *   the one holding the lock among them. Each try is made again after a pause, which lets the others run.
 * - A statement Drivine writes whose text values are each JSON opens with `/* drivine:json *\/`, and each of its text
 *   values is read as the JSON it is; a statement written by hand is read as it is.
 * - The graph's `ensuring` text, many statements, makes the store when it is not all there (see SqliteGraph).
 */
export class SqliteConnection implements Connection {
    private readonly logger = new DrivineLogger(SqliteConnection.name);
    private readonly id = randomBytes(4).toString('hex');
    /** When the open transaction took the write lock, or undefined outside one. */
    private lockedAt?: number;

    /**
     * @param busyTimeoutMillis how long a statement waits for a locked file before it is turned away
     * @param handBack gives the connection back to its provider, or closes it when it failed
     */
    constructor(
        readonly db: SqliteDatabase,
        readonly resultMapper: ResultMapper,
        private readonly busyTimeoutMillis: number,
        private readonly handBack: (db: SqliteDatabase, failed: boolean) => void
    ) {}

    sessionId(): string {
        return this.id;
    }

    /** Whether a transaction is open on the connection. */
    get inTransaction(): boolean {
        return this.lockedAt !== undefined;
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const finalizedSpec = spec.finalizedCopy('SQL');
        const ensuring = ensuringStatements(finalizedSpec.statement.text);
        if (ensuring) {
            await this.waitingOutLocks(() => ensure(this.db, ensuring, this.inTransaction));
            return [];
        }
        const compiled = new SqliteSpecCompiler(finalizedSpec).compile();
        const hrStart = process.hrtime();
        const rows = await this.waitingOutLocks(() =>
            this.db.prepare(compiled.statement).all(...bound(compiled.parameters))
        );
        new StatementLogger(this.sessionId()).log(spec, hrStart);
        const read = compiled.statement.startsWith(JSON_ROWS) ? rows.map(jsonRow) : rows.map((it) => ({ ...it }));
        return this.resultMapper.mapQueryResults<T>(read, finalizedSpec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<SqliteCursor<T>> {
        const finalizedSpec = spec.finalizedCopy('SQL');
        const compiled = new SqliteSpecCompiler(finalizedSpec).compile();
        const rows = this.db.prepare(compiled.statement).iterate(...bound(compiled.parameters));
        const json = compiled.statement.startsWith(JSON_ROWS);
        return Promise.resolve(
            new SqliteCursor<T>(
                this.sessionId(),
                finalizedSpec,
                rows,
                json ? jsonRow : (it) => ({ ...it }),
                this.resultMapper
            )
        );
    }

    /** Takes the file's write lock, waiting for it where another connection holds it. */
    async startTransaction(): Promise<void> {
        await this.waitingOutLocks(() => this.db.exec('BEGIN IMMEDIATE'));
        this.lockedAt = Date.now();
    }

    async commitTransaction(): Promise<void> {
        this.warnOfLongLock('committed');
        this.db.exec('COMMIT');
        return Promise.resolve();
    }

    async rollbackTransaction(): Promise<void> {
        this.warnOfLongLock('rolled back');
        this.db.exec('ROLLBACK');
        return Promise.resolve();
    }

    /**
     * Gives the connection back. A transaction still open, as one whose work failed may leave it, is rolled back first,
     * so the file's lock goes with it.
     */
    async release(err?: Error): Promise<void> {
        if (err) {
            this.logger.warn(`Closing session with error: ${err}`);
        }
        let failed = !!err;
        if (this.lockedAt !== undefined) {
            this.warnOfLongLock('released');
            try {
                this.db.exec('ROLLBACK');
            } catch {
                failed = true;
            }
        }
        this.handBack(this.db, failed);
        return Promise.resolve();
    }

    /**
     * Warns where the transaction ending held the write lock for longer than LONG_LOCK_MILLIS: no other writer could
     * write meanwhile. Warned before the transaction ends, so a failure to end it still reports it.
     */
    private warnOfLongLock(ended: string): void {
        if (this.lockedAt === undefined) {
            return;
        }
        const held = Date.now() - this.lockedAt;
        this.lockedAt = undefined;
        if (held > LONG_LOCK_MILLIS) {
            this.logger.warn(
                `A SQLite transaction held the file's write lock for ${held} ms before it was ${ended}: no other ` +
                    `writer can write while one holds it. Keep transactions on SQLite short.`
            );
        }
    }

    /**
     * Runs `statement`, again after a pause while SQLite turns it away because another connection holds the file's
     * lock, until the busy timeout has passed (see waitingOutLocks). Inside a transaction the lock is this connection's,
     * and nothing waits.
     */
    private async waitingOutLocks<R>(statement: () => R): Promise<R> {
        return this.lockedAt !== undefined ? statement() : waitingOutLocks(statement, this.busyTimeoutMillis);
    }
}

/** The values a statement is run with: a list in turn, names as one map. */
function bound(parameters: Record<string, SqliteValue> | SqliteValue[]): any[] {
    return Array.isArray(parameters) ? parameters : [parameters];
}

/** A row whose text values are each JSON, as the values they are. */
function jsonRow(row: Record<string, SqliteValue>): Record<string, any> {
    return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? JSON.parse(value) : value])
    );
}

/**
 * Makes the store: counts what of the statements make is there, and runs each, in one transaction, unless all of it is.
 * A user who may only read the file is refused even a `CREATE ... IF NOT EXISTS` over a table that is there, so it is
 * looked for first. Inside a transaction it is made in that transaction. Two processes that each find it missing make it one after the other.
 */
function ensure(db: SqliteDatabase, statements: string[], inTransaction: boolean): void {
    const names = statements.map((it) => /IF NOT EXISTS (\w+)/i.exec(it)?.[1]?.toLowerCase()).filter(Boolean);
    if (names.length !== statements.length) {
        throw new DrivineError('A SQLite store is made by statements that each make a table or an index if not there.');
    }
    const made = db
        .prepare(`SELECT COUNT(*) AS made FROM sqlite_master WHERE lower(name) IN (${names.map(() => '?').join(', ')})`)
        .get(...names)!.made;
    if (Number(made) === statements.length) {
        return;
    }
    if (inTransaction) {
        statements.forEach((it) => db.exec(it));
        return;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
        statements.forEach((it) => db.exec(it));
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
