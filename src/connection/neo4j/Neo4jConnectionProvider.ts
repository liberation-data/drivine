import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { Driver } from 'neo4j-driver';
import { Connection } from '@/connection/Connection';
import { Neo4jConnection } from '@/connection/neo4j/Neo4jConnection';
import { Neo4jResultMapper } from '@/mapper/Neo4jResultMapper';

const neo = require('neo4j-driver');
import shortId = require('shortid');
import { DatabaseType } from '@/connection/DatabaseType';
import { ConnectionName } from '@/connection/ConnectionName';
import { ResultMapper } from '@/mapper';

export class Neo4jConnectionProvider implements ConnectionProvider {
    private driver: Driver;
    private readonly mapper: ResultMapper = new Neo4jResultMapper();

    constructor(
        readonly name: ConnectionName,
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
        const connection = new Neo4jConnection(session, this.mapper);
        return Promise.resolve(connection);
    }

    async end(): Promise<void> {
        return this.driver.close();
    }
}
