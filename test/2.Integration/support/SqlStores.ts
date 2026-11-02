import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    PersistenceManager,
    PersistenceManagerFactory,
    PostgresGraph,
    QuerySpecification,
    SqliteGraph,
    TransactionContextHolder
} from '@liberation-data/drivine';

/** A SQL store an object manager keeps a graph in: its connection's name in the registry, and its type. */
export interface SqlStore {
    name: 'ORACLE' | 'POSTGRES' | 'SQLITE';
    type: DatabaseType.ORACLE | DatabaseType.POSTGRES | DatabaseType.SQLITE;
}

/**
 * The SQL stores configured in the environment: Postgres when POSTGRES_DATABASE_* configures it, and SQLite when
 * SQLITE_DATABASE_* does, as the tests' own environment does, and Oracle when ORACLE_DATABASE_* does. A suite that runs on each describes them with
 * `describe.each(sqlStores())`.
 */
export function sqlStores(): SqlStore[] {
    return [
        ...(process.env.POSTGRES_DATABASE_TYPE === 'POSTGRES'
            ? [{ name: 'POSTGRES' as const, type: DatabaseType.POSTGRES as const }]
            : []),
        ...(process.env.ORACLE_DATABASE_TYPE === 'ORACLE'
            ? [{ name: 'ORACLE' as const, type: DatabaseType.ORACLE as const }]
            : []),
        ...(process.env.SQLITE_DATABASE_TYPE === 'SQLITE'
            ? [{ name: 'SQLITE' as const, type: DatabaseType.SQLITE as const }]
            : [])
    ];
}

/**
 * The SQL stores that run Cypher, compiling it to their SQL: each of sqlStores but SQLite, whose compiler comes later
 * (liberation-data/drivine#266).
 */
export function cypherSqlStores(): SqlStore[] {
    return sqlStores().filter((it) => it.type !== DatabaseType.SQLITE);
}

/** Whether the store keeps a graph in SQL tables: Oracle, Postgres or SQLite. */
export function isSqlStore(type: DatabaseType): boolean {
    return type === DatabaseType.ORACLE || type === DatabaseType.POSTGRES || type === DatabaseType.SQLITE;
}

/**
 * A non-transactional persistence manager for the store, on `graph` when one is given, by a connection of its own
 * registered as `<store>_<graph>`, else on the store's default graph.
 */
export function sqlPersistenceManager(store: SqlStore, graph?: string): PersistenceManager {
    const name = graph ? `${store.name}_${graph}` : store.name;
    if (graph) {
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv(store.name), defaultGraphPath: graph })
            .register(name);
    } else {
        DatabaseRegistry.buildOrResolveFromEnv(store.name);
    }
    return new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
        name,
        'NON_TRANSACTIONAL'
    );
}

/** A raw `where` over the node row `n`, in the store's SQL: a property as text, or as a number. */
export function rawProperty(store: SqlStore, property: string, as: 'TEXT' | 'NUMBER' = 'TEXT'): string {
    if (store.type === DatabaseType.ORACLE) {
        return `JSON_VALUE(n.props, '$.${property}'${as === 'NUMBER' ? ' RETURNING NUMBER' : ''})`;
    }
    if (store.type === DatabaseType.SQLITE) {
        return as === 'NUMBER' ? `CAST(n.props ->> '$.${property}' AS REAL)` : `(n.props ->> '$.${property}')`;
    }
    return as === 'NUMBER' ? `CAST(n.props ->> '${property}' AS numeric)` : `(n.props ->> '${property}')`;
}

/**
 * The statement that reads the properties of the one node carrying `scope`, as the store holds them: a row of one
 * column, `props`. Oracle's are re-encoded, as the thin driver can't read a document updated in place
 * (oracle/node-oracledb#1796).
 */
export function rawProps(store: SqlStore, scope: string): string {
    if (store.type === DatabaseType.SQLITE) {
        return `/* drivine:json */ SELECT n.props AS "props" FROM drivine_node n WHERE instr(n.labels, '"${scope}"') > 0`;
    }
    return store.type === DatabaseType.ORACLE
        ? `SELECT JSON_TRANSFORM(n.props, KEEP '$') AS "props" FROM drivine_node n WHERE JSON_EXISTS(n.labels, '$?(@ == "${scope}")')`
        : `SELECT n.props AS "props" FROM drivine_node n WHERE n.labels @> '["${scope}"]'`;
}

