import { DatabaseType } from '@/connection/DatabaseType';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { Connection } from '@/connection/Connection';
import { PostgresConnection } from '@/connection/postgres/PostgresConnection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { DEFAULT_GRAPH } from '@/backend/sql/SqlGraph';
import { FirstConnection } from '@/connection/FirstConnection';

/** Connections to Postgres, from a pool of its own, through `pg`. */
export class PostgresConnectionProvider implements ConnectionProvider {
    private readonly pool: Pool;
    private readonly firstConnection = new FirstConnection();

    /**
     * @param graph the graph this store works on: `drivine` unless named. Its tables are made on first connection, when
     * absent, whether a persistence manager or an object manager asks for it.
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

    /** The graph this store works on, whose tables are made on first connection. */
    get graphName(): string {
        return this.graph ?? DEFAULT_GRAPH;
    }

    /**
     * A connection, the graph's tables made first if this is the provider's first: see {@link FirstConnection}. The
     * block runs on the connection outside a transaction, so it is applied whole or not at all, and is the same one
     * the object manager runs (`PostgresGraph.ensuring`).
     */
    async connect(): Promise<Connection> {
        const client = await this.firstConnection.ensured(
            await this.pool.connect(),
            async (it) => it.query(new PostgresGraph(this.graphName).ensuring),
            (it, failure) => it.release(failure)
        );
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
