import { DatabaseType } from '@/connection/DatabaseType';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { Connection } from '@/connection/Connection';
import { PostgresConnection } from '@/connection/postgres/PostgresConnection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { DEFAULT_GRAPH } from '@/backend/sql/SqlGraph';

export class PostgresConnectionProvider implements ConnectionProvider {
    private readonly pool: Pool;

    /**
     * @param graph the graph an object manager on this database works on: `drivine` unless named. Its tables are made by
     * the object manager, before its first statement; a persistence manager's plain SQL never makes them.
     */
    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly connectionProperties: PoolConfig,
        private readonly graph?: string
    ) {
        this.pool = new Pool({ ...connectionProperties });
        // Refuses a name that can't name the graph's tables now, rather than at the first statement.
        new PostgresGraph(this.graphName);
    }

    /** The graph an object manager on this database works on. */
    get graphName(): string {
        return this.graph ?? DEFAULT_GRAPH;
    }

    async connect(): Promise<Connection> {
        const client = await this.pool.connect();
        if (!Object.prototype.hasOwnProperty.call(client, 'sessionId')) {
            await this.setSessionId(client);
        }
        return new PostgresConnection(client, new PostgresResultMapper(), this.graphName);
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
        Object.assign(client, { sessionId: result.rows[0].sid });
    }
}
