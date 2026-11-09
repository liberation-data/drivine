import { randomBytes } from 'crypto';
import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { StatementLogger } from '@/logger/StatementLogger';
import { DrivineLogger } from '@/logger';
import { ensuringGraph, JSON_ROWS, SqliteGraph } from '@/backend/sqlite/SqliteGraph';
import { SqliteSpecCompiler } from '@/connection/sqlite/SqliteSpecCompiler';
import { SqliteCursor } from '@/connection/sqlite/SqliteCursor';
import { SqliteDatabase, SqliteValue, waitingOutLocks } from '@/connection/sqlite/SqliteDriver';
import { compiledSpecification } from '@/cypher/CompiledSpecification';
import { SharedCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { NAN_KEY, NAN_TEXT, NAN_VALUE } from '@/connection/sqlite/SqliteCypherValues';
import { DEFAULT_GRAPH } from '@/backend/sql/SqlGraph';

/** How long a transaction may hold the file's write lock before its end is warned of: drivine4j's five seconds. */
export const LONG_LOCK_MILLIS = 5_000;

/**
 * A connection to a SQLite file, through Node's own synchronous driver. A Cypher statement is compiled to SQL over the
 * graph's tables (see SqliteCypherCompiler), so a statement written for a graph engine runs here and gives the same rows:
 * one value a row, from the compiled statement's one column, read as JSON.
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
    /** The cursors opened on the connection, closed as it is given back. */
    private readonly cursors: SqliteCursor<any>[] = [];

    /**
     * @param busyTimeoutMillis how long a statement waits for a locked file before it is turned away
     * @param handBack gives the connection back to its provider, or closes it when it failed
     * @param graph the graph a Cypher statement is compiled against: its tables are `<graph>_node` and `<graph>_edge`
     */
    constructor(
        readonly db: SqliteDatabase,
        readonly resultMapper: ResultMapper,
        private readonly busyTimeoutMillis: number,
        private readonly handBack: (db: SqliteDatabase, failed: boolean) => void,
        private readonly graph: string = DEFAULT_GRAPH
    ) {}

    sessionId(): string {
        return this.id;
    }

    /** Whether a transaction is open on the connection. */
    get inTransaction(): boolean {
        return this.lockedAt !== undefined;
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const given = spec.finalizedCopy('SQL');
        const cypher = given.statement.language === 'CYPHER' ? this.compiled(given) : undefined;
        const finalizedSpec = cypher ?? given;
        const ensuring = ensuringGraph(finalizedSpec.statement.text);
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
        // Read into arrays of this realm: the driver's are its own, which a test's deep equality tells apart.
        const read = Array.from(rows, compiled.statement.startsWith(JSON_ROWS) ? jsonRow : (it) => ({ ...it }));
        return this.resultMapper.mapQueryResults<T>(cypher ? read.map((it) => it.result) : read, finalizedSpec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<SqliteCursor<T>> {
        const finalizedSpec = spec.finalizedCopy('SQL');
        const compiled = new SqliteSpecCompiler(finalizedSpec).compile();
        const rows = this.db.prepare(compiled.statement).iterate(...bound(compiled.parameters));
        const json = compiled.statement.startsWith(JSON_ROWS);
        const cursor = new SqliteCursor<T>(
            this.sessionId(),
            finalizedSpec,
            rows,
            json ? jsonRow : (it) => ({ ...it }),
            this.resultMapper
        );
        this.cursors.push(cursor);
        return Promise.resolve(cursor);
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

    /**
     * Rolls the transaction back. One SQLite already rolled back, as it does on a full disk or an I/O error, is over:
     * the failure that ended it is the one to give, and the connection is still given back.
     */
    async rollbackTransaction(): Promise<void> {
        this.warnOfLongLock('rolled back');
        try {
            this.db.exec('ROLLBACK');
        } catch (e) {
            if (!/no transaction is active/.test((e as Error).message ?? '')) {
                throw e;
            }
        }
        return Promise.resolve();
    }

    /**
     * Gives the connection back. A transaction still open, as one whose work failed may leave it, is rolled back first,
     * so the file's lock goes with it. A cursor still open is closed: a statement not read to its end keeps the file as
     * it was when the statement began, and the connection's next user would read that.
     */
    async release(err?: Error): Promise<void> {
        if (err) {
            this.logger.warn(`Closing session with error: ${err}`);
        }
        await Promise.all(this.cursors.splice(0).map(async (it) => it.close()));
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
     * The Cypher statement of `spec` compiled to SQL over the graph's tables, as a specification of that SQL, which opens
     * with `/* drivine:json *\/`: each of its text values is JSON.
     */
    private compiled<T>(spec: QuerySpecification<T>): QuerySpecification<T> {
        const compiled = compiledSpecification(spec, new SharedCypherCompiler('sqlite', { name: this.graph })).spec;
        return Object.freeze(
            new QuerySpecification<T>()
                .withStatement({ text: `${JSON_ROWS}\n${compiled.statement.text}`, language: 'SQL' })
                .skip(compiled._skip)
                .limit(compiled._limit)
                .bind(compiled.parameters)
                .addPostProcessors(...compiled.postProcessors)
        );
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

/**
 * A row whose text values are each JSON, as the values they are: NaN, which SQLite's JSON writes as {@link NAN_TEXT}, read
 * as NaN where a value's text holds it, as drivine4j's `JdbcResultMapper.sqliteRows` reads it. A statement given no NaN
 * can still work one out, as `∞ + -∞`.
 */
function jsonRow(row: Record<string, SqliteValue>): Record<string, any> {
    return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? jsonValue(value) : value])
    );
}

/**
 * The JSON `text` as the value it is, with each map of {@link NAN_TEXT} in it NaN where the text holds one. A text value
 * that holds those characters holds each quote escaped, so only a map holds them: the look is a cheap pass over a row
 * that holds no NaN, which most do, and {@link withNaN} takes only the exact map.
 */
function jsonValue(text: string): any {
    const value = JSON.parse(text);
    return text.includes(NAN_TEXT) ? withNaN(value) : value;
}

/** `value` with each map in it, at any depth, that is exactly NaN's, `{"$numberDouble": "NaN"}`, NaN. */
function withNaN(value: any): any {
    if (Array.isArray(value)) {
        return value.map(withNaN);
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === NAN_KEY && value[NAN_KEY] === NAN_VALUE) {
        return NaN;
    }
    return Object.fromEntries(keys.map((key) => [key, withNaN(value[key])]));
}

/**
 * Makes the graph's store: counts what of its statements make is there, and runs each, in one transaction, unless all
 * of it is. A user who may only read the file is refused even a `CREATE ... IF NOT EXISTS` over a table that is there,
 * so it is looked for first. A store whose tables give a deleted row's id again is refused (see SqliteGraph.ensure).
 * Inside a transaction it is made in that transaction. Two processes that each find it missing make it one after the other.
 */
function ensure(db: SqliteDatabase, graph: SqliteGraph, inTransaction: boolean): void {
    graph.ensure(
        (statement) => Object.values(db.prepare(statement).get() ?? {})[0],
        (statements) => {
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
    );
}
