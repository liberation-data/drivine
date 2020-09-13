import { DatabaseType } from '@/connection/DatabaseType';

const AgensGraph = require('@liberation-data/agensgraph/lib');
import { PoolClient } from 'pg';
import { Connection } from '@/connection/Connection';
import { AgensGraphConnection } from '@/connection/AgensGraphConnection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { AgensGraphResultMapper } from '@/mapper/AgensGraphResultMapper';
import { ResultMapper } from '@/mapper';
import { PostgresResultMapper } from '@/mapper/PostgresResultMapper';
import { DrivineError } from '@/DrivineError';

export class AgensGraphConnectionProvider implements ConnectionProvider {
    private readonly pool: any;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly host: string,
        readonly user: string | undefined,
        readonly password: string | undefined,
        readonly database: string,
        readonly port: number,
        readonly idleTimeoutMillis: number,
        readonly defaultGraphPath: string | undefined
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

    async connect(): Promise<Connection> {
        const client = await this.pool.connect();
        if (!Object.prototype.hasOwnProperty.call(client, 'sessionId')) {
            await this.setSessionId(client);
        }
        if (this.defaultGraphPath && client['graphPath'] !== this.defaultGraphPath) {
            await this.setGraphPath(client, this.defaultGraphPath);
        }
        return new AgensGraphConnection(client, this.resultMapperFor(this.type));
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

    private resultMapperFor(database: DatabaseType): ResultMapper {
        switch (database) {
            case DatabaseType.AGENS_GRAPH:
                return new AgensGraphResultMapper();
            case DatabaseType.POSTGRES:
                return new PostgresResultMapper();
            default:
                throw new DrivineError(`${database} is not supported by AgensGraphConnectionProvider`);
        }
    }
}
