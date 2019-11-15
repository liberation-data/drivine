const AgensGraph = require('@liberation-data/agensgraph/lib');
import { PoolClient } from 'pg';
import { Connection } from '@/connection/Connection';
import { AgensGraphConnection } from '@/connection/AgensGraphConnection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { AgensGraphResultMapper } from '@/mapper/AgensGraphResultMapper';

export class AgensGraphConnectionProvider implements ConnectionProvider {
    private readonly pool: any;

    public constructor(
        public readonly host: string,
        public readonly user: string | undefined,
        public readonly password: string | undefined,
        public readonly database: string,
        public readonly port: number,
        public readonly idleTimeoutMillis: number,
        public readonly defaultGraphPath: string | undefined
    ) {
        this.pool = new AgensGraph.Pool({
            host: this.host,
            port: this.port,
            user: this.user,
            password: this.password,
            database: this.database,
            max: 40,
            idleTimeoutMillis: this.idleTimeoutMillis,
            connectionTimeoutMillis: 5000
        });
    }

    public async connect(): Promise<Connection> {
        const client = await this.pool.connect();
        if (!Object.prototype.hasOwnProperty.call(client, 'sessionId')) {
            await this.setSessionId(client);
        }
        if (this.defaultGraphPath && client['graphPath'] !== this.defaultGraphPath) {
            await this.setGraphPath(client, this.defaultGraphPath);
        }
        return new AgensGraphConnection(client, new AgensGraphResultMapper());
    }

    private async setSessionId(client: PoolClient): Promise<void> {
        const statement = `
            select format('%s.%s', to_hex(extract(epoch from backend_start)::int), to_hex(pid)) as sid
            from pg_stat_activity
            where pid = pg_backend_pid()`;
        const result = await client.query(statement);
        client['sessionId'] = result.rows[0].sid;
    }

    private async setGraphPath(client: PoolClient, path: string): Promise<void> {
        await client.query(`set graph_path = ${path}`);
        client['graphPath'] = path;
    }
}
