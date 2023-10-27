import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { Config, Driver } from 'neo4j-driver';
import { Connection } from '@/connection/Connection';
import { Neo4jConnection } from '@/connection/Neo4jConnection';
import { Neo4jResultMapper } from '@/mapper/Neo4jResultMapper';
import * as neo from 'neo4j-driver'
import { DatabaseType } from '@/connection/DatabaseType';
import ShortUniqueId from "short-unique-id";

const shortId = new ShortUniqueId({ length: 7 });

export class Neo4jConnectionProvider implements ConnectionProvider {
    private driver: Driver;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly host: string,
        readonly port: number,
        readonly user: string,
        readonly password: string | undefined,
        readonly database: string | undefined,
        readonly protocol: string = 'bolt',
        readonly config: Config
    ) {
        const authToken = neo.auth.basic(this.user, this.password!);
        this.driver = neo.driver(`${this.protocol}://${this.host}:${this.port}`, authToken, { ...config });
    }

    async connect(): Promise<Connection> {
        const session = this.driver.session({
            database: this.database
        });
        session['sessionId'] = shortId.rnd();
        const connection = new Neo4jConnection(session, new Neo4jResultMapper());
        return Promise.resolve(connection);
    }

    async end(): Promise<void> {
        return this.driver.close();
    }
}
