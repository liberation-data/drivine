import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { Config, Driver } from 'neo4j-driver';
import { Connection } from '@/connection/Connection';
import { Neo4jConnection } from '@/connection/neo4j/Neo4jConnection';
import { Neo4jResultMapper } from '@/connection/neo4j/Neo4jResultMapper';
import * as neo from 'neo4j-driver';
import { DatabaseType } from '@/connection/DatabaseType';
import ShortUniqueId from 'short-unique-id';
import { INSPECT, maskedPassword } from '@/connection/Masking';

const shortId = new ShortUniqueId({ length: 7 });

export class Neo4jConnectionProvider implements ConnectionProvider {
    private driver: Driver;
    /** Kept private, so a provider logged, or an error that carries one, doesn't print it (#730). */
    readonly #password: string | undefined;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly host: string,
        readonly port: number,
        readonly user: string,
        password: string | undefined,
        readonly database: string | undefined,
        readonly protocol: string = 'bolt',
        readonly config: Config
    ) {
        this.#password = password;
        const authToken = neo.auth.basic(this.user, password!);
        this.driver = neo.driver(`${this.protocol}://${this.host}:${this.port}`, authToken, { ...config });
    }

    async connect(): Promise<Connection> {
        const session = this.driver.session({
            database: this.database
        });
        Object.assign(session, { sessionId: shortId.rnd() });
        const connection = new Neo4jConnection(session, new Neo4jResultMapper());
        return Promise.resolve(connection);
    }

    async end(): Promise<void> {
        return this.driver.close();
    }

    /** The provider as it is printed: its settings, the password masked and the driver left out (#730). */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            type: this.type,
            host: this.host,
            port: this.port,
            user: this.user,
            password: maskedPassword(this.#password),
            database: this.database,
            protocol: this.protocol,
            config: this.config
        };
    }

    [INSPECT](): Record<string, unknown> {
        return this.toJSON();
    }
}
