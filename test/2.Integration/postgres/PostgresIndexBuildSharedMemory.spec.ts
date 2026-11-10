import { Client } from 'pg';
import {
    Connection,
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    PersistenceManagerFactory,
    PostgresConnectionProvider,
    rangeIndex,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    vectorIndex
} from '@liberation-data/drivine';
import { sqlStores } from '../support/SqlStores';

// Filling the table and building thirteen indexes over it take a while.
jest.setTimeout(300_000);

const GRAPH = 'shm641';
const LABEL = 'Chunk';
const DIMENSIONS = 32;

/** The properties a range index is built over, a session each. */
const RANGE_PROPERTIES = ['a', 'b', 'c', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'];

/** The application name of the pool's sessions, by which they are found in `pg_stat_activity`. */
const POOL = 'drivine-641';

/** SQL for the names of the segments that the backend whose pid is `pid`, an SQL expression, maps, joined by commas. */
const mapped = (pid: string): string =>
    `array_to_string(ARRAY(SELECT DISTINCT m[1] FROM regexp_matches(pg_read_file('/proc/' || ${pid} || '/maps'), ` +
    `'PostgreSQL\\.[0-9]+', 'g') m), ',')`;

const SEGMENTS = "FROM pg_ls_dir('/dev/shm') f WHERE f LIKE 'PostgreSQL.%'";

/**
 * A Postgres index build leaves no pooled session holding shared memory (#641, liberation-data/drivine4j#626).
 * drivine4j's `PostgresIndexBuildSharedMemoryTest`.
 *
 * A backend that has run anything in parallel, as a `CREATE INDEX` over a node table past `min_parallel_table_scan_size`
 * (8 MB) does, keeps a dynamic shared memory segment, a `/dev/shm/PostgreSQL.<n>` file, for as long as it lives, and a
 * pool keeps it alive. An HNSW build over such a table asks for nearly all of `maintenance_work_mem` (64 MB) as one
 * segment, so in the test container's 64 MB `/dev/shm`, Docker's default, it failed once pooled sessions held theirs.
 *
 * The graph's node table is filled past 8 MB once, with rows small enough to stay out of TOAST, where a row's size
 * would not count toward the table's. A session holds a segment where `/proc/<pid>/maps` of its backend maps one that
 * Postgres's own are not, which every backend maps: the container's user is a superuser, which may read it with
 * `pg_read_file`. The sessions are watched from a client of no pool, which runs nothing in parallel. A local instance
 * whose segments are not files in `/dev/shm`, or whose user may not read them or `/proc`, skips the test.
 */
describe.each(sqlStores().filter((it) => it.type === DatabaseType.POSTGRES))('An index build on $name', (store) => {
    let watcher: Client;
    let provider: PostgresConnectionProvider;
    let gom: StatelessGraphObjectManager;
    let readable = false;
    /** The segments in `/dev/shm` before the test: Postgres's own, which every backend maps. */
    let common: Set<string>;

    const watch = async (sql: string): Promise<any[]> => (await watcher.query(sql)).rows;

    /** The segments named, as {@link mapped} gives them, that are not Postgres's own. */
    const own = (names: string): string[] => names.split(',').filter((it) => it && !common.has(it));

    /** The segments of its own that each backend of the pool's sessions maps, by its pid. */
    const pooledSessions = async (): Promise<Record<number, string[]>> =>
        Object.fromEntries(
            (
                await watch(
                    `SELECT pid, ${mapped('pid')} AS segments FROM pg_stat_activity WHERE application_name = '${POOL}'`
                )
            ).map((it) => [it.pid, own(it.segments)])
        );

    /** The dynamic shared memory segments in `/dev/shm`, by name, with their sizes. */
    const segments = async (): Promise<Record<string, number>> =>
        Object.fromEntries(
            (await watch(`SELECT f, (pg_stat_file('/dev/shm/' || f, true)).size AS size ${SEGMENTS}`)).map((it) => [
                it.f,
                Number(it.size)
            ])
        );

    /**
     * Waits, up to ten seconds, for `done`: a session closed out of its pool ends a moment after, and its backend
     * after it. Fails with `state` where it is not done by then.
     */
    const eventually = async (state: () => Promise<string>, done: () => Promise<boolean>): Promise<void> => {
        const until = Date.now() + 10_000;
        while (!(await done())) {
            if (Date.now() > until) {
                throw new Error(await state());
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    };

    const drop = async (): Promise<void> => {
        await watch(`DROP TABLE IF EXISTS ${GRAPH}_edge, ${GRAPH}_node, ${GRAPH}_schema CASCADE`);
    };

    beforeAll(async () => {
        const properties = ConnectionPropertiesFromEnv(store.name);
        const config = {
            host: properties.host,
            port: properties.port,
            user: properties.userName,
            password: properties.password,
            database: properties.databaseName
        };
        watcher = new Client(config);
        await watcher.connect();
        try {
            const [check] = await watch(
                `SELECT current_setting('dynamic_shared_memory_type') = 'posix' AND ` +
                    `${mapped('pg_backend_pid()')} IS NOT NULL AS readable`
            );
            readable = check.readable && (await watch(`SELECT f ${SEGMENTS}`)).length > 0;
        } catch {
            readable = false;
        }
        if (!readable) {
            return;
        }
        await drop();
        common = new Set((await watch(`SELECT f ${SEGMENTS}`)).map((it) => it.f));
        // A pool of sixteen sessions, each kept while idle, as a busy application's pool keeps them: the builder's
        // pool of ten closes one idle for half a second, which would hide the segments it holds.
        provider = new PostgresConnectionProvider(
            `${store.name}_${GRAPH}`,
            DatabaseType.POSTGRES,
            { ...config, max: 16, idleTimeoutMillis: 600_000, application_name: POOL },
            GRAPH
        );
        DatabaseRegistry.getInstance().register(provider);
        gom = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        ).get(provider.name);
        // Makes the graph's tables.
        await (await provider.connect()).release();
        // Some 700 bytes a row, under the 2 KB past which a row's props would go to TOAST: 20,000 of them are past
        // 10 MB.
        await watch(`
                INSERT INTO ${GRAPH}_node (labels, props)
                SELECT '["${LABEL}"]'::jsonb, jsonb_build_object(
                    'a', i, 'b', 'b' || i, 'c', i % 100, 'd', i % 7, 'e', 'e' || i, 'f', i % 3, 'g', i % 5, 'h', i % 11,
                    'i', i % 13, 'j', i % 17, 'k', i % 19, 'l', i % 23, 'm', i % 29, 'n', i % 31, 'pad', repeat('p', 100),
                    'embedding', (SELECT jsonb_agg(round(random()::numeric, 6)) FROM generate_series(1, ${DIMENSIONS})
                        WHERE i > 0))
                FROM generate_series(1, 20000) i`);
        const [table]: any[] = await watch(`SELECT pg_relation_size('${GRAPH}_node') AS size`);
        const size = Number(table.size);
        if (size <= 10 * 1024 * 1024) {
            throw new Error(`The node table is ${size} bytes: a build over it would not be parallel.`);
        }
    });

    afterAll(async () => {
        await provider?.end();
        if (readable) {
            await drop();
        }
        await watcher?.end();
    });

    /**
     * Each session that builds a range index in parallel keeps a segment of about 192 KB, the area its parallel
     * queries share, as long as it lives. The HNSW build needs 63,999,616 bytes and Postgres's own segments about
     * 1 MB, which leaves room in 64 MB for ten: twelve sessions that each built one, kept by their pool, were enough
     * that it failed, `could not resize shared memory segment ... No space left on device`.
     */
    it('should build an HNSW index after range indexes built in parallel, and leave no session of the pool holding shared memory', async () => {
        if (!readable) {
            console.warn(
                'Skipped: the server keeps no segments in /dev/shm, or its user may not read them and ' +
                    '/proc/<pid>/maps, as a superuser on Linux may.'
            );
            return;
        }
        const before = await segments();
        // A connection held out of the pool while each range index builds, as an application's other requests
        // hold theirs, so each build is on a session of its own: the pool hands out the session given back last.
        const held: Connection[] = [];
        try {
            for (const property of RANGE_PROPERTIES) {
                held.push(await provider.connect());
                expect((await gom.indexes.ensure(rangeIndex(LABEL, property))).status).toEqual('CREATED');
            }
        } finally {
            for (const connection of held) {
                await connection.release();
            }
        }

        // The largest segment seen while the HNSW index builds: one past 32 MB is the build's own, so it ran in
        // parallel.
        let largest = 0;
        let building = true;
        const watching = (async () => {
            while (building) {
                const [row]: any[] = await watch(`SELECT max((pg_stat_file('/dev/shm/' || f, true)).size) ${SEGMENTS}`);
                largest = Math.max(largest, Number(row.max ?? 0));
            }
        })();
        const vector = vectorIndex(LABEL, 'embedding', DIMENSIONS);
        try {
            expect((await gom.indexes.ensure(vector)).status).toEqual('CREATED');
        } finally {
            building = false;
            await watching;
        }
        expect((await gom.indexes.list('VECTOR')).filter((it) => it.label === LABEL)).toHaveLength(1);
        expect([largest > 32 * 1024 * 1024, largest]).toEqual([true, largest]);

        await eventually(
            async () =>
                `pooled sessions holding a segment: ${JSON.stringify(
                    Object.fromEntries(Object.entries(await pooledSessions()).filter(([, it]) => it.length))
                )}; segments ${JSON.stringify(await segments())}, before ${JSON.stringify(before)}`,
            async () => Object.values(await pooledSessions()).every((it) => it.length === 0)
        );
        await eventually(
            async () => `segments ${JSON.stringify(await segments())}, before ${JSON.stringify(before)}`,
            async () => Object.keys(await segments()).every((it) => it in before)
        );
    });
});
