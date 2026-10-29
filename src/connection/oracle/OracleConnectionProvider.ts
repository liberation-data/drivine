import * as oracledb from 'oracledb';
import { DatabaseType } from '@/connection/DatabaseType';
import { Connection } from '@/connection/Connection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { OracleConnection } from '@/connection/oracle/OracleConnection';
import { OracleResultMapper } from '@/connection/oracle/OracleResultMapper';
import { DEFAULT_GRAPH, OracleGraph } from '@/backend/oracle/OracleGraph';
import { FirstConnection } from '@/connection/FirstConnection';
import { DrivineLogger } from '@/logger';

/** The oldest Oracle Drivine runs Cypher on, 23.9: see {@link oracleRefusal}. */
const ORACLE_MAJOR = 23;
const ORACLE_MINOR = 9;

/**
 * Why Drivine runs no Cypher on the Oracle behind `connection`: one older than 23.9, which has no `UUID()`, the random
 * version 4 UUID compiled Cypher's `randomUUID()` is (liberation-data/drivine#428, as liberation-data/drivine4j#401).
 * Undefined for 23.9 or later, and where the version can't be read: the database says what is missing when a statement
 * needs it. node-oracledb gives 23.26.3 as `oracleServerVersion` 2326030000 and `oracleServerVersionString` '23.26.3.0.0'.
 */
export function oracleRefusal(connection: {
    oracleServerVersion?: number;
    oracleServerVersionString?: string;
}): string | undefined {
    const number = connection.oracleServerVersion;
    if (typeof number !== 'number' || !(number > 0)) {
        return undefined;
    }
    const major = Math.floor(number / 100_000_000);
    const minor = Math.floor(number / 1_000_000) % 100;
    if (major > ORACLE_MAJOR || (major === ORACLE_MAJOR && minor >= ORACLE_MINOR)) {
        return undefined;
    }
    const version = connection.oracleServerVersionString || `${major}.${minor}`;
    return (
        `Drivine needs Oracle ${ORACLE_MAJOR}.${ORACLE_MINOR} or later (it uses UUID()); this database is ${version}. ` +
        `Upgrade, or use an Oracle Free image ${ORACLE_MAJOR}.${ORACLE_MINOR} or newer. Plain SQL over this provider still runs; Cypher does not.`
    );
}

export interface OracleConnectionProperties {
    user?: string;
    password?: string;
    /** `host:port/service`, e.g. `localhost:1521/FREEPDB1`. */
    connectString: string;
    poolMax?: number;
    connectTimeout?: number;
    /** The graph whose tables are made on first connection, when absent. */
    graph?: string;
}

/**
 * Connections to Oracle, from a pool of its own, through node-oracledb in thin mode (no Instant Client). Drivine needs
 * Oracle 23.9 or later: on an older one, found on the first connection, a connection is still handed out and plain SQL
 * runs, and Cypher, which needs Oracle's `UUID()`, is refused with why (see {@link oracleRefusal}).
 */
export class OracleConnectionProvider implements ConnectionProvider {
    private readonly logger = new DrivineLogger(OracleConnectionProvider.name);
    private pool?: Promise<oracledb.Pool>;
    private readonly firstConnection = new FirstConnection();
    /** Why this store runs no Cypher, read from the server's version on the first connection; undefined where it does. */
    private cypherRefusal?: string;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly connectionProperties: OracleConnectionProperties
    ) {
        // Refuses a name that can't name the graph's tables now, rather than at the first connection.
        new OracleGraph(this.graphName);
    }

    /** The graph this store works on, whose tables are made on first connection. */
    get graphName(): string {
        return this.connectionProperties.graph ?? DEFAULT_GRAPH;
    }

    /**
     * A connection, the graph's tables made first if this is the provider's first (schema statements commit on their
     * own): see {@link FirstConnection}. The first connection's server version, which the driver reads as it connects and
     * which needs no grant, says whether the store runs Cypher, once for the provider: see {@link oracleRefusal}.
     */
    async connect(): Promise<Connection> {
        const connection = await this.firstConnection.ensured(
            await (await this.poolOf()).getConnection(),
            async (it) => {
                this.checkVersion(it);
                return new OracleGraph(this.graphName).ensure(it);
            },
            async (it) => it.close()
        );
        const session = await connection.execute<{ SID: string }>(
            "SELECT SYS_CONTEXT('USERENV', 'SID') AS SID FROM dual",
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return new OracleConnection(
            connection,
            new OracleResultMapper(),
            `oracle.${session.rows?.[0]?.SID ?? '?'}`,
            this.graphName,
            `${this.connectionProperties.connectString}|${this.connectionProperties.user ?? ''}`,
            this.cypherRefusal
        );
    }

    async end(): Promise<void> {
        if (this.pool) {
            const pool = await this.pool;
            this.pool = undefined;
            await pool.close(0);
        }
    }

    /** Finds whether the Oracle behind `connection` is too old for Cypher, and warns if so. */
    private checkVersion(connection: oracledb.Connection): void {
        try {
            this.cypherRefusal = oracleRefusal(connection);
        } catch (e) {
            this.logger.debug(`Could not read the version of Oracle database '${this.name}': ${e}`);
            this.cypherRefusal = undefined;
        }
        if (this.cypherRefusal) {
            this.logger.warn(`ORACLE database '${this.name}': ${this.cypherRefusal}`);
        }
    }

    private async poolOf(): Promise<oracledb.Pool> {
        this.pool ??= oracledb.createPool({
            user: this.connectionProperties.user,
            password: this.connectionProperties.password,
            connectString: this.connectionProperties.connectString,
            poolMin: 0,
            poolMax: this.connectionProperties.poolMax ?? 10,
            connectTimeout: this.connectionProperties.connectTimeout,
            sessionCallback: withoutAdaptivePlans
        });
        return this.pool;
    }
}

/**
 * Sets up each session the pool opens: Oracle makes no adaptive plan in it. An adaptive plan picks its joins as it
 * runs, and once the graph's tables had grown and shrunk without statistics, one gave no rows for a join that filters
 * a node by a label and a property, where the same plan, fixed, gave them (liberation-data/drivine#331). A walk's step
 * already asks for no adaptive plan (liberation-data/drivine4j#182); this covers every statement.
 */
function withoutAdaptivePlans(
    connection: oracledb.Connection,
    _requestedTag: string,
    done: (error?: Error) => void
): void {
    connection.execute('ALTER SESSION SET OPTIMIZER_ADAPTIVE_PLANS = FALSE').then(
        () => done(),
        (e) => done(e)
    );
}