/**
 * Writes a graph into a SQL store's tables directly, for reads to be tested before writes are: nodes by labels and
 * properties, relationships between nodes found by a key property among those carrying `scope`.
 */
export class SqlSeed {
    constructor(
        private readonly pm: PersistenceManager,
        private readonly store: SqlStore,
        private readonly scope: string,
        private readonly key: string = 'id'
    ) {}

    /**
     * Makes the store where it is not there. The connection makes it on its first statement, on Oracle and Postgres
     * alike; this makes Postgres's again where a suite dropped it after.
     */
    async prepare(): Promise<void> {
        if (this.store.type === DatabaseType.POSTGRES) {
            await this.pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
        if (this.store.type === DatabaseType.SQLITE) {
            await this.pm.execute(new QuerySpecification(new SqliteGraph().ensuring));
        }
    }

    async clear(): Promise<void> {
        // SQLite names a table to delete from as `AS n`, and Oracle only without the AS.
        const table = this.store.type === DatabaseType.SQLITE ? 'drivine_node AS n' : 'drivine_node n';
        await this.pm.execute(new QuerySpecification(`DELETE FROM ${table} WHERE ${this.carries('n')}`));
    }

    async node(labels: string[], props: Record<string, any>, stamp?: string): Promise<void> {
        const text =
            this.store.type === DatabaseType.ORACLE
                ? 'INSERT INTO drivine_node (labels, props, stamp) VALUES (JSON($labels), JSON($props), $stamp)'
                : this.store.type === DatabaseType.SQLITE
                ? 'INSERT INTO drivine_node (labels, props, stamp) VALUES ($labels, $props, $stamp)'
                : 'INSERT INTO drivine_node (labels, props, stamp) VALUES (CAST($labels AS jsonb), CAST($props AS jsonb), ' +
                  'CAST($stamp AS varchar))';
        // Sorted, as each library writes a node's labels on SQLite, where a label is found by its text.
        const labelled = [this.scope, ...labels].sort();
        await this.pm.execute(
            new QuerySpecification(text).bind(
                this.store.type === DatabaseType.ORACLE
                    ? { labels: labelled, props, stamp: stamp ?? null }
                    : { labels: JSON.stringify(labelled), props: JSON.stringify(props), stamp: stamp ?? null }
            )
        );
    }

    async edge(from: string, type: string, to: string, props: Record<string, any> = {}): Promise<void> {
        const oracle = this.store.type === DatabaseType.ORACLE;
        const sqlite = this.store.type === DatabaseType.SQLITE;
        const at = (alias: string): string =>
            oracle
                ? `${this.carries(alias)} AND JSON_VALUE(${alias}.props, '$.${this.key}') = $${alias}`
                : sqlite
                ? `${this.carries(alias)} AND ${alias}.props ->> '$.${this.key}' = $${alias}`
                : `${this.carries(alias)} AND ${alias}.props ->> '${this.key}' = CAST($${alias} AS text)`;
        const values = oracle
            ? '$type, JSON($props)'
            : sqlite
            ? '$type, $props'
            : 'CAST($type AS text), CAST($props AS jsonb)';
        await this.pm.execute(
            new QuerySpecification(
                `INSERT INTO drivine_edge (src, dst, type, props) SELECT a.nid, b.nid, ${values} ` +
                    `FROM drivine_node a, drivine_node b WHERE ${at('a')} AND ${at('b')}`
            ).bind({ a: from, b: to, type, props: oracle ? props : JSON.stringify(props) })
        );
    }

    /** Whether the node row carries the seed's scope label. */
    private carries(alias: string): string {
        if (this.store.type === DatabaseType.SQLITE) {
            return `instr(${alias}.labels, '"${this.scope}"') > 0`;
        }
        return this.store.type === DatabaseType.ORACLE
            ? `JSON_EXISTS(${alias}.labels, '$?(@ == "${this.scope}")')`
            : `${alias}.labels @> '["${this.scope}"]'`;
    }
}
