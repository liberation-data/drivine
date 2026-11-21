import { Client, ClientConfig } from 'pg';
import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    DrivineError,
    EnsureResult,
    GraphObjectManagerFactory,
    PersistenceManagerFactory,
    PostgresConnectionProvider,
    QuerySpecification,
    rangeIndex,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';
import { sqlStores } from '../support/SqlStores';

// Filling a graph of 300,000 nodes, or a million, and building an index over it, three rounds a test.
jest.setTimeout(600_000);

/** Enough nodes that a build takes about a second, so two ensures overlap. */
const NODES = 300_000;
const ROUNDS = 3;

/** What the planner says at INFO where Postgres cancelled an ensure's online build as a deadlock (drivine-cypher-spec#382). */
const DEADLOCKED = "deadlocked with another session's online build on the same table";

/** What an ensure gave, or what it threw. */
type Outcome = EnsureResult<unknown> | Error;

/** What enforces nothing is never reported made: each result is made, matching, a violation, or a failure. */
const reportsMade = (result: Outcome): boolean =>
    !(result instanceof Error) && (result.status === 'CREATED' || result.status === 'ALREADY_MATCHING');

const status = (result: Outcome): string =>
    result instanceof Error ? `${result.name}: ${result.message}` : result.status;

/**
 * A uniqueness constraint's index built online on Postgres (drivine-cypher-spec#382), and two ensures of it at once,
 * each from its own manager and connection pool, as two processes would run them. Whatever each reports, a constraint
 * reported made is enforced, and none is reported made where nothing enforces it. drivine4j's
 * `PostgresConcurrentConstraintEnsureTest`.
 *
 * Every statement over the big tables that isn't an object manager's runs on a client of the suite's own, ended after
 * its tests, and each manager's pool is ended once its graph is done with: a session that ran anything in parallel
 * over them (a sample of the keys that repeat, the build the invalid-index test has refused) keeps a segment of
 * /dev/shm until it disconnects, which in a pool that lasts the run would leave a later HNSW build in the container's
 * 64 MB too little (PostgresIndexBuildSharedMemory).
 */
