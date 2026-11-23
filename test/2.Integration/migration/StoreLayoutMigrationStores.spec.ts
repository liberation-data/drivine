import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as oracledb from 'oracledb';
import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    backendFor,
    ModelRegistry
} from '@liberation-data/drivine';
import { StoreLayoutError } from '@/backend/sql/StoreLayout';
import { Connection } from '@/connection/Connection';
import { Declaration, MigratableProvider, MigrationReport, StoreLayoutMigration } from '@liberation-data/drivine';
import { rawProperty, sqlStores } from '../support/SqlStores';

// A migration on Oracle makes and drops its objects one DDL at a time, and the graph 5.0.0 writes is made the same way.
jest.setTimeout(300_000);

/**
 * A graph Drivine for TypeScript 5.0.0 wrote, in store layout 1, into the tests' own Postgres or Oracle, migrated to
 * layout 2 by the shared module's migrator as StoreLayoutMigration runs it on the store (drivine-cypher-spec#256): what
 * StoreLayoutMigration.spec shows on a SQLite file, shown on a server. The graph is written by 5.0.0 itself
 * (`scripts/migration-fixture-5.0.0`, installed there before it runs), so it is the layout 1 a release wrote.
 *
 * - A dry run writes nothing.
 * - A run stopped by two spellings of one moment under a unique key is corrected with SQL and resumed, and the graph it
 *   leaves is the graph this version writes from the same statements: the same rows, stamp, marker and, once the
 *   application has made its schema, indexes. The internal ids, and the count store the migration leaves unseeded
 *   (drivine-cypher-spec#349), are the differences, and the only ones.
 * - A run stopped by a failed batch, or by its session killed while it writes, is resumed to the end, each row
 *   rewritten once.
 */
const STORES = sqlStores()
    .map((it) => it.name)
    .filter((it): it is 'POSTGRES' | 'ORACLE' => it !== 'SQLITE');

const FIXTURE = path.join(__dirname, '..', '..', '..', 'scripts', 'migration-fixture-5.0.0');

const declarations: Declaration[] = [
    { label: 'Person', property: 'born', kind: 'date' },
    { label: 'KNOWS', property: 'since', kind: 'date' },
    { label: 'Event', property: 'at', kind: 'datetime' },
    // Layout 1 kept 2.0 as a whole number on Oracle: declared a float, it is the float this version writes.
    { label: 'Person', property: 'height', kind: 'float' }
];

/** The constraints the fixture makes, as 5.0.0 made them: in Cypher, each recorded in the graph's schema marker. */
const CONSTRAINTS = [
    'CREATE CONSTRAINT person_name IF NOT EXISTS FOR (n:Person) REQUIRE n.name IS UNIQUE',
    'CREATE CONSTRAINT event_at IF NOT EXISTS FOR (n:Event) REQUIRE n.at IS UNIQUE'
];

/** The statements of the fixture, but the second spelling of the Event's moment, in this version's Cypher. */
const WRITTEN = [
    "CREATE (:Person {name: 'Ada', born: date('1815-12-10'), height: 1.65, visits: 3})",
    "CREATE (:Person {name: 'Charles', born: date('1791-12-26'), height: 2.0})",
    "CREATE (:Person {name: 'Mary', nick: '2024-03-15'})",
    "CREATE (a:Person {name: 'Bob'})-[:KNOWS {since: date('2020-01-01')}]->(b:Person {name: 'Cy'})",
    "CREATE (:Robot {`$t`: 1, `$x`: 'y', name: 'R2'})",
    "CREATE (:Event {at: datetime('2024-03-15T10:30:00.5Z')})"
];

/** Installs 5.0.0 beside its writer, once, from the folder's lock file. */
function installFixture(): void {
    if (!fs.existsSync(path.join(FIXTURE, 'node_modules', '@liberation-data', 'drivine'))) {
        execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: FIXTURE, stdio: 'inherit' });
    }
}

