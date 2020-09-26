import { Connection, ConnectionProvider, DatabaseType } from '@/connection';
import { RedisGraphConnection } from '@/connection/redis/RedisGraphConnection';
import { RedisGraphConfig } from '@/connection/redis/RedisGraphConfig';
import { ConnectionName } from '@/connection/ConnectionName';
import { RedisGraphResultMapper } from '@/mapper/RedisGraphResultMapper';
import { ResultMapper } from '@/mapper';
const Redis = require('ioredis')

const shortId = require('shortid');

export class RedisGraphConnectionProvider implements ConnectionProvider {
    private readonly mapper: ResultMapper = new RedisGraphResultMapper();

    constructor(
        readonly name: ConnectionName,
        readonly type: DatabaseType,
        readonly graph: string,
        readonly host: string | undefined,
        readonly port: number | undefined,
        readonly password?: string | undefined,
    ) {}

    async connect(): Promise<Connection> {
        const config = this.makeConfig();
        const redis = new Redis(config);
        redis['sessionId'] = shortId.generate();
        return Promise.resolve(new RedisGraphConnection(redis, this.graph, this.mapper));
    }

    async end(): Promise<void> {
        return Promise.resolve(undefined);
    }

    private makeConfig(): RedisGraphConfig {
        return <RedisGraphConfig>{
            port: this.port,
            host: this.host,
            family: 4,
            db: 0
        };
    }

}
