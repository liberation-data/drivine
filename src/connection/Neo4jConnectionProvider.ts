import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { Driver } from 'neo4j-driver/types/v1';
import { Connection } from '@/connection/Connection';
import { Neo4jConnection } from '@/connection/Neo4jConnection';
import { Neo4jResultMapper } from '@/mapper/Neo4jResultMapper';

const neo = require('neo4j-driver').v1;
import shortId = require('shortid');

export class Neo4jConnectionProvider implements ConnectionProvider {
    private driver: Driver;

    public constructor(
        public readonly host: string,
        public readonly port: number,
        public readonly user: string,
        public readonly password: string | undefined
    ) {
        const authToken = neo.auth.basic(this.user, this.password);
        this.driver = neo.driver(`bolt://${this.host}:${this.port}`, authToken);
    }

    public async connect(): Promise<Connection> {
        const session = this.driver.session();
        session['sessionId'] = shortId.generate();
        const connection = new Neo4jConnection(session, new Neo4jResultMapper());
        return Promise.resolve(connection);
    }
}
