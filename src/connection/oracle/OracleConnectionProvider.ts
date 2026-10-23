import * as oracledb from 'oracledb';
import { DatabaseType } from '@/connection/DatabaseType';
import { Connection } from '@/connection/Connection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { OracleConnection } from '@/connection/oracle/OracleConnection';
import { OracleResultMapper } from '@/connection/oracle/OracleResultMapper';
import { DEFAULT_GRAPH, OracleGraph } from '@/backend/oracle/OracleGraph';

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
    private ensured?: Promise<void>;

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

    /** A connection, the graph's tables made first if this is the first (schema statements commit on their own). */
    async connect(): Promise<Connection> {
        const connection = await (await this.poolOf()).getConnection();
        this.ensured ??= connection
            .execute(new OracleGraph(this.graphName).ensuring)
            .then(() => undefined)
            .catch((e) => {
                this.ensured = undefined;
                throw e;
            });
        try {
            await this.ensured;
        } catch (e) {
            await connection.close();
            throw e;
        }
        const session = await connection.execute<{ SID: string }>(
            "SELECT SYS_CONTEXT('USERENV', 'SID') AS SID FROM dual",
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return new OracleConnection(
            connection,
            new OracleResultMapper(),
            `oracle.${session.rows?.[0]?.SID ?? '?'}`,
            this.graphName
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
            connectTimeout: this.connectionProperties.connectTimeout
        });
        return this.pool;
    }
}
