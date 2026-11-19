import { judgeLayout, runOn } from '@/backend/sql/StoreLayout';
import { DatabaseType } from '@/connection/DatabaseType';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { Connection } from '@/connection/Connection';
import { PostgresConnection } from '@/connection/postgres/PostgresConnection';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { DEFAULT_GRAPH } from '@/backend/sql/SqlGraph';
import { FirstConnection } from '@/connection/FirstConnection';
import { ddlDeadlocked, whenNotContended } from '@/manager/Contention';
import { QuerySpecification } from '@/query/QuerySpecification';
import { INSPECT, maskedProperties, printable } from '@/connection/Masking';

/** Connections to Postgres, from a pool of its own, through `pg`. */
export class PostgresConnectionProvider implements ConnectionProvider {
    /** The pool's settings, a copy whose password is printed masked (#730). */
    readonly connectionProperties: PoolConfig;

    private readonly pool: Pool;
    private readonly firstConnection = new FirstConnection(
        () => `graph '${this.graphName}' on ${this.type} database '${this.name}'`
    );

    /**
     * @param graph the graph this store works on: `drivine` unless named. Its tables are made on first connection, when
     * absent, whether a persistence manager or an object manager asks for it.
     */
    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        connectionProperties: PoolConfig,
        private readonly graph?: string
    ) {
        this.connectionProperties = maskedProperties({ ...connectionProperties });
        this.pool = new Pool({ ...connectionProperties });
        // Refuses a name that can't name the graph's tables now, rather than at the first statement.
        new PostgresGraph(this.graphName);
    }

    /** The graph this store works on, whose tables are made on first connection. */
    get graphName(): string {
        return this.graph ?? DEFAULT_GRAPH;
    }

    /**
     * A connection, the graph's tables made first if this is the provider's first: see {@link FirstConnection}. The
     * block runs on the connection outside a transaction, so it is applied whole or not at all, and is the same one
     * the object manager runs (`PostgresGraph.ensuring`). One turned away by a deadlock with other sessions' writes
     * (40P01), as a session that waited for another's making may be when it then runs the block's statements over
     * tables in use, is run again after a pause, and finds the store made (see {@link ddlDeadlocked}).
     */
    async connect(): Promise<Connection> {
        const client = await this.firstConnection.ensured(
            await this.pool.connect(),
            async (it) => {
                const graph = new PostgresGraph(this.graphName);
                await judgeLayout(
                    'postgres',
                    graph.name,
                    graph.tablesMade,
                    runOn(new PostgresConnection(it, new PostgresResultMapper(), graph.name))
                );
                return whenNotContended(async () => it.query(graph.ensuring), ddlDeadlocked);
            },
            (it, failure) => it.release(failure)
        );
        return this.connection(client);
    }

    /**
     * A connection that neither makes the graph's tables nor judges its store layout, as {@link connect} does first: what a
     * store layout migration runs on, as the graph it migrates is one {@link connect} refuses (see StoreLayoutMigration).
     */
    async connectUnjudged(): Promise<Connection> {
        return this.connection(await this.pool.connect());
    }

    /** Makes the graph's tables on `connection` as a first connection makes them, without the layout's verdict. */
    async prepareUnjudged(connection: Connection): Promise<void> {
        const graph = new PostgresGraph(this.graphName);
        await whenNotContended(async () => connection.query(new QuerySpecification(graph.ensuring)), ddlDeadlocked);
    }

    async end(): Promise<void> {
        await this.pool.end();
    }

    /** The provider as it is printed: its settings, the password masked and its client left out (#730). */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            type: this.type,
            graphName: this.graphName,
            ...printable({ ...this.connectionProperties })
        };
    }

    [INSPECT](): Record<string, unknown> {
        return this.toJSON();
    }

    /** `client` as a connection, its session's id read first where it has none; handed back to the pool where that fails. */
    private async connection(client: PoolClient): Promise<Connection> {
        if (!Object.prototype.hasOwnProperty.call(client, 'sessionId')) {
            try {
                await this.setSessionId(client);
            } catch (e) {
                client.release(e as Error);
                throw e;
            }
        }
        return new PostgresConnection(client, new PostgresResultMapper(), this.graphName);
    }

    private async setSessionId(client: PoolClient): Promise<void> {
        const statement = `
            select format('%s.%s', to_hex(extract(epoch from backend_start)::int), to_hex(pid)) as sid
            from pg_stat_activity
            where pid = pg_backend_pid()`;
        const result = await client.query(statement);
        Object.assign(client, { sessionId: result.rows[0].sid });
    }
}
