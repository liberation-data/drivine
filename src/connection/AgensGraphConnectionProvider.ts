import { DatabaseType } from '@/connection/DatabaseType';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { Connection } from '@/connection/Connection';
import { AgensGraphConnection } from '@/connection/AgensGraphConnection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { DrivineError } from '@/DrivineError';
import { QueryLanguage } from '@/query';
import { AgensResultMapper } from '@/mapper/AgensResultMapper';

const AgensGraph = require('@bitnine-oss/ag-driver');

export class AgensGraphConnectionProvider implements ConnectionProvider {
    private readonly pool: Pool;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly defaultGraphPath: string | undefined,
        readonly connectionProperties: PoolConfig
    ) {

        this.pool = new AgensGraph.Pool({...connectionProperties});
    }

    async connect(): Promise<Connection> {
        const client = await this.pool.connect();
        if (!Object.prototype.hasOwnProperty.call(client, 'sessionId')) {
            await this.setSessionId(client);
        }
        if (this.defaultGraphPath && client['graphPath'] !== this.defaultGraphPath) {
            await this.setGraphPath(client, this.defaultGraphPath);
        }
        return new AgensGraphConnection(client, new AgensResultMapper(), this.defaultLanguageFor(this.type));
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

    private async setGraphPath(client: PoolClient, path: string): Promise<void> {
        await client.query(`set graph_path = ${path}`);
        client['graphPath'] = path;
    }

    private defaultLanguageFor(database: DatabaseType): QueryLanguage {
        switch (database) {
            case DatabaseType.AGENS_GRAPH:
                return 'CYPHER';
            case DatabaseType.POSTGRES:
                return 'SQL';
            default:
                throw new DrivineError(`${database} is not supported by AgensGraphConnectionProvider`);
        }
    }
}
