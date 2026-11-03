import { DatabaseType } from '@/connection/DatabaseType';
import { Connection } from '@/connection/Connection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { FirstConnection } from '@/connection/FirstConnection';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { SqliteConnection } from '@/connection/sqlite/SqliteConnection';
import { openSqlite, SqliteDatabase, waitingOutLocks } from '@/connection/sqlite/SqliteDriver';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { SqliteGraph } from '@/backend/sqlite/SqliteGraph';
import { DEFAULT_GRAPH } from '@/backend/sql/SqlGraph';
import { QuerySpecification } from '@/query/QuerySpecification';

/** How long a connection waits for a locked file by default: long enough for any one save to finish, as drivine4j's. */
export const DEFAULT_BUSY_TIMEOUT_MILLIS = 30_000;

/** What a SQLite store is opened with, beside its file. */
export interface SqliteOptions {
    /** The graph this store works on: `drivine` unless named. */
    graph?: string;
    /** How long a statement waits for a locked file before it is turned away. Defaults to 30 seconds. */
    busyTimeoutMillis?: number;
    /** How many idle connections are kept for reuse. Defaults to 10. */
    poolMax?: number;
}

/**
 * Connections to the SQLite file at `path`, each opened as Drivine's statements want it, with the functions they call
 * registered on it (see SqliteFunctions). SQLite 3.45 or later, through Node's own driver, `node:sqlite`.
 *
 * - The journal is a write-ahead log, so readers do not wait for the writer, nor the writer for them.
 * - Foreign keys are enforced, so a node's relationships go with it.
 * - A connection that finds the file locked waits for it, up to the busy timeout (see SqliteConnection).
 * - A transaction takes the write lock as it begins (`BEGIN IMMEDIATE`).
 * - The log is synced at a checkpoint and not at each commit, as is safe with a write-ahead log: a commit may be lost to
 *   a power cut, and the file is never left corrupt.
 *
 * The graph's tables are made on the first connection when they are not there, as on Postgres (see FirstConnection).
 * Idle connections are kept for reuse; a connection given back after it failed, or after the provider ended, is closed.
 */
export class SqliteConnectionProvider implements ConnectionProvider {
    private readonly idle: SqliteDatabase[] = [];
    /** Whether the provider has ended since it last connected: a connection given back then is closed. */
    private ended = false;
    private readonly firstConnection = new FirstConnection(
        () => `graph '${this.graphName}' on ${this.type} file '${this.path}'`
    );

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly path: string,
        private readonly options: SqliteOptions = {}
    ) {
        // Refuses a name that can't name the graph's tables now, rather than at the first statement.
        new SqliteGraph(this.graphName);
    }

    /** The graph this store works on, whose tables are made on first connection. */
    get graphName(): string {
        return this.options.graph ?? DEFAULT_GRAPH;
    }

    private get busyTimeoutMillis(): number {
        return this.options.busyTimeoutMillis ?? DEFAULT_BUSY_TIMEOUT_MILLIS;
    }

    async connect(): Promise<Connection> {
        this.ended = false;
        return this.firstConnection.ensured(
            this.connection(this.idle.pop() ?? (await this.open())),
            async (it) => it.query(new QuerySpecification(new SqliteGraph(this.graphName).ensuring)),
            async (it, failure) => it.release(failure)
        );
    }

    /** Closes the idle connections, and each in use as it is given back. */
    async end(): Promise<void> {
        this.ended = true;
        this.idle.splice(0).forEach((it) => it.close());
        return Promise.resolve();
    }

    private connection(db: SqliteDatabase): SqliteConnection {
        return new SqliteConnection(
            db,
            new PostgresResultMapper(),
            this.busyTimeoutMillis,
            (it, failed) => {
                if (failed || this.ended || this.idle.length >= (this.options.poolMax ?? 10)) {
                    it.close();
                } else {
                    this.idle.push(it);
                }
            },
            this.graphName
        );
    }

    /** A connection to the file, opened as Drivine's statements want it, waiting for the file where it is locked. */
    private async open(): Promise<SqliteDatabase> {
        return waitingOutLocks(() => {
            const db = openSqlite(this.path);
            try {
                // SQLite's own wait would stop the process: a connection waits for a locked file by trying again.
                db.exec('PRAGMA busy_timeout = 0');
                db.exec('PRAGMA journal_mode = WAL');
                db.exec('PRAGMA foreign_keys = ON');
                db.exec('PRAGMA synchronous = NORMAL');
                SqliteFunctions.register(db);
            } catch (e) {
                db.close();
                throw e;
            }
            return db;
        }, this.busyTimeoutMillis);
    }
}
