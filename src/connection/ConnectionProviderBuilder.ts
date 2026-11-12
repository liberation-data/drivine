import { DatabaseType } from '@/connection/DatabaseType';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { DrivineError } from '@/DrivineError';
import { Neo4jConnectionProvider } from '@/connection/neo4j/Neo4jConnectionProvider';
import * as assert from 'assert';
import { PostgresConnectionProvider } from '@/connection/postgres/PostgresConnectionProvider';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { ConnectionProperties } from '@/connection/ConnectionProperties';
import { DrivineLogger } from '@/logger';
import { NeptuneConnectionProvider } from '@/connection/neptune/NeptuneConnectionProvider';
import { TransactionMode } from '@/connection/TransactionMode';
import { FalkorDbConnectionProvider } from '@/connection/falkordb/FalkorDbConnectionProvider';
import { OracleConnectionProvider } from '@/connection/oracle/OracleConnectionProvider';
import { SqliteConnectionProvider } from '@/connection/sqlite/SqliteConnectionProvider';

/**
 * Engines without multi-statement transactions, which honour {@link TransactionMode}.
 */
const AUTO_COMMIT_ENGINES: DatabaseType[] = [DatabaseType.FALKORDB];

/** The stores that keep a graph of a name in tables of its own: `defaultGraphPath` names it. */
const GRAPH_STORES = [DatabaseType.ORACLE, DatabaseType.POSTGRES, DatabaseType.SQLITE];

export class ConnectionProviderBuilder {
    private logger = new DrivineLogger(ConnectionProviderBuilder.name);

    // Common properties
    private _type: DatabaseType;
    private _host: string;
    private _port?: number;
    private _userName?: string;
    private _protocol?: string;
    private _poolMax?: number;
    private _transactionMode?: TransactionMode;
    private _defaultGraphPath?: string;

    // Postgres properties
    private _idleTimeout?: number;
    private _connectionTimeout?: number;
    /** On SQLite, how long a statement waits for a locked file: the connection timeout, where one is given. */
    private _busyTimeout?: number;
    private _name?: string;

    private registry: DatabaseRegistry;

    /** Kept private, so a builder logged doesn't print it (#730). */
    #password?: string;

    constructor(registry: DatabaseRegistry) {
        this.registry = registry;
    }

    withProperties(properties: ConnectionProperties): this {
        this._type = properties.databaseType;
        this._host = properties.host;
        this._port = properties.port;
        this._userName = properties.userName;
        this.#password = properties.password;
        this._idleTimeout = properties.idleTimeout;
        this._connectionTimeout = properties.connectionTimeout ?? 5000;
        this._busyTimeout = properties.connectionTimeout;
        this._name = properties.databaseName;
        this._protocol = properties.protocol;
        this._poolMax = properties.poolMax ?? 40;
        this._transactionMode = properties.transactionMode;
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
        this.#password = password;
        return this;
    }

    protocol(protocol: string): this {
        this._protocol = protocol;
        return this;
    }

    transactionMode(mode: TransactionMode): this {
        this._transactionMode = mode;
        return this;
    }

    /** On Oracle and Postgres, the graph to work on: see {@link ConnectionProperties.defaultGraphPath}. */
    defaultGraphPath(path: string): this {
        this._defaultGraphPath = path;
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

        // A file has no host: SQLite is built from its path alone.
        if (this._type !== DatabaseType.SQLITE) {
            assert(this._host, `host config is required`);
        }
        if (this._defaultGraphPath && !GRAPH_STORES.includes(this._type)) {
            this.logger.warn(`defaultGraphPath is ignored by ${this._type}, which names no graph`);
        }
        if (this._transactionMode && !AUTO_COMMIT_ENGINES.includes(this._type)) {
            this.logger.warn(`transactionMode is ignored by ${this._type}, which supports transactions`);
        }

        const build: Partial<Record<DatabaseType, (name: string) => ConnectionProvider>> = {
            [DatabaseType.POSTGRES]: (it) => this.buildPostgresProvider(it),
            [DatabaseType.NEO4J]: (it) => this.buildNeo4jProvider(it),
            [DatabaseType.NEPTUNE]: (it) => this.buildNeptuneProvider(it),
            [DatabaseType.FALKORDB]: (it) => this.buildFalkorDbProvider(it),
            [DatabaseType.MEMGRAPH]: (it) => this.buildMemgraphProvider(it),
            [DatabaseType.ORACLE]: (it) => this.buildOracleProvider(it),
            [DatabaseType.SQLITE]: (it) => this.buildSqliteProvider(it)
        };
        const builder = build[this._type];
        if (!builder) {
            throw new DrivineError(`Type ${this._type} is not supported by ConnectionProviderBuilder`);
        }
        this.registry.register(builder(name));
        return this.registry.connectionProvider(name)!;
    }

