import { DatabaseType } from '@/connection';
import { ConnectionProvider } from '@/connection';
import { DrivineError } from '@/drivine-error';
import { Neo4jConnectionProvider } from '@/connection';
import * as assert from 'assert';
import { AgensGraphConnectionProvider } from '@/connection';
import { DatabaseRegistry } from '@/connection';
import { ConnectionProperties } from '@/connection';
import { DrivineLogger } from '@/logger';

export class ConnectionProviderBuilder {
    private logger = new DrivineLogger(ConnectionProviderBuilder.name);

    // Common properties
    private _type: DatabaseType;
    private _host: string;
    private _port?: number;
    private _userName?: string;
    private _password?: string;

    // AgensGraph properties
    private _idleTimeout?: number;
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
        this._name = properties.databaseName;
        this._defaultGraphPath = properties.defaultGraphPath;
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

    buildOrResolve(name: string = 'default'): ConnectionProvider {
        const retained = this.registry.connectionProvider(name);
        if (retained != undefined) {
            return retained;
        }

        assert(this._host, `host config is required`);

        if (this._type === DatabaseType.AGENS_GRAPH) {
            this.registry.register(this.buildAgensGraphProvider(name));
        } else if (this._type === DatabaseType.NEO4J) {
            this.registry.register(this.buildNeo4jProvider(name));
        } else {
            throw new DrivineError(`Type ${this._type} is not supported by ConnectionProviderBuilder`);
        }
        return this.registry.connectionProvider(name)!;
    }

    private buildAgensGraphProvider(name: string): ConnectionProvider {
        if (!this._port) {
            this._port = 5432;
        }
        if (!this._idleTimeout) {
            this._idleTimeout = 500;
        }
        assert(this._name, `Database name is required`);

        return new AgensGraphConnectionProvider(
            name,
            this._host,
            this._userName,
            this._password,
            this._name!,
            this._port,
            this._idleTimeout,
            this._defaultGraphPath
        );
    }

    private buildNeo4jProvider(name: string): ConnectionProvider {
        assert(this._userName, `Neo4j requires a username`);

        if (this._idleTimeout) {
            this.logger.warn(`idleTimeout is not supported by Neo4j`);
        }
        if (this._name) {
            this.logger.warn(`Database name is not supported by Neo4j`);
        }

        if (!this._port) {
            this._port = 7687;
        }

        return new Neo4jConnectionProvider(name, this._host, this._port, this._userName!, this._password);
    }
}
