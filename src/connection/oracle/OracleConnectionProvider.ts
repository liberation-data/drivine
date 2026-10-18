import * as oracledb from 'oracledb';
import { DatabaseType } from '@/connection/DatabaseType';
import { Connection } from '@/connection/Connection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { OracleConnection } from '@/connection/oracle/OracleConnection';
import { OracleResultMapper } from '@/connection/oracle/OracleResultMapper';

export interface OracleConnectionProperties {
    user?: string;
    password?: string;
    /** `host:port/service`, e.g. `localhost:1521/FREEPDB1`. */
    connectString: string;
    poolMax?: number;
    connectTimeout?: number;
}

/** Connections to Oracle, from a pool of its own, through node-oracledb in thin mode (no Instant Client). */
export class OracleConnectionProvider implements ConnectionProvider {
    private pool?: Promise<oracledb.Pool>;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly connectionProperties: OracleConnectionProperties
    ) {}

    async connect(): Promise<Connection> {
        const connection = await (await this.poolOf()).getConnection();
        const session = await connection.execute<{ SID: string }>(
            "SELECT SYS_CONTEXT('USERENV', 'SID') AS SID FROM dual",
            {},
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return new OracleConnection(connection, new OracleResultMapper(), `oracle.${session.rows?.[0]?.SID ?? '?'}`);
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
