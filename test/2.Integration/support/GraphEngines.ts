import {
    DatabaseRegistry,
    DatabaseType,
    PersistenceManager,
    PersistenceManagerFactory,
    TransactionContextHolder
} from '@liberation-data/drivine';

export interface GraphEngine {
    /** The connection's name in the registry. */
    name: string;
    type: DatabaseType;
}

const CANDIDATES: { name: string; prefix: string }[] = [
    { name: 'default', prefix: '' },
    { name: 'MEMGRAPH', prefix: 'MEMGRAPH_' },
    { name: 'FALKORDB', prefix: 'FALKORDB_' }
];

const GRAPH_TYPES = [DatabaseType.NEO4J, DatabaseType.MEMGRAPH, DatabaseType.FALKORDB];

/**
 * The graph engines configured in the environment: the default connection, MEMGRAPH_* and FALKORDB_*. A test that
 * runs on each describes them with `describe.each(graphEngines())`.
 */
export function graphEngines(): GraphEngine[] {
    const engines = CANDIDATES.filter((it) => GRAPH_TYPES.includes(process.env[`${it.prefix}DATABASE_TYPE`] as DatabaseType))
        .map((it) => ({ name: it.name, type: process.env[`${it.prefix}DATABASE_TYPE`] as DatabaseType }));
    if (engines.length === 0) {
        throw new Error('No graph engine is configured. Set DATABASE_*, MEMGRAPH_DATABASE_* or FALKORDB_DATABASE_*.');
    }
    return engines;
}

/**
 * A non-transactional persistence manager for the engine, outside any Nest module.
 */
export function persistenceManagerFor(engine: GraphEngine): PersistenceManager {
    DatabaseRegistry.buildOrResolveFromEnv(engine.name === 'default' ? undefined : engine.name);
    return new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
        engine.name,
        'NON_TRANSACTIONAL'
    );
}

export async function closeGraphEngines(): Promise<void> {
    await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
    DatabaseRegistry.tearDown();
}
