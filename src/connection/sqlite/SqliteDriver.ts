import { DrivineError } from '@/DrivineError';

/** A value SQLite binds or gives back. */
export type SqliteValue = null | number | bigint | string | Uint8Array;

/** What node:sqlite's StatementSync offers that Drivine uses. */
export interface SqliteStatement {
    all(...values: any[]): Record<string, SqliteValue>[];
    get(...values: any[]): Record<string, SqliteValue> | undefined;
    run(...values: any[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    iterate(...values: any[]): IterableIterator<Record<string, SqliteValue>>;
}

/** What node:sqlite's DatabaseSync offers that Drivine uses. */
export interface SqliteDatabase {
    prepare(sql: string): SqliteStatement;
    exec(sql: string): void;
    close(): void;
    function(
        name: string,
        options: { deterministic?: boolean; directOnly?: boolean; varargs?: boolean },
        fn: (...args: SqliteValue[]) => SqliteValue | boolean | undefined
    ): void;
}

/** The least SQLite a store runs on: drivine4j's, for `json_group_array(… ORDER BY …)` and `->>`. */
const MINIMUM_SQLITE = [3, 45];

let driver: { DatabaseSync: new (path: string, options?: Record<string, unknown>) => SqliteDatabase } | undefined;

/**
 * Opens the SQLite file at `path` through Node's own driver, `node:sqlite`: no native module to build, and the SQLite
 * Node is built with. It is loaded when the first SQLite connection is opened, so an application that uses no SQLite
 * store runs on a Node that has none. It registers functions written in JavaScript on a connection, which Drivine's
 * statements call (see SqliteFunctions).
 */
export function openSqlite(path: string): SqliteDatabase {
    if (!driver) {
        try {
            // Loaded on first use: `node:sqlite` is in Node 22.13 and later.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            driver = require('node:sqlite');
        } catch (e) {
            throw new DrivineError(
                `A SQLite store needs Node's own SQLite driver, node:sqlite, in Node 22.13 or later. This is Node ` +
                    `${process.versions.node}. (${(e as Error).message})`
            );
        }
    }
    const db = new driver!.DatabaseSync(path, { enableForeignKeyConstraints: true });
    const version = String(db.prepare('SELECT sqlite_version() AS v').get()!.v);
    const [major, minor] = version.split('.').map(Number);
    if (major < MINIMUM_SQLITE[0] || (major === MINIMUM_SQLITE[0] && minor < MINIMUM_SQLITE[1])) {
        db.close();
        throw new DrivineError(
            `A SQLite store needs SQLite ${MINIMUM_SQLITE.join('.')} or later; this Node's is ${version}.`
        );
    }
    return db;
}

/** SQLite's primary result codes for a locked file and a locked table. */
const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;

/** What SQLite says of a lock, in a message that has lost its code, as one from a function's own statement does. */
const CONTENTION = /database is locked|database table is locked|SQLITE_BUSY|SQLITE_LOCKED/;

/**
 * Whether SQLite turned a statement away because another connection held the file's lock (`SQLITE_BUSY`), or a table
 * (`SQLITE_LOCKED`): told by the error's extended code, whose low byte is the primary code, or by its message, which is
 * all that is left of one a function Drivine registers was turned away by.
 */
export function sqliteContended(failure: any): boolean {
    if (!failure || typeof failure !== 'object') {
        return false;
    }
    if (typeof failure.errcode === 'number') {
        const code = failure.errcode & 0xff;
        if (code === SQLITE_BUSY || code === SQLITE_LOCKED) {
            return true;
        }
    }
    return typeof failure.message === 'string' && CONTENTION.test(failure.message);
}

/** The longest pause between two tries at a locked file. */
const MOST_PAUSE_MILLIS = 50;

/**
 * Runs `statement`, again after a pause while SQLite turns it away because another connection holds the file's lock,
 * until `timeoutMillis` has passed. The driver is synchronous, so SQLite's own wait would stop every other connection of
 * the process too, the one holding the lock among them: each try is made again after a pause, which lets them run.
 */
export async function waitingOutLocks<R>(statement: () => R, timeoutMillis: number): Promise<R> {
    const deadline = Date.now() + timeoutMillis;
    for (let attempt = 0; ; attempt++) {
        try {
            return statement();
        } catch (e) {
            if (!sqliteContended(e) || Date.now() >= deadline) {
                throw e;
            }
            await new Promise((resolve) => setTimeout(resolve, Math.min(1 + attempt * 2, MOST_PAUSE_MILLIS)));
        }
    }
}
