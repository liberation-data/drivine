import * as oracledb from 'oracledb';
import { DatabaseType } from '@/connection/DatabaseType';
import { Connection } from '@/connection/Connection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { OracleConnection } from '@/connection/oracle/OracleConnection';
import { OracleResultMapper } from '@/connection/oracle/OracleResultMapper';
import { DEFAULT_GRAPH, OracleGraph } from '@/backend/oracle/OracleGraph';
import { FirstConnection } from '@/connection/FirstConnection';

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

/** Connections to Oracle, from a pool of its own, through node-oracledb in thin mode (no Instant Client). */
export class OracleConnectionProvider implements ConnectionProvider {
    private pool?: Promise<oracledb.Pool>;
    private readonly firstConnection = new FirstConnection();

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
     * own): see {@link FirstConnection}.
     */
    async connect(): Promise<Connection> {
        const connection = await this.firstConnection.ensured(
            await (await this.poolOf()).getConnection(),
            async (it) => new OracleGraph(this.graphName).ensure(it),
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
            `${this.connectionProperties.connectString}|${this.connectionProperties.user ?? ''}`
        );
    }

    async end(): Promise<void> {
        if (this.pool) {
            const pool = await this.pool;
            this.pool = undefined;
            await pool.close(0);
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