describe.each(sqlStores().filter((it) => it.type === DatabaseType.POSTGRES))(
    'A uniqueness constraint ensured online on $name',
    (store) => {
        const spec = uniquenessConstraint('Big', 'id');
        let config: ClientConfig;
        let own: Client;
        let factory: GraphObjectManagerFactory;
        /** The pools of the managers made for the graph under test, ended once it is done with. */
        let providers: PostgresConnectionProvider[] = [];
        let made = 0;

        /** Runs each statement on its own, committed as it runs, on the suite's own client. */
        const run = async (...statements: string[]): Promise<void> => {
            for (const statement of statements) {
                await own.query(statement);
            }
        };

        const rows = async (sql: string): Promise<any[]> => (await own.query(sql)).rows;

        /** A manager for the graph `graph`, with a pool of its own, its tables made. */
        const manager = async (graph: string): Promise<StatelessGraphObjectManager> => {
            const provider = new PostgresConnectionProvider(
                `${store.name}_${graph}_${made++}`,
                DatabaseType.POSTGRES,
                { ...config },
                graph
            );
            providers.push(provider);
            DatabaseRegistry.getInstance().register(provider);
            // Its first connection makes the graph's tables.
            await (await provider.connect()).release();
            return factory.get(provider.name);
        };

        const drop = async (graph: string): Promise<void> => {
            // CASCADE: the store's functions return a row of its node table.
            await run(`DROP TABLE IF EXISTS ${graph}_edge, ${graph}_node, ${graph}_schema CASCADE`);
        };

        /** Ends the pools of the graph's managers, and drops its tables. */
        const done = async (graph: string): Promise<void> => {
            await Promise.all(providers.map(async (it) => it.end()));
            providers = [];
            await drop(graph);
        };

        /** A fresh graph of `nodes` nodes labelled Big, each with its own id, and `repeats` more repeating ids 1 to `repeats`. */
        const seeded = async (
            graph: string,
            nodes: number = NODES,
            repeats: number = 0
        ): Promise<StatelessGraphObjectManager> => {
            await drop(graph);
            const gom = await manager(graph);
            await run(
                `INSERT INTO ${graph}_node (labels, props) SELECT '["Big"]'::jsonb, jsonb_build_object('id', g) ` +
                    `FROM generate_series(1, ${nodes}) g`
            );
            if (repeats > 0) {
                await run(
                    `INSERT INTO ${graph}_node (labels, props) SELECT '["Big"]'::jsonb, jsonb_build_object('id', g) ` +
                        `FROM generate_series(1, ${repeats}) g`
                );
            }
            // Without parallel workers: a session that ran a vacuum in parallel keeps a segment of /dev/shm until it
            // disconnects, which leaves a later HNSW build in the container's 64 MB too little.
            await run(`VACUUM (PARALLEL 0, ANALYZE) ${graph}_edge`, `VACUUM (PARALLEL 0, ANALYZE) ${graph}_node`);
            return gom;
        };

        /** Each unique index Drivine names a constraint's on the graph's node table (not its key), by name, and whether it is valid. */
        const uniqueIndexes = async (graph: string): Promise<Record<string, boolean>> =>
            Object.fromEntries(
                (
                    await rows(
                        `SELECT c.relname AS name, i.indisvalid AS valid FROM pg_index i ` +
                            `JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = '${graph}_node'::regclass ` +
                            `AND i.indisunique AND c.relname LIKE '${graph}\\_uq%'`
                    )
                ).map((it) => [it.name, it.valid])
            );

        /** Whether a second node of id 1 is refused. */
        const enforced = async (gom: StatelessGraphObjectManager): Promise<boolean> => {
            const refused = await gom.persistenceManager
                .execute(new QuerySpecification({ text: 'CREATE (:Big {id: 1})', language: 'CYPHER' }))
                .then(
                    () => undefined,
                    (it: unknown) => it
                );
            if (refused === undefined) {
                return false;
            }
            if (
                refused instanceof DrivineError &&
                /duplicate key value violates unique constraint/.test(refused.message)
            ) {
                return true;
            }
            throw refused;
        };

        /** Each ensure, started together, each of its own manager; what each gave, or threw. */
        const together = async (...ensures: (() => Promise<EnsureResult<unknown>>)[]): Promise<Outcome[]> =>
            Promise.all(ensures.map(async (ensure) => ensure().catch((it: Error) => it)));

        /** Two ensures of `spec` at once, each of its own manager over `graph`. */
        const twice = async (graph: string): Promise<Outcome[]> => {
            const managers = [await manager(graph), await manager(graph)];
            return together(...managers.map((it) => async () => it.constraints.ensure(spec)));
        };

        beforeAll(async () => {
            const properties = ConnectionPropertiesFromEnv(store.name);
            config = {
                host: properties.host,
                port: properties.port,
                user: properties.userName,
                password: properties.password,
                database: properties.databaseName
            };
            own = new Client(config);
            await own.connect();
            factory = new GraphObjectManagerFactory(
                new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
            );
        });

        afterAll(async () => {
            await Promise.all(providers.map(async (it) => it.end()));
            await own?.end();
        });

        it("should commit a write to the label while the constraint's index is being built, and the constraint then enforces", async () => {
            const graph = 'cc382_online';
            // As many nodes as the range index's test, so the build outlasts the first write's compile.
            const gom = await seeded(graph, 1_000_000);
            const building = async (): Promise<number> =>
                Number(
                    (
                        await rows(
                            `SELECT count(*) AS n FROM pg_stat_progress_create_index WHERE relid = '${graph}_node'::regclass`
                        )
                    )[0].n
                );
            let settled = false;
            const ensure = gom.constraints.ensure(spec).finally(() => (settled = true));
            try {
                const deadline = Date.now() + 60_000;
                while ((await building()) === 0) {
                    if (settled) {
                        throw new Error(`the build ended before it was seen under way: ${status(await ensure)}`);
                    }
                    if (Date.now() >= deadline) {
                        throw new Error('no build was seen under way');
                    }
                    await new Promise((resolve) => setTimeout(resolve, 5));
                }
                await gom.persistenceManager.execute(
                    new QuerySpecification({ text: 'CREATE (:Big {id: -1})', language: 'CYPHER' })
                );
                const stillBuilding = (await building()) > 0;
                expect((await ensure).status).toEqual('CREATED');
                // The write committed only once the build had ended, where this is false.
                expect(stillBuilding).toBe(true);
                expect(Object.values(await uniqueIndexes(graph))).toEqual([true]);
                expect(await enforced(gom)).toBe(true);
            } finally {
                // Its pool is ended only once the ensure is over, whatever it gave.
                await ensure.catch(() => undefined);
                await done(graph);
            }
        });

        it('should end two ensures at once over data that holds each id once with one valid index that enforces', async () => {
            for (let round = 0; round < ROUNDS; round++) {
                const graph = `cc382_both${round}`;
                const gom = await seeded(graph);
                try {
                    const results = await twice(graph);
                    expect([round, results.map(status), results.every(reportsMade)]).toEqual([
                        round,
                        results.map(status),
                        true
                    ]);
                    expect(results.some((it) => !(it instanceof Error) && it.status === 'CREATED')).toBe(true);
                    expect([round, Object.values(await uniqueIndexes(graph))]).toEqual([round, [true]]);
                    expect([round, await enforced(gom)]).toEqual([round, true]);
                } finally {
                    await done(graph);
                }
            }
        });

        it('should report neither of two ensures at once made over data that repeats an id, and leave no index', async () => {
            for (let round = 0; round < ROUNDS; round++) {
                const graph = `cc382_dup${round}`;
                const gom = await seeded(graph, NODES, 3);
                try {
                    const results = await twice(graph);
                    expect([round, results.map(status), results.some(reportsMade)]).toEqual([
                        round,
                        results.map(status),
                        false
                    ]);
                    expect(results.some((it) => !(it instanceof Error) && it.status === 'VIOLATION')).toBe(true);
                    expect([round, await uniqueIndexes(graph)]).toEqual([round, {}]);
                    // A second id 1 is taken, with no constraint made.
                    expect([round, await enforced(gom)]).toEqual([round, false]);
                } finally {
                    await done(graph);
                }
            }
        });

        it('should end two ensures at once over an index left invalid with one valid index that enforces', async () => {
            // The window #382 closes: an earlier build of the constraint's index was refused, which left it invalid
            // under its name, recorded; the data is then put right, and two processes ensure the constraint at once.
            for (let round = 0; round < ROUNDS; round++) {
                const graph = `cc382_invalid${round}`;
                const gom = await seeded(graph);
                try {
                    expect((await gom.constraints.ensure(spec)).status).toEqual('CREATED');
                    const [[name, valid]] = Object.entries(await uniqueIndexes(graph));
                    expect(valid).toBe(true);
                    const [{ definition }]: any[] = await rows(
                        `SELECT pg_get_indexdef('${name}'::regclass) AS definition`
                    );
                    await run(`DROP INDEX ${name}`);
                    await run(
                        `INSERT INTO ${graph}_node (labels, props) VALUES ('["Big"]'::jsonb, '{"id": 7}'::jsonb)`
                    );
                    await expect(
                        run(String(definition).replace('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX CONCURRENTLY '))
                    ).rejects.toThrow(/could not create unique index/);
                    // The refused build left it invalid.
                    expect(await uniqueIndexes(graph)).toEqual({ [name]: false });
                    await run(`DELETE FROM ${graph}_node WHERE nid = (SELECT max(nid) FROM ${graph}_node)`);

                    const results = await twice(graph);
                    expect([round, results.map(status), results.every(reportsMade)]).toEqual([
                        round,
                        results.map(status),
                        true
                    ]);
                    expect([round, await uniqueIndexes(graph)]).toEqual([round, { [name]: true }]);
                    expect([round, await enforced(gom)]).toEqual([round, true]);
                } finally {
                    await done(graph);
                }
            }
        });

        it('should take over at once a claim of the turn older than 60 seconds, left by a session that ended', async () => {
            // A session that claimed its turn to build the constraint and ended without giving it up
            // (drivine-cypher-spec#382): with no online build under way, the next ensure takes the claim over, rather
            // than wait 60 seconds for it.
            const graph = 'cc382_stale';
            const gom = await seeded(graph, 1_000);
            try {
                await run(
                    `INSERT INTO ${graph}_schema (kind, label, properties, details) VALUES ('CLAIM:UNIQUENESS_CONSTRAINT', ` +
                        `'Big', '["id"]', jsonb_build_object('at', (clock_timestamp() - interval '2 minutes')::text))`
                );
                const started = Date.now();
                expect((await gom.constraints.ensure(spec)).status).toEqual('CREATED');
                const seconds = (Date.now() - started) / 1000;
                // The stale claim was taken over, not waited out.
                expect([seconds < 30, seconds]).toEqual([true, seconds]);
                expect(Object.values(await uniqueIndexes(graph))).toEqual([true]);
                expect(await enforced(gom)).toBe(true);
                const [{ claims }]: any[] = await rows(
                    `SELECT count(*) AS claims FROM ${graph}_schema WHERE kind LIKE 'CLAIM:%'`
                );
                // The claim taken over was given up once done.
                expect(Number(claims)).toEqual(0);
            } finally {
                await done(graph);
            }
        });

        it('should make both of two ensures at once of different items on one table', async () => {
            // A constraint and a range index on the same node table, built online at once: Postgres cancels one as a
            // deadlock (40P01), which the planner reads, as the build is run once, and it waits for the other's build to
            // end and ensures again, said at INFO. The line is read off the logger, whatever level it prints at.
            const info = jest.spyOn(DrivineLogger.prototype, 'log');
            const deadlocked: boolean[] = [];
            try {
                for (let round = 0; round < ROUNDS; round++) {
                    const graph = `cc382_apart${round}`;
                    const gom = await seeded(graph);
                    try {
                        await run(`UPDATE ${graph}_node SET props = props || jsonb_build_object('n', props -> 'id')`);
                        const [first, second] = [await manager(graph), await manager(graph)];
                        info.mockClear();
                        const results = await together(
                            async () => first.constraints.ensure(spec),
                            async () => second.indexes.ensure(rangeIndex('Big', 'n'))
                        );
                        deadlocked.push(info.mock.calls.some(([message]) => String(message).includes(DEADLOCKED)));
                        expect([round, results.map(status)]).toEqual([round, ['CREATED', 'CREATED']]);
                        expect([round, Object.values(await uniqueIndexes(graph))]).toEqual([round, [true]]);
                        expect([round, await enforced(gom)]).toEqual([round, true]);
                    } finally {
                        await done(graph);
                    }
                }
            } finally {
                info.mockRestore();
            }
            // A round that didn't deadlock proves nothing of the planner's handling: at least one must have.
            if (!deadlocked.includes(true)) {
                throw new Error(
                    `no round's builds deadlocked, so the planner's handling of one went untested: ${JSON.stringify(
                        deadlocked
                    )}`
                );
            }
        });
    }
);
