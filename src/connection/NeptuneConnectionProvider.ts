import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { Config, Driver } from 'neo4j-driver';
import { Connection } from '@/connection/Connection';
import { Neo4jConnection } from '@/connection/Neo4jConnection';
import { Neo4jResultMapper } from '@/mapper/Neo4jResultMapper';
import * as neo from 'neo4j-driver'
import { DatabaseType } from '@/connection/DatabaseType';
import ShortUniqueId from 'short-unique-id';

const shortId = new ShortUniqueId({ length: 7 });

export class NeptuneConnectionProvider implements ConnectionProvider {

    private driver: Driver;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly host: string,
        readonly port: number,
        readonly protocol: string = 'bolt',
        readonly config: Config
    ) {

        const url = `${this.protocol}://${this.host}:${this.port}`;
        const authToken = { scheme: "basic", realm: "realm", principal: "username", credentials: "" };

        this.driver = neo.driver(url, authToken, {
            ...this.config,
            encrypted: "ENCRYPTION_ON",
            trust: "TRUST_SYSTEM_CA_SIGNED_CERTIFICATES",
            maxConnectionPoolSize: 1,
        });
    }

    async connect(): Promise<Connection> {
        const session = this.driver.session();
        session['sessionId'] = shortId.rnd();
        const connection = new Neo4jConnection(session, new Neo4jResultMapper());
        return Promise.resolve(connection);
    }

    async end(): Promise<void> {
        return this.driver.close();
    }

}