    private buildPostgresProvider(name: string): ConnectionProvider {
        if (!this._port) {
            this._port = 5432;
        }
        if (this._port !== 5432) {
            this.logger.warn(`${this._port} is a non-standard port for Postgres.`);
        }
        if (!this._idleTimeout) {
            this._idleTimeout = 500;
        }
        assert(this._name, `Database name is required`);

        return new PostgresConnectionProvider(
            name,
            this._type,
            {
                host: this._host,
                user: this._userName,
                password: this.#password,
                database: this._name!,
                port: this._port,
                idleTimeoutMillis: this._idleTimeout,
                connectionTimeoutMillis: this._connectionTimeout,
                max: this._poolMax
            },
            this._defaultGraphPath
        );
    }

    /** Oracle's database name is its service, as in `host:1521/FREEPDB1`. */
    private buildOracleProvider(name: string): ConnectionProvider {
        assert(this._name, `Oracle requires a database name: the service, e.g. FREEPDB1`);
        if (this._idleTimeout) {
            this.logger.warn(`idleTimeout is not supported by Oracle`);
        }
        return new OracleConnectionProvider(name, this._type, {
            user: this._userName,
            password: this.#password,
            connectString: `${this._host}:${this._port ?? 1521}/${this._name}`,
            poolMax: this._poolMax,
            connectTimeout: this._connectionTimeout ? Math.ceil(this._connectionTimeout / 1000) : undefined,
            graph: this._defaultGraphPath
        });
    }

    /**
     * SQLite: the database name is the path of the file, made if it is not there, and the default graph path names the
     * graph's tables. A file has no host or protocol: each is warned of where it is set. The connection timeout is how
     * long a statement waits for a locked file; a port, a user and a password are not read.
     */
    private buildSqliteProvider(name: string): ConnectionProvider {
        assert(this._name, `SQLite requires a database name: the path of the database file`);
        if (/:memory:|mode=memory/.test(this._name!)) {
            throw new DrivineError(
                `SQLite's path '${this._name}' names no file: each pooled connection would open a database of its ` +
                    `own. Give the path of a file.`
            );
        }
        if (this._host) {
            this.logger.warn(`SQLite is a file; the host '${this._host}' set for datasource '${name}' is ignored`);
        }
        if (this._protocol) {
            this.logger.warn(
                `SQLite is a file; the protocol '${this._protocol}' set for datasource '${name}' is ignored`
            );
        }
        return new SqliteConnectionProvider(name, this._type, this._name!, {
            graph: this._defaultGraphPath,
            busyTimeoutMillis: this._busyTimeout,
            poolMax: this._poolMax
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
            this.#password,
            this._name,
            this._protocol,
            {
                connectionTimeout: this._connectionTimeout,
                maxConnectionPoolSize: this._poolMax
            }
        );
    }

    /**
     * Memgraph speaks Bolt, so it runs on the Neo4j driver. Auth is off in a default Memgraph, so the credentials are
     * optional.
     */
    private buildMemgraphProvider(name: string): ConnectionProvider {
        if (this._idleTimeout) {
            this.logger.warn(`idleTimeout is not supported by Memgraph`);
        }
        if (!this._port) {
            this._port = 7687;
        }
        if (this._port !== 7687) {
            this.logger.warn(`${this._port} is a non-standard port for Memgraph`);
        }

        return new Neo4jConnectionProvider(
            name,
            this._type,
            this._host,
            this._port,
            this._userName ?? '',
            this.#password ?? '',
            this._name,
            this._protocol,
            {
                connectionTimeout: this._connectionTimeout,
                maxConnectionPoolSize: this._poolMax
            }
        );
    }

    private buildNeptuneProvider(name: string): ConnectionProvider {
        if (this._userName) {
            this.logger.warn(`userName is not supported by Neptune`);
        }
        if (this.#password) {
            this.logger.warn(`password is not supported by Neptune`);
        }
        if (this._idleTimeout) {
            this.logger.warn(`idleTimeout is not supported by Neptune`);
        }
        if (!this._port) {
            this._port = 8182;
        }
        if (this._port !== 8182) {
            this.logger.warn(`${this._port} is a non-standard port for Neptune`);
        }

        return new NeptuneConnectionProvider(name, this._type, this._host, this._port, this._protocol, {
            connectionTimeout: this._connectionTimeout
        });
    }

    private buildFalkorDbProvider(name: string): ConnectionProvider {
        if (this._idleTimeout) {
            this.logger.warn(`idleTimeout is not supported by FalkorDB`);
        }
        if (!this._port) {
            this._port = 6379;
        }
        if (this._port !== 6379) {
            this.logger.warn(`${this._port} is a non-standard port for FalkorDB`);
        }

        return new FalkorDbConnectionProvider(
            name,
            this._type,
            this._name ?? 'graph',
            {
                host: this._host,
                port: this._port,
                userName: this._userName,
                password: this.#password,
                connectionTimeout: this._connectionTimeout
            },
            this._transactionMode ?? TransactionMode.WARN
        );
    }
}
