import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { Driver } from 'neo4j-driver';
import { Connection } from '@/connection/Connection';
import { Neo4jConnection } from '@/connection/Neo4jConnection';
import { Neo4jResultMapper } from '@/mapper/Neo4jResultMapper';

const neo = require('neo4j-driver');
import shortId = require('shortid');
import { DatabaseType } from '@/connection/DatabaseType';

export class Neo4jConnectionProvider implements ConnectionProvider {
    private driver: Driver;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly host: string,
        readonly port: number,
        readonly user: string,
        readonly password: string | undefined,
        readonly database: string | undefined
    ) {
        const authToken = neo.auth.basic(this.user, this.password!);
        this.driver = neo.driver(`bolt://${this.host}:${this.port}`, authToken);
    }

    async connect(): Promise<Connection> {
        const session = this.driver.session({
            database: this.database
        });
        session['sessionId'] = shortId.generate();
        const connection = new Neo4jConnection(session, new Neo4jResultMapper());
        return Promise.resolve(connection);
    }

    async end(): Promise<void> {
        return this.driver.close();
    }
}
