import { DrivineError } from '@/DrivineError';

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
 * What a SQLite that writes a float it computes in JSON to 17 significant digits, which read back as it, gives for
 * `json_quote(0.1 + 0.2)`. One that writes 15 gives `0.3`. SQLite 3.53 writes 17 by default, but a build may keep 15,
 * as 3.53.1 does in one Python's, so it is asked, not told by its version.
 */
export const FULL_FLOATS_PROBE = '0.30000000000000004';

/** The statement that asks a SQLite how it writes a float it computes in JSON. */
const FLOATS_PROBE_SQL = 'SELECT json_quote(0.1 + 0.2) AS q';

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

/** The code of the warning `RoundedFloats` gives, to filter it on. */
export const ROUNDED_FLOATS_WARNING = 'DRIVINE_SQLITE_ROUNDED_FLOATS';

/** Gives a warning as `process.emitWarning` does. */
export type EmitWarning = (message: string, options: { code: string }) => void;

/**
 * Warns, once, where the SQLite Node bundles writes a float it computes in JSON to fewer than 17 significant digits, as
 * SQLite before 3.53 writes 15: compiled Cypher gives each value as JSON, so a float it computes comes back rounded, and
 * one it writes is stored rounded. Values bound or read from the store keep their digits. It is told by how SQLite
 * writes `0.1 + 0.2` (see FULL_FLOATS_PROBE), not by its version, which is only named. The SQLite comes with Node, so
 * the warning names Nodes measured to bring one that writes 17. It is a Node process warning, shown whatever Drivine's
 * log level, and silenced by `--disable-warning=DRIVINE_SQLITE_ROUNDED_FLOATS` or `--no-warnings`.
 */
export class RoundedFloats {
    private warned = false;

    constructor(private readonly emit: EmitWarning = (message, options) => process.emitWarning(message, options)) {}

    /**
     * Warns of `version`, the SQLite of this process, if `probe`, what it gave for `json_quote(0.1 + 0.2)`, is rounded,
     * and none was warned of before. `probe` is a function, so SQLite is asked only until it has been warned of. A probe
     * that fails says nothing, and never stops a file opening.
     */
    warnOnce(version: string, probe: () => string, node: string = process.versions.node): void {
        if (this.warned) {
            return;
        }
        let answer: string;
        try {
            answer = probe();
        } catch {
            return;
        }
        if (answer === FULL_FLOATS_PROBE) {
            return;
        }
        this.warned = true;
        this.emit(
            `SQLite ${version}, which Node ${node} bundles, writes a float it computes in JSON to fewer than 17 ` +
                'significant digits: compiled Cypher gives such a float rounded (0.1 + 0.2 as 0.3), and a computed ' +
                'float a statement writes is stored rounded. Parameters and stored values keep their digits. A Node ' +
                'whose SQLite writes 17 digits, as Node 22.23.4, 24.22.2 and 26.13 were measured to, gives a float to ' +
                'its last digit.',
            { code: ROUNDED_FLOATS_WARNING }
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
    roundedFloats.warnOnce(version, () => String(db.prepare(FLOATS_PROBE_SQL).get()!.q));
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
