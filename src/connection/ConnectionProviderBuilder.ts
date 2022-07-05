import { DatabaseType } from '@/connection/DatabaseType';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { DrivineError } from '@/DrivineError';
import { Neo4jConnectionProvider } from '@/connection/Neo4jConnectionProvider';
import * as assert from 'assert';
import { AgensGraphConnectionProvider } from '@/connection/AgensGraphConnectionProvider';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { ConnectionProperties } from '@/connection/ConnectionProperties';
import { DrivineLogger } from '@/logger';

export class ConnectionProviderBuilder {
    private logger = new DrivineLogger(ConnectionProviderBuilder.name);

    // Common properties
    private _type: DatabaseType;
    private _host: string;
    private _port?: number;
    private _userName?: string;
    private _password?: string;
    private _protocol?: string;
    private _poolMax?: number;

    // AgensGraph properties
    private _idleTimeout?: number;
    private _connectionTimeout?: number;
    private _name?: string;
    private _defaultGraphPath?: string;

    private registry: DatabaseRegistry;

    constructor(registry: DatabaseRegistry) {
        this.registry = registry;
    }

    withProperties(properties: ConnectionProperties): this {
        this._type = properties.databaseType;
        this._host = properties.host;
        this._port = properties.port;
        this._userName = properties.userName;
        this._password = properties.password;
        this._idleTimeout = properties.idleTimeout;
        this._connectionTimeout = properties.connectionTimeout ?? 5000;
        this._name = properties.databaseName;
        this._defaultGraphPath = properties.defaultGraphPath;
        this._protocol = properties.protocol;
        this._poolMax = properties.poolMax ?? 40;
        return this;
    }

    withType(type: DatabaseType): this {
        assert(type, `database type argument is required`);
        this._type = type;
        return this;
    }

    host(host: string): this {
        this._host = host;
        return this;
    }

    port(port: number): this {
        this._port = port;
        return this;
    }

    userName(userName: string): this {
        this._userName = userName;
        return this;
    }

    password(password: string): this {
        this._password = password;
        return this;
    }

    protocol(protocol: string): this {
        this._protocol = protocol;
        return this;
    }

    idleTimeout(idleTimeout: number): this {
        this._idleTimeout = idleTimeout;
        return this;
    }

    databaseName(name: string): this {
        this._name = name;
        return this;
    }

    defaultGraphPath(path: string): this {
        this._defaultGraphPath = path;
        return this;
    }

    /**
     * Registers a database details with the specified properties. If a database is already registered under the
     * specified name, the connection properties will be updated.
     * @param name A unique name for the database.
     */
    register(name: string = 'default'): ConnectionProvider {
        const retained = this.registry.connectionProvider(name);
        if (retained != undefined) {
            return retained;
        }

        assert(this._host, `host config is required`);

        if (this._type === DatabaseType.AGENS_GRAPH || this._type == DatabaseType.POSTGRES) {
            this.registry.register(this.buildAgensGraphAndPostgresProvider(name));
        } else if (this._type === DatabaseType.NEO4J) {
            this.registry.register(this.buildNeo4jProvider(name));
        } else {
            throw new DrivineError(`Type ${this._type} is not supported by ConnectionProviderBuilder`);
        }
        return this.registry.connectionProvider(name)!;
    }

    private buildAgensGraphAndPostgresProvider(name: string): ConnectionProvider {
        if (!this._port) {
            this._port = 5432;
        }
        if (this._port !== 5432) {
            this.logger.warn(`${this._port} is a non-standard port for AgensGraph/Postgres.`);
        }
        if (!this._idleTimeout) {
            this._idleTimeout = 500;
        }
        assert(this._name, `Database name is required`);

        return new AgensGraphConnectionProvider(name, this._type, this._defaultGraphPath, {
            host: this._host,
            user: this._userName,
            password: this._password,
            database: this._name!,
            port: this._port,
            idleTimeoutMillis: this._idleTimeout,
            connectionTimeoutMillis: this._connectionTimeout,
            max: this._poolMax
        });
    }

    private buildNeo4jProvider(name: string): ConnectionProvider {
        assert(this._userName, `Neo4j requires a username`);

        if (this._idleTimeout) {
            this.logger.warn(`idleTimeout is not supported by Neo4j`);
        }
        if (!this._port) {
            this._port = 7687;
        }
        if (this._port !== 7687) {
            this.logger.warn(`${this._port} is a non-standard port for Neo4j`);
        }

        return new Neo4jConnectionProvider(
            name,
            this._type,
            this._host,
            this._port,
            this._userName!,
            this._password,
            this._name,
            this._protocol,
            {
                connectionTimeout: this._connectionTimeout,
                maxConnectionPoolSize: this._poolMax
            }
        );
    }
}
