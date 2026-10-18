import { DatabaseType } from '@/connection/DatabaseType';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { Connection } from '@/connection/Connection';
import { PostgresConnection } from '@/connection/PostgresConnection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { PostgresResultMapper } from '@/mapper/PostgresResultMapper';

export class PostgresConnectionProvider implements ConnectionProvider {
    private readonly pool: Pool;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly connectionProperties: PoolConfig
    ) {
        this.pool = new Pool({ ...connectionProperties });
    }

    async connect(): Promise<Connection> {
        const client = await this.pool.connect();
        if (!Object.prototype.hasOwnProperty.call(client, 'sessionId')) {
            await this.setSessionId(client);
        }
        return new PostgresConnection(client, new PostgresResultMapper());
    }

    async end(): Promise<void> {
        await this.pool.end();
    }

    private async setSessionId(client: PoolClient): Promise<void> {
        const statement = `
            select format('%s.%s', to_hex(extract(epoch from backend_start)::int), to_hex(pid)) as sid
            from pg_stat_activity
            where pid = pg_backend_pid()`;
        const result = await client.query(statement);
        client['sessionId'] = result.rows[0].sid;
    }
}