// Jest refuses an each of no rows: with no Postgres or Oracle configured, the suite is skipped.
(STORES.length > 0 ? describe.each(STORES) : describe.skip.each(['POSTGRES' as const]))(
    'a store layout migration of a graph 5.0.0 wrote, on %s',
    (store) => {
        const oracle = store === 'ORACLE';
        const env = ConnectionPropertiesFromEnv(store);
        // The port each driver takes when the environment names none, given to the fixture and the driver's own connections.
        const port = env.port ?? (oracle ? 1521 : 5432);
        const registered: string[] = [];

        beforeAll(() => installFixture());
        afterAll(async () => {
            await Promise.all(
                registered.map(async (name) => DatabaseRegistry.getInstance().connectionProvider(name)?.end())
            );
            DatabaseRegistry.tearDown();
        });

        /** A graph name of the test's own, unused on a store kept between runs. */
        const graphNamed = (name: string): string => `mig_${name}_${String(process.hrtime.bigint()).slice(-8)}`;

        /** The provider of the graph `graph`, registered under its name. */
        const provider = (graph: string): MigratableProvider & { connect(): Promise<Connection> } => {
            if (!registered.includes(graph)) {
                DatabaseRegistry.getInstance()
                    .builder()
                    .withProperties({ ...env, defaultGraphPath: graph })
                    .register(graph);
                registered.push(graph);
            }
            return DatabaseRegistry.getInstance().connectionProvider(graph) as any;
        };

        const manager = (graph: string): PersistenceManager => {
            provider(graph);
            return new PersistenceManagerFactory(
                DatabaseRegistry.getInstance(),
                TransactionContextHolder.getInstance()
            ).get(graph, 'NON_TRANSACTIONAL');
        };

        const migrate = async (graph: string, options: Record<string, any> = {}): Promise<MigrationReport> =>
            new StoreLayoutMigration(provider(graph)).migrate(options.declarations ?? declarations, {
                unproven: true,
                ...options
            });

        /** Writes the fixture's layout-1 graph `graph` with 5.0.0, in a process of its own. */
        const writeLayout1 = (graph: string): void => {
            execFileSync(
                'node',
                [
                    'fixture.js',
                    store.toLowerCase(),
                    env.host,
                    String(port),
                    env.userName!,
                    env.password!,
                    env.databaseName!,
                    graph
                ],
                { cwd: FIXTURE, stdio: 'pipe' }
            );
        };

        /** A value of a row as text: JSON as its text, bytes as hex. */
        const text = (it: any): string =>
            it === null || it === undefined
                ? ''
                : it instanceof Date
                ? it.toISOString()
                : Buffer.isBuffer(it)
                ? it.toString('hex')
                : typeof it === 'object'
                ? JSON.stringify(it)
                : String(it);

        /**
         * The rows of `sql`, run on a connection that neither judges the graph nor makes its tables, as texts. On Oracle, on
         * the driver's own connection: Drivine's gives a row of one column as its value, and the SQL here is the store's own.
         */
        const texts = async (graph: string, sql: string): Promise<string[]> => {
            if (oracle) {
                const own = await oracledb.getConnection({
                    user: env.userName,
                    password: env.password,
                    connectString: `${env.host}:${port}/${env.databaseName}`
                });
                try {
                    const result = await own.execute<any[]>(sql, [], {
                        outFormat: oracledb.OUT_FORMAT_ARRAY,
                        fetchTypeHandler: (meta) =>
                            meta.dbType === oracledb.DB_TYPE_CLOB ? { type: oracledb.STRING } : undefined,
                        autoCommit: true
                    });
                    return (result.rows ?? []).map((row) => row.map(text).join('|'));
                } finally {
                    await own.close();
                }
            }
            const connection = await provider(graph).connectUnjudged();
            try {
                const rows = await connection.query(new QuerySpecification(sql));
                return rows.map((row) => Object.values(row).map(text).join('|'));
            } finally {
                await connection.release();
            }
        };
        const execute = async (graph: string, sql: string): Promise<void> => {
            await texts(graph, sql);
        };

        const json = (column: string): string =>
            oracle ? `JSON_SERIALIZE(${column} RETURNING CLOB EXTENDED)` : `${column}::text`;
        const tables = (graph: string): string =>
            oracle
                ? `SELECT table_name AS "t" FROM user_tables WHERE table_name LIKE UPPER('${graph}\\_%') ESCAPE '\\'`
                : `SELECT table_name AS "t" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name LIKE '${graph}\\_%'`;
        // On Oracle: the indexes Oracle names itself are named apart in each graph, and an index built over rows is written
        // COMPUTE STATISTICS, one built on an empty table not.
        const indexes = (graph: string): string =>
            oracle
                ? `SELECT index_name AS "n", REPLACE(DBMS_METADATA.GET_DDL('INDEX', index_name), ' COMPUTE STATISTICS') AS "d" FROM user_indexes ` +
                  `WHERE table_name LIKE UPPER('${graph}\\_%') ESCAPE '\\' AND index_name NOT LIKE 'SYS\\_%' ESCAPE '\\'`
                : `SELECT indexname AS "n", indexdef AS "d" FROM pg_indexes WHERE schemaname = current_schema() AND tablename LIKE '${graph}\\_%'`;
        const propertyIs = (property: string, text: string): string =>
            `${rawProperty({ name: store, type: DatabaseType[store] }, property)} = '${text}'`;

        /** Every row of the table `table`, as texts. On Oracle a JSON column is read as its text, as the driver reads none. */
        const rowsOf = async (graph: string, table: string): Promise<string[]> => {
            if (!oracle) {
                return texts(graph, `SELECT * FROM ${table}`);
            }
            const columns = (
                await texts(
                    graph,
                    `SELECT column_name || '|' || data_type FROM user_tab_columns WHERE table_name = UPPER('${table}') ORDER BY column_id`
                )
            ).map((it) => {
                const [name, type] = it.split('|');
                return type === 'JSON' ? `JSON_SERIALIZE("${name}" RETURNING CLOB EXTENDED)` : `"${name}"`;
            });
            return texts(graph, `SELECT ${columns.join(', ')} FROM ${table}`);
        };

        /** Every row of every table of `graph`, and its indexes: what a dry run must leave as it was. */
        const snapshot = async (graph: string): Promise<string[]> => {
            const out: string[] = [];
            for (const table of (await texts(graph, tables(graph))).sort()) {
                out.push(...(await rowsOf(graph, table)).sort().map((it) => `${table}: ${it}`));
            }
            return [...out, ...(await texts(graph, indexes(graph))).sort()];
        };
        /** The properties of the node named `name`, as the store holds them. */
        const propsOf = async (graph: string, name: string): Promise<string> =>
            (
                await texts(
                    graph,
                    `SELECT ${json('n.props')} AS "p" FROM ${graph}_node n WHERE ${propertyIs('name', name)}`
                )
            )[0];
        const robotProps = async (graph: string): Promise<string> => propsOf(graph, 'R2');
        /** The id of the Event 5.0.0 wrote second, which collides with the first in layout 2: read before it is rewritten. */
        const laterEvent = async (graph: string): Promise<string> =>
            (
                await texts(
                    graph,
                    `SELECT n.nid AS "i" FROM ${graph}_node n WHERE ${propertyIs('at', '2024-03-15T10:30:00.500Z')}`
                )
            )[0];

        const stopAtRobot = async (graph: string, sleep: boolean): Promise<void> => {
            if (oracle) {
                // The sleeper names its graph, so killSleeper kills it alone, and not another suite's session of the test
                // user waiting out a busy DDL in DBMS_SESSION.SLEEP too.
                const stop = sleep
                    ? `DBMS_APPLICATION_INFO.SET_CLIENT_INFO('${graph}'); DBMS_SESSION.SLEEP(600);`
                    : "RAISE_APPLICATION_ERROR(-20001, 'stopped by the test');";
                await execute(
                    graph,
                    `CREATE OR REPLACE TRIGGER ${graph}_test_stop BEFORE UPDATE ON ${graph}_node FOR EACH ROW
                DECLARE v_name VARCHAR2(400);
                BEGIN
                    SELECT JSON_VALUE(:OLD.props, '$.name') INTO v_name FROM dual;
                    IF v_name = 'R2' THEN ${stop} END IF;
                END;`
                );
            } else {
                const stop = sleep ? 'PERFORM pg_sleep(600);' : "RAISE EXCEPTION 'stopped by the test';";
                await execute(
                    graph,
                    `CREATE FUNCTION ${graph}_test_stop() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN IF OLD.props->>'name' = 'R2' THEN ${stop} END IF; RETURN NEW; END $$`
                );
                await execute(
                    graph,
                    `CREATE TRIGGER ${graph}_test_stop BEFORE UPDATE ON ${graph}_node FOR EACH ROW EXECUTE FUNCTION ${graph}_test_stop()`
                );
            }
        };
        const unstop = async (graph: string): Promise<void> => {
            if (oracle) {
                await execute(graph, `DROP TRIGGER IF EXISTS ${graph}_test_stop`);
            } else {
                await execute(graph, `DROP TRIGGER IF EXISTS ${graph}_test_stop ON ${graph}_node`);
                await execute(graph, `DROP FUNCTION IF EXISTS ${graph}_test_stop()`);
            }
        };

        /** Kills the session waiting in stopAtRobot's sleep, once there is one: true when it found one to kill. */
        const killSleeper = async (graph: string): Promise<boolean> => {
            if (!oracle) {
                const killed = await texts(
                    graph,
                    `SELECT pg_terminate_backend(pid) AS "k" FROM pg_stat_activity WHERE wait_event = 'PgSleep' AND pid <> pg_backend_pid()`
                );
                return killed.includes('true');
            }
            // As system, as the test user may not see or kill another session.
            const admin = await oracledb.getConnection({
                user: 'system',
                password: env.password,
                connectString: `${env.host}:${port}/${env.databaseName}`
            });
            try {
                const sessions = await admin.execute<[string]>(
                    `SELECT sid || ',' || serial# FROM v$session WHERE username = UPPER(:u) AND event = 'PL/SQL lock timer' AND client_info = :g`,
                    { u: env.userName, g: graph }
                );
                for (const [session] of sessions.rows ?? []) {
                    try {
                        await admin.execute(`ALTER SYSTEM KILL SESSION '${session}' IMMEDIATE`);
                    } catch (e) {
                        // ORA-00031: marked to be killed, as it will be once its call returns: killed all the same.
                        if ((e as any).errorNum !== 31) {
                            throw e;
                        }
                    }
                }
                return (sessions.rows ?? []).length > 0;
            } finally {
                await admin.close();
            }
        };

        /** This version reads `graph` as layout 2: dates as dates, a key that begins with `$` as the user's, rewritten once. */
        const readsAsLayout2 = async (graph: string): Promise<void> => {
            const pm = manager(graph);
            const one = async (text: string): Promise<any> => {
                const rows = await pm.query<any>(new QuerySpecification({ text, language: 'CYPHER' }));
                expect(rows).toHaveLength(1);
                return rows[0];
            };
            expect(await one("MATCH (p:Person {name: 'Ada'}) RETURN toString(p.born)")).toBe('1815-12-10');
            expect(await one("MATCH (p:Person) WHERE p.born < date('1800-01-01') RETURN p.name")).toBe('Charles');
            expect(await one("MATCH ()-[k:KNOWS]->() RETURN k.since = date('2020-01-01')")).toBe(true);
            expect(Number(await one('MATCH (r:Robot) RETURN r.`$t`'))).toBe(1);
            expect(await one('MATCH (r:Robot) RETURN r.`$x`')).toBe('y');
            expect(await one("MATCH (p:Person {name: 'Mary'}) RETURN p.nick")).toBe('2024-03-15');
        };

        const sorted = (value: any): any =>
            Array.isArray(value)
                ? value.map(sorted)
                : value !== null && typeof value === 'object'
                ? Object.fromEntries(
                      Object.keys(value)
                          .sort()
                          .map((key) => [key, sorted(value[key])])
                  )
                : value;
        const canonical = (text: string, own = false): string => {
            const value = JSON.parse(text);
            if (own) {
                delete value.storeId;
                delete value.assignedAt;
            }
            return JSON.stringify(sorted(value));
        };

        /**
         * The nodes and relationships of `graph`, each with its labels or type, its properties as JSON that tells each value's
         * type, and its stamp: a relationship's ends named by their properties, as the ids differ. The store's own node gives
         * its id and when it was assigned, which are the graph's own, and the marker when it was applied.
         */
        const contents = async (graph: string): Promise<string[]> => {
            const nodes = new Map<string, string>();
            for (const row of await texts(
                graph,
                `SELECT n.nid AS "i", ${json('n.labels')} AS "l", ${json(
                    'n.props'
                )} AS "p", n.stamp AS "s" FROM ${graph}_node n`
            )) {
                const [nid, labels, props, stamp] = row.split('|');
                const own = labels.includes('DrivineStore');
                const marker = labels.includes('_DrivineSchema');
                const value = canonical(props, own);
                nodes.set(
                    nid,
                    `${canonical(labels)} ${
                        marker ? value.replace(/"appliedAt":[^,}]+/, '"appliedAt":_') : value
                    } stamp=${stamp}`
                );
            }
            const edges = (
                await texts(
                    graph,
                    `SELECT e.src AS "s", e.dst AS "d", e.type AS "t", ${json('e.props')} AS "p" FROM ${graph}_edge e`
                )
            ).map((row) => {
                const [src, dst, type, props] = row.split('|');
                return `(${nodes.get(src)})-[${type} ${canonical(props)}]->(${nodes.get(dst)})`;
            });
            return [...nodes.values(), ...edges].sort();
        };

        /** Each table of `graph` but its nodes and relationships, and its rows, but the count store's, the graph written `<g>`. */
        const others = async (graph: string): Promise<string[]> => {
            const out: string[] = [];
            for (const table of (await texts(graph, tables(graph))).map((it) => it.toLowerCase()).sort()) {
                const named = table.replace(graph.toLowerCase(), '<g>');
                if (named === '<g>_node' || named === '<g>_edge') {
                    continue;
                }
                out.push(named);
                if (named !== '<g>_count2') {
                    const rows = await rowsOf(graph, table);
                    out.push(
                        ...rows
                            .map((it) => `  ${it.split(graph).join('<g>').split(graph.toUpperCase()).join('<g>')}`)
                            .sort()
                    );
                }
            }
            return out;
        };

        /** `graph`, once its schema is made, against the graph this version writes from the same statements. */
        const assertSameAsWritten = async (graph: string): Promise<void> => {
            const native = graphNamed('native');
            const writer = manager(native);
            for (const text of WRITTEN) {
                await writer.execute(new QuerySpecification({ text, language: 'CYPHER' }));
            }
            const identities: string[] = [];
            for (const name of [native, graph]) {
                const pm = manager(name);
                // As the application made them: the migration made none, and dropped layout 1's.
                for (const text of CONSTRAINTS) {
                    await pm.execute(new QuerySpecification({ text, language: 'CYPHER' }));
                }
                const gom = new StatelessGraphObjectManager(
                    pm,
                    backendFor(DatabaseType[store], name),
                    new ModelRegistry()
                );
                // The store's identity, which a graph this version writes is given when first asked: the migrated graph's
                // stamp, kept from layout 1, is given one as that graph's would be.
                identities.push((await gom.storeIdentity()).id);
            }
            expect(new Set(identities).size).toBe(2);
            expect(await contents(graph)).toEqual(await contents(native));
            const tablesOf = await others(graph);
            expect(tablesOf).toContain('<g>_schema');
            expect(tablesOf).toEqual(await others(native));
            const index = async (name: string): Promise<string[]> =>
                (await texts(name, indexes(name)))
                    .map((it) => it.split(name).join('<g>').split(name.toUpperCase()).join('<g>'))
                    .sort();
            const migrated = await index(graph);
            expect(migrated.length).toBeGreaterThanOrEqual(2);
            expect(migrated).toEqual(await index(native));
        };

        /** Resumes a stopped run past the collision it then meets, at the row `later`, and checks the graph it leaves. */
        const resumeToTheEnd = async (graph: string, later: string): Promise<void> => {
            expect((await migrate(graph, { batchSize: 2 })).status).toBe('collisions');
            await execute(graph, `DELETE FROM ${graph}_node WHERE nid = ${later}`);
            const migrated = await migrate(graph, { batchSize: 2 });
            expect(migrated.status).toBe('migrated');
            await readsAsLayout2(graph);
            await assertSameAsWritten(graph);
        };

        it('should refuse it, dry run it, stop at a collision, finish once corrected, and leave the graph this version writes', async () => {
            const graph = graphNamed('full');
            writeLayout1(graph);
            await expect(provider(graph).connect()).rejects.toBeInstanceOf(StoreLayoutError);
            const later = await laterEvent(graph);

            const untouched = await snapshot(graph);
            const dryRun = await migrate(graph, { dryRun: true });
            expect(dryRun.status).toBe('dryRun');
            expect(await snapshot(graph)).toEqual(untouched);
            expect(dryRun.candidates).toContainEqual({ label: 'Person', property: 'nick', kind: 'date', values: 1 });

            const stopped = await migrate(graph);
            expect(stopped.status).toBe('collisions');
            expect(stopped.collisions.map((it) => [it.label, it.properties])).toEqual([['Event', ['at']]]);
            await expect(provider(graph).connect()).rejects.toBeInstanceOf(StoreLayoutError);

            await execute(graph, `DELETE FROM ${graph}_node WHERE nid = ${later}`);
            expect((await migrate(graph)).status).toBe('migrated');
            expect((await migrate(graph)).status).toBe('current');
            expect((await texts(graph, tables(graph))).filter((it) => it.toLowerCase().endsWith('_migrate2'))).toEqual(
                []
            );
            await readsAsLayout2(graph);
            await assertSameAsWritten(graph);
        });

        it('should report a run stopped by a failed batch as failed, keep its committed batches, and resume it to the end', async () => {
            const graph = graphNamed('failed');
            writeLayout1(graph);
            const robot = await robotProps(graph);
            const ada = await propsOf(graph, 'Ada');
            const later = await laterEvent(graph);
            await stopAtRobot(graph, false);
            const failed = await migrate(graph, { batchSize: 2 });
            expect(failed.status).toBe('failed');
            expect(failed.message).toContain('stopped by the test');
            expect(await robotProps(graph)).toEqual(robot);
            // Ada's batch, committed before the Robot's, is kept: her date rewritten.
            expect(await propsOf(graph, 'Ada')).not.toEqual(ada);
            await expect(provider(graph).connect()).rejects.toBeInstanceOf(StoreLayoutError);
            await unstop(graph);

            expect((await migrate(graph, { batchSize: 2, dryRun: true })).status).toBe('inProgress');
            expect((await migrate(graph, { batchSize: 2, declarations: declarations.slice(0, -1) })).status).toBe(
                'refused'
            );
            expect(await robotProps(graph)).toEqual(robot);
            await resumeToTheEnd(graph, later);
        });

        it('should resume a run whose session is killed while it writes to the end, each row rewritten once', async () => {
            const graph = graphNamed('killed');
            writeLayout1(graph);
            const robot = await robotProps(graph);
            const later = await laterEvent(graph);
            await stopAtRobot(graph, true);
            const run = migrate(graph, { batchSize: 2 }).then(
                (report) => ({ report }),
                (error) => ({ error })
            );
            const deadline = Date.now() + 60_000;
            while (!(await killSleeper(graph))) {
                if (Date.now() > deadline) {
                    throw new Error(`The migration never reached the Robot's row: ${JSON.stringify(await run)}`);
                }
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
            const ended: any = await run;
            if (ended.report) {
                expect(ended.report.status).toBe('failed');
            }
            await unstop(graph);
            expect(await robotProps(graph)).toEqual(robot);
            await expect(provider(graph).connect()).rejects.toBeInstanceOf(StoreLayoutError);
            await resumeToTheEnd(graph, later);
        });

        it('should refuse a value not of its declared kind before anything is written', async () => {
            const graph = graphNamed('invalid');
            writeLayout1(graph);
            const untouched = await snapshot(graph);
            const wrong: Declaration[] = [...declarations, { label: 'Person', property: 'name', kind: 'date' }];
            const refused = await migrate(graph, { declarations: wrong });
            expect(refused.status).toBe('invalid');
            // Each Person's name, named: none is a date.
            expect(
                refused.properties
                    .find((it) => it.label === 'Person' && it.property === 'name')
                    ?.invalid.map((it) => it.value)
                    .sort()
            ).toEqual(['"Ada"', '"Bob"', '"Charles"', '"Cy"', '"Mary"']);
            expect(await snapshot(graph)).toEqual(untouched);
            const kept = await migrate(graph, { declarations: wrong, dryRun: true, keepInvalid: true });
            expect(kept.status).toBe('dryRun');
            expect(await snapshot(graph)).toEqual(untouched);
        });
    }
);
