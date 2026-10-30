import {
    ConnectionPropertiesFromEnv,
    cypherStatement,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { SqlStore, sqlPersistenceManager, sqlStores } from '../support/SqlStores';

jest.setTimeout(120_000);

@NodeFragment({ labels: ['FirstUse'] })
class FirstUse {
    @NodeId() id: string;
    name?: string;
}

/** A graph name of this run's own, so its tables are new. */
const fresh = (tag: string): string => `fc_${tag}_${Date.now().toString(36)}`;

/** The statements that take the graph's tables away, whatever made them. */
function dropping(store: SqlStore, graph: string): string[] {
    if (store.type === DatabaseType.ORACLE) {
        return [
            `DROP PROPERTY GRAPH IF EXISTS ${graph}`,
            `DROP TABLE IF EXISTS ${graph}_edge PURGE`,
            `DROP TABLE IF EXISTS ${graph}_node PURGE`,
            `DROP TABLE IF EXISTS ${graph}_schema PURGE`
        ];
    }
    return [
        `DO $drop$ DECLARE r record; BEGIN
            FOR r IN SELECT oid::regprocedure AS f FROM pg_proc
                WHERE proname IN ('${graph}_find', '${graph}_owns', '${graph}_write') LOOP
                EXECUTE 'DROP FUNCTION ' || r.f || ' CASCADE';
            END LOOP;
        END $drop$`,
        `DROP TABLE IF EXISTS ${graph}_edge, ${graph}_node, ${graph}_schema CASCADE`
    ];
}

/** Whether the graph's node table is there, as the store's catalog says. */
function nodeTableCount(store: SqlStore, graph: string): string {
    return store.type === DatabaseType.ORACLE
        ? `SELECT COUNT(*) FROM user_tables WHERE table_name = '${graph.toUpperCase()}_NODE'`
        : `SELECT COUNT(*) FROM pg_tables WHERE tablename = '${graph.toLowerCase()}_node'`;
}

/**
 * How many of the graph's store objects are there, as the store's catalog says: its node, edge and schema tables, and on
 * Oracle the property graph over them, made last. A whole store has all four, or three on Postgres.
 */
function storeObjectCount(store: SqlStore, graph: string): string {
    const tables = ['node', 'edge', 'schema'];
    return store.type === DatabaseType.ORACLE
        ? `SELECT (SELECT COUNT(*) FROM user_tables WHERE table_name IN (${tables
              .map((it) => `'${graph.toUpperCase()}_${it.toUpperCase()}'`)
              .join(
                  ', '
              )})) + (SELECT COUNT(*) FROM user_property_graphs WHERE graph_name = '${graph.toUpperCase()}') FROM dual`
        : `SELECT COUNT(*) FROM pg_tables WHERE tablename IN (${tables
              .map((it) => `'${graph.toLowerCase()}_${it}'`)
              .join(', ')})`;
}

const merge = async (pm: PersistenceManager, name: string): Promise<void> =>
    pm.execute(new QuerySpecification(cypherStatement('MERGE (:FirstUse {name: $name})')).bind({ name }));

const names = async (pm: PersistenceManager): Promise<string[]> =>
    pm.query<string>(
        new QuerySpecification<string>(cypherStatement('MATCH (p:FirstUse) RETURN p.name ORDER BY p.name'))
    );

/**
 * The graph's tables are made on the connection provider's first connection, on every SQL store, so Cypher sent through a
 * persistence manager alone works on a new store, whichever manager comes first (liberation-data/drivine#343).
 */
describe.each(sqlStores().map((it) => [it.name, it] as const))("a SQL store's first connection (%s)", (_, store) => {
    const registry = DatabaseRegistry.getInstance();
    const graphs: string[] = [];
    /** The connections of the user who may only read, ended before that user is dropped. */
    const readers = ['POSTGRES_FC_RO', 'POSTGRES_FC_RO_NEW'];
    let admin: PersistenceManager;

    /** A non-transactional persistence manager on a connection of its own name, working on `graph`, its pool as large as `poolMax`. */
    const managerOn = (connection: string, graph: string, poolMax?: number): PersistenceManager => {
        registry
            .builder()
            .withProperties({
                ...ConnectionPropertiesFromEnv(store.name),
                defaultGraphPath: graph,
                ...(poolMax ? { poolMax } : {})
            })
            .register(connection);
        return new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance()).get(
            connection,
            'NON_TRANSACTIONAL'
        );
    };
    const graphFor = (tag: string): string => {
        const graph = fresh(tag);
        graphs.push(graph);
        return graph;
    };
    /** Oracle gives a row of one column as its value; Postgres gives the row. */
    const count = async (statement: string): Promise<number> => {
        const row = await admin.getOne<any>(new QuerySpecification(statement));
        return Number(typeof row === 'object' ? Object.values(row)[0] : row);
    };
    const tableCount = async (graph: string): Promise<number> => count(nodeTableCount(store, graph));

    beforeAll(() => {
        admin = sqlPersistenceManager(store);
    });

    afterAll(async () => {
        for (const graph of graphs) {
            for (const statement of dropping(store, graph)) {
                await admin.execute(new QuerySpecification(statement));
            }
        }
        await Promise.all(
            registry.providers
                .filter(
                    (it) =>
                        it.name.startsWith(`${store.name}_FC_`) &&
                        !readers.includes(it.name) &&
                        !it.name.startsWith(`${store.name}_FC_SWARM_`)
                )
                .map(async (it) => it.end())
        );
    });

    it('should make the tables when Cypher is first sent through a persistence manager alone', async () => {
        const graph = graphFor('pm');
        expect(await tableCount(graph)).toEqual(0);
        const pm = managerOn(`${store.name}_FC_PM`, graph);
        await merge(pm, 'Ada');
        await merge(pm, 'Ada');
        expect(await names(pm)).toEqual(['Ada']);
        expect(await tableCount(graph)).toEqual(1);
    });

    it('should make the tables of the graph DATABASE_DEFAULT_GRAPH_PATH names', async () => {
        const graph = graphFor('env');
        const prefix = `${store.name}_FC_ENV`;
        Object.keys(process.env)
            .filter((key) => key.startsWith(`${store.name}_DATABASE_`))
            .forEach((key) => (process.env[`${prefix}${key.slice(store.name.length)}`] = process.env[key]));
        process.env[`${prefix}_DATABASE_DEFAULT_GRAPH_PATH`] = graph;
        DatabaseRegistry.buildOrResolveFromEnv(prefix);
        const pm = new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance()).get(
            prefix,
            'NON_TRANSACTIONAL'
        );
        expect(registry.connectionProvider(prefix)?.graphName).toEqual(graph);
        await merge(pm, 'Grace');
        expect(await names(pm)).toEqual(['Grace']);
        expect(await tableCount(graph)).toEqual(1);
    });

    it('should make the tables once when connections, pools and an object manager first use them together', async () => {
        const graph = graphFor('race');
        const one = managerOn(`${store.name}_FC_RACE_1`, graph);
        const two = managerOn(`${store.name}_FC_RACE_2`, graph);
        const manager = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance())
        ).get(`${store.name}_FC_RACE_1`);
        const written = Array.from({ length: 6 }, (_, i) => `n${i}`);
        await Promise.all([
            ...written.map(async (name, i) => merge(i % 2 === 0 ? one : two, name)),
            manager.save(Object.assign(new FirstUse(), { id: 'om', name: 'om' }))
        ]);
        expect(await names(two)).toEqual([...written, 'om'].sort());
        expect((await manager.load(FirstUse, 'om'))?.name).toEqual('om');
    });

    /**
     * Each pool makes the tables on its first connection while the others' first statements, compiled writes, and the
     * object managers' own making run: on Oracle, DDL over a table that other sessions' writes hold could deadlock on
     * its library cache lock (ORA-04020), and the first use failed (liberation-data/drivine#454).
     */
    it('should make the tables once when many pools and object managers first use them together, round after round', async () => {
        const factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance())
        );
        for (let round = 0; round < 3; round++) {
            const graph = graphFor(`swarm${round}`);
            const pools = Array.from({ length: 6 }, (_, i) => `${store.name}_FC_SWARM_${round}_${i}`);
            const managers = pools.map((it) => managerOn(it, graph, 2));
            const written = Array.from({ length: 24 }, (_, i) => `n${i}`);
            const saved = pools.filter((_, i) => i % 2 === 0).map((it, i) => ({ id: `om${i}`, pool: it }));
            try {
                await Promise.all([
                    ...written.map(async (name, i) => merge(managers[i % managers.length], name)),
                    ...saved.map(async (it) =>
                        factory.get(it.pool).save(Object.assign(new FirstUse(), { id: it.id, name: it.id }))
                    )
                ]);
                expect(await names(managers[0])).toEqual([...written, ...saved.map((it) => it.id)].sort());
                expect(await count(storeObjectCount(store, graph))).toEqual(store.type === DatabaseType.ORACLE ? 4 : 3);
            } finally {
                // Ended each round, failed or not, so the pools don't hold the store's connections from the tests after.
                await Promise.all(pools.map(async (it) => registry.connectionProvider(it)?.end()));
            }
        }
    });

    it('should leave the tables an object manager made first, and read them through a persistence manager', async () => {
        const graph = graphFor('om');
        const pm = managerOn(`${store.name}_FC_OM`, graph);
        const manager = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance())
        ).get(`${store.name}_FC_OM`);
        await manager.save(Object.assign(new FirstUse(), { id: 'first', name: 'Linus' }));
        expect(await names(pm)).toEqual(['Linus']);
    });

    if (store.type === DatabaseType.POSTGRES) {
        describe('a user who may only read', () => {
            const role = `fc_reader_${Date.now().toString(36)}`;
            let graph: string;

            beforeAll(async () => {
                graph = graphFor('ro');
                await merge(managerOn('POSTGRES_FC_RO_OWNER', graph), 'Edsger');
                for (const statement of [
                    `CREATE ROLE ${role} LOGIN PASSWORD 'reader'`,
                    `GRANT SELECT ON ${graph}_node, ${graph}_edge, ${graph}_schema TO ${role}`
                ]) {
                    await admin.execute(new QuerySpecification(statement));
                }
            });

            /** A persistence manager on a connection of the reader's, working on `graph`. */
            const readerOn = (connection: string, on: string): PersistenceManager => {
                registry
                    .builder()
                    .withProperties({
                        ...ConnectionPropertiesFromEnv('POSTGRES'),
                        userName: role,
                        password: 'reader',
                        defaultGraphPath: on,
                        poolMax: 2
                    })
                    .register(connection);
                return new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance()).get(
                    connection,
                    'NON_TRANSACTIONAL'
                );
            };

            afterAll(async () => {
                await Promise.all(readers.map(async (it) => registry.connectionProvider(it)?.end()));
                await admin.execute(new QuerySpecification(`DROP OWNED BY ${role}`));
                await admin.execute(new QuerySpecification(`DROP ROLE IF EXISTS ${role}`));
            });

            it('should connect and read a graph already made', async () => {
                expect(await names(readerOn('POSTGRES_FC_RO', graph))).toEqual(['Edsger']);
            });

            /**
             * The reader may not make the graph's tables: the provider warns once and hands out each connection, so
             * plain SQL runs, and a statement over the tables says they are not there (liberation-data/drivine#468).
             */
            it('should hand out each connection over a graph not made, plain SQL running and the graph not there', async () => {
                const reader = readerOn('POSTGRES_FC_RO_NEW', graphFor('ronew'));
                // More tries than the pool's two connections: one kept back would leave the last waiting.
                for (let i = 0; i < 4; i++) {
                    expect(await reader.getOne<any>(new QuerySpecification('SELECT 1 AS one'))).toMatchObject({
                        one: 1
                    });
                    await expect(names(reader)).rejects.toThrow(/does not exist/);
                }
            });
        });
    }
});
