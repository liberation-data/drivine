import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger/DrivineLogger';

/** A value SQLite binds or gives back. */
export type SqliteValue = null | number | bigint | string | Uint8Array;

/** What node:sqlite's StatementSync offers that Drivine uses. */
export interface SqliteStatement {
    all(...values: any[]): Record<string, SqliteValue>[];
    get(...values: any[]): Record<string, SqliteValue> | undefined;
    run(...values: any[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    iterate(...values: any[]): IterableIterator<Record<string, SqliteValue>>;
    /** Whether an integer is read as a bigint, so one past 2^53 keeps its digits and stays an integer. */
    setReadBigInts(enabled: boolean): void;
    /** Whether a row is read as an array of its columns, so two of one name are both read. */
    setReturnArrays(enabled: boolean): void;
}

/** What node:sqlite's DatabaseSync offers that Drivine uses. */
export interface SqliteDatabase {
    prepare(sql: string): SqliteStatement;
    exec(sql: string): void;
    close(): void;
    function(
        name: string,
        options: { deterministic?: boolean; directOnly?: boolean; varargs?: boolean; useBigIntArguments?: boolean },
        fn: (...args: SqliteValue[]) => SqliteValue | boolean | undefined
    ): void;
}

/** The least SQLite a store runs on: drivine4j's, for `json_group_array(… ORDER BY …)` and `->>`. */
const MINIMUM_SQLITE = [3, 45, 0];

/**
 * The oldest SQLite that writes a float it computes in JSON as the shortest text that reads back as it. One before it
 * writes 15 significant digits, so `json_quote(1.0/3)` is `0.333333333333333`.
 */
export const FULL_FLOATS_SQLITE = [3, 53, 0];

/** The numbers of a SQLite version, as `sqlite_version()` gives it: `3.50.4` is `[3, 50, 4]`, a missing part 0. */
export function sqliteVersion(text: string): number[] {
    const parts = text
        .trim()
        .split('.')
        .map((it) => parseInt(it, 10));
    return [0, 1, 2].map((i) => (Number.isFinite(parts[i]) ? parts[i] : 0));
}

/** Whether the SQLite version `text` is older than `minimum`, compared part by part. */
export function sqliteOlderThan(text: string, minimum: number[]): boolean {
    const version = sqliteVersion(text);
    for (let i = 0; i < minimum.length; i++) {
        if (version[i] !== minimum[i]) {
            return version[i] < minimum[i];
        }
    }
    return false;
}

/**
 * Warns, once, where the SQLite Node bundles writes a float it computes in JSON to 15 significant digits, as before
 * 3.53: compiled Cypher gives each value as JSON, so a float it computes comes back rounded, and one it writes is
 * stored rounded. Values bound or read from the store keep their digits. The SQLite comes with Node, so the warning
 * names the Nodes that bring a later one.
 */
export class RoundedFloats {
    private warned = false;

    constructor(private readonly logger: DrivineLogger = new DrivineLogger('SqliteDriver')) {}

    /** Warns of `version`, the SQLite of this process, if it rounds floats and none was warned of before. */
    warnOnce(version: string, node: string = process.versions.node): void {
        if (this.warned || !sqliteOlderThan(version, FULL_FLOATS_SQLITE)) {
            return;
        }
        this.warned = true;
        this.logger.warn(
            `SQLite ${version}, which Node ${node} bundles, writes a float it computes in JSON to 15 significant ` +
                'digits: compiled Cypher gives such a float rounded (1.0/3 as 0.333333333333333), and a computed ' +
                'float a statement writes is stored rounded. Parameters and stored values keep their digits. SQLite ' +
                `${FULL_FLOATS_SQLITE.slice(0, 2).join(
                    '.'
                )} or later, in Node 22.23 or later, 24.22 or later, or 26, ` +
                'gives a float to its last digit.'
        );
    }
}

/** The warning of this process: given once, however many files and providers are opened. */
const roundedFloats = new RoundedFloats();

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
    let db: SqliteDatabase;
    try {
        db = new driver!.DatabaseSync(path, { enableForeignKeyConstraints: true });
    } catch (e) {
        // SQLite's message, as for a folder that is not there, does not name the file.
        throw new DrivineError(`Could not open the SQLite file '${path}': ${(e as Error).message}.`, e as Error);
    }
    const version = String(db.prepare('SELECT sqlite_version() AS v').get()!.v);
    if (sqliteOlderThan(version, MINIMUM_SQLITE)) {
        db.close();
        throw new DrivineError(
            `A SQLite store needs SQLite ${MINIMUM_SQLITE.slice(0, 2).join('.')} or later; this Node's is ${version}.`
        );
    }
    roundedFloats.warnOnce(version);
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
