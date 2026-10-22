import {
    DatabaseRegistry,
    DatabaseType,
    PersistenceManager,
    PersistenceManagerFactory,
    PostgresGraph,
    QuerySpecification,
    TransactionContextHolder
} from '@liberation-data/drivine';

/** A SQL store an object manager keeps a graph in: its connection's name in the registry, and its type. */
export interface SqlStore {
    name: 'ORACLE' | 'POSTGRES';
    type: DatabaseType.ORACLE | DatabaseType.POSTGRES;
}

/**
 * The SQL stores configured in the environment: Postgres when POSTGRES_DATABASE_* configures it, as the tests' own
 * environment does, and Oracle when ORACLE_DATABASE_* does. A suite that runs on each describes them with
 * `describe.each(sqlStores())`.
 */
export function sqlStores(): SqlStore[] {
    return [
        ...(process.env.POSTGRES_DATABASE_TYPE === 'POSTGRES'
            ? [{ name: 'POSTGRES' as const, type: DatabaseType.POSTGRES as const }]
            : []),
        ...(process.env.ORACLE_DATABASE_TYPE === 'ORACLE'
            ? [{ name: 'ORACLE' as const, type: DatabaseType.ORACLE as const }]
            : [])
    ];
}

/** A non-transactional persistence manager for the store. */
export function sqlPersistenceManager(store: SqlStore): PersistenceManager {
    DatabaseRegistry.buildOrResolveFromEnv(store.name);
    return new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
        store.name,
        'NON_TRANSACTIONAL'
    );
}

/** A raw `where` over the node row `n`, in the store's SQL: a property as text, or as a number. */
export function rawProperty(store: SqlStore, property: string, as: 'TEXT' | 'NUMBER' = 'TEXT'): string {
    if (store.type === DatabaseType.ORACLE) {
        return `JSON_VALUE(n.props, '$.${property}'${as === 'NUMBER' ? ' RETURNING NUMBER' : ''})`;
    }
    return as === 'NUMBER' ? `CAST(n.props ->> '${property}' AS numeric)` : `(n.props ->> '${property}')`;
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

    /** Makes the store where it is not there: Oracle's connection makes it; on Postgres, an object manager does. */
    async prepare(): Promise<void> {
        if (this.store.type === DatabaseType.POSTGRES) {
            await this.pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
    }

    async clear(): Promise<void> {
        await this.pm.execute(new QuerySpecification(`DELETE FROM drivine_node n WHERE ${this.carries('n')}`));
    }

    async node(labels: string[], props: Record<string, any>, stamp?: string): Promise<void> {
        const text =
            this.store.type === DatabaseType.ORACLE
                ? 'INSERT INTO drivine_node (labels, props, stamp) VALUES (JSON($labels), JSON($props), $stamp)'
                : 'INSERT INTO drivine_node (labels, props, stamp) VALUES (CAST($labels AS jsonb), CAST($props AS jsonb), ' +
                  'CAST($stamp AS varchar))';
        const labelled = [this.scope, ...labels];
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
        const at = (alias: string): string =>
            oracle
                ? `${this.carries(alias)} AND JSON_VALUE(${alias}.props, '$.${this.key}') = $${alias}`
                : `${this.carries(alias)} AND ${alias}.props ->> '${this.key}' = CAST($${alias} AS text)`;
        const values = oracle ? '$type, JSON($props)' : 'CAST($type AS text), CAST($props AS jsonb)';
        await this.pm.execute(
            new QuerySpecification(
                `INSERT INTO drivine_edge (src, dst, type, props) SELECT a.nid, b.nid, ${values} ` +
                    `FROM drivine_node a, drivine_node b WHERE ${at('a')} AND ${at('b')}`
            ).bind({ a: from, b: to, type, props: oracle ? props : JSON.stringify(props) })
        );
    }

    /** Whether the node row carries the seed's scope label. */
    private carries(alias: string): string {
        return this.store.type === DatabaseType.ORACLE
            ? `JSON_EXISTS(${alias}.labels, '$?(@ == "${this.scope}")')`
            : `${alias}.labels @> '["${this.scope}"]'`;
    }
}
