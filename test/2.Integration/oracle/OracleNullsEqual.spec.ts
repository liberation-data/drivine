import * as oracledb from 'oracledb';
import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { OracleGraph } from '@/backend/oracle';
import { OracleStoredFunctions } from '@/backend/oracle/OracleStoredFunctions';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(300_000);

/** Where the ORACLE connection points, as node-oracledb takes it. */
function connectString(): string {
    const it = ConnectionPropertiesFromEnv('ORACLE');
    return `${it.host}:${it.port ?? 1521}/${it.databaseName}`;
}

/** A session of its own of the test user, as a statement's is, outside any pool. */
async function session(user?: string, password?: string): Promise<oracledb.Connection> {
    const it = ConnectionPropertiesFromEnv('ORACLE');
    return oracledb.getConnection({
        user: user ?? it.userName,
        password: password ?? it.password,
        connectString: connectString()
    });
}

/** Runs `statements` in a session of its own as `user`, the test user unless named. */
async function run(statements: string[], user?: string): Promise<void> {
    const connection = await session(user);
    try {
        for (const statement of statements) {
            await connection.execute(statement);
        }
    } finally {
        await connection.close();
    }
}

/** What drops the graph `graph`'s store, its function among it. */
function dropping(graph: string): string[] {
    return [
        `DROP PROPERTY GRAPH IF EXISTS ${graph}`,
        `DROP TABLE IF EXISTS ${graph}_edge PURGE`,
        `DROP TABLE IF EXISTS ${graph}_node PURGE`,
        `DROP TABLE IF EXISTS ${graph}_schema PURGE`,
        `DROP FUNCTION IF EXISTS ${graph}_nulls_equal`
    ];
}

/** A persistence manager of its own pool for the graph `graph`, as `user` where named. */
function managerFor(name: string, graph: string, user?: { name: string; password: string }): PersistenceManager {
    const registry = DatabaseRegistry.getInstance();
    registry
        .builder()
        .withProperties({
            ...ConnectionPropertiesFromEnv('ORACLE'),
            ...(user ? { userName: user.name, password: user.password } : {}),
            defaultGraphPath: graph
        })
        .register(name);
    return new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance()).get(
        name,
        'NON_TRANSACTIONAL'
    );
}

const cypher = async (pm: PersistenceManager, text: string): Promise<any[]> =>
    pm.query(new QuerySpecification({ text, language: 'CYPHER' }));

/** A statement that writes, comparing a pair that differs as JSON and a pair that is the same, both holding a null. */
const WRITE =
    "CREATE (n:CyWrite) WITH n, [null] AS a, [1] AS b, [null] AS c RETURN [coalesce(a = b, 'null'), coalesce(a = c, 'null')]";

/** The same comparisons in a read. */
const READ = "WITH [null] AS a, [1] AS b, [null] AS c RETURN [coalesce(a = b, 'null'), coalesce(a = c, 'null')]";

/**
 * The function an Oracle graph is made with, `<graph>_nulls_equal`, which a compiled statement compares two lists or
 * maps that may hold a null by, and what happens where a store has none (#367): drivine4j's OracleFreshGraphTest and
 * CypherWriteOracleTest of liberation-data/drivine4j#323.
 */
describeOnOracle('The function an Oracle graph compares values that may hold a null by', () => {
    const graph = 'drivine_nulls_fn';
    const f = new OracleGraph(graph).nullsEqual;

    beforeEach(async () => {
        await run(dropping(graph));
    });

    afterAll(async () => {
        await run(dropping(graph));
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
    });

    const answer = async (sql: string): Promise<string> => {
        const connection = await session();
        try {
            return ((await connection.execute<any[]>(sql)).rows as any[][])[0][0];
        } finally {
            await connection.close();
        }
    };

    it('is made with the graph, and answers as Cypher would', async () => {
        await run([new OracleGraph(graph).ensuring]);
        const compared =
            `NVL(TO_CHAR(${f}(JSON('[null]'), JSON('[1]'))), 'null') || ',' || ` +
            `TO_CHAR(${f}(JSON('[1, null]'), JSON('[2, null]'))) || ',' || ` +
            `TO_CHAR(${f}(JSON('{"x": [1]}'), JSON('{"x": [1]}')))`;
        expect(await answer(`SELECT ${compared} FROM DUAL`)).toEqual('null,0,1');
    });

    it('is made again where one of its name is not valid', async () => {
        await run([
            `BEGIN EXECUTE IMMEDIATE 'CREATE OR REPLACE FUNCTION ${f} RETURN NUMBER IS BEGIN RETURN nope; END;'; EXCEPTION WHEN OTHERS THEN NULL; END;`
        ]);
        await run([new OracleGraph(graph).ensuring]);
        expect(await answer(`SELECT TO_CHAR(${f}(JSON('[1, null]'), JSON('[2, null]'))) FROM DUAL`)).toEqual('0');
    });

    it('is left out by a user who may not make a function, who still has the graph, and a statement compiled to call none', async () => {
        // Making a function takes CREATE PROCEDURE, which this user lacks (ORA-01031).
        const user = 'drivine_no_procedure';
        const password = ConnectionPropertiesFromEnv('ORACLE').password!;
        const asSystem = async (statements: string[]): Promise<void> => {
            const connection = await session('system', password);
            try {
                for (const statement of statements) {
                    await connection.execute(statement);
                }
            } finally {
                await connection.close();
            }
        };
        await asSystem([
            `DROP USER IF EXISTS ${user} CASCADE`,
            `CREATE USER ${user} IDENTIFIED BY "${password}" DEFAULT TABLESPACE users QUOTA UNLIMITED ON users`,
            `GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE PROPERTY GRAPH TO ${user}`
        ]);
        try {
            const restricted = managerFor('ORACLE_NO_PROCEDURE', graph, { name: user, password });
            expect(await cypher(restricted, WRITE)).toEqual([[false, 'null']]);
            expect(await cypher(restricted, READ)).toEqual([['null', 'null']]);
            const made = await restricted.query<number>(
                new QuerySpecification(
                    `SELECT COUNT(*) AS "n" FROM user_objects WHERE object_name IN ('${graph.toUpperCase()}_NODE', '${f.toUpperCase()}')`
                )
            );
            expect(made).toEqual([1]);
        } finally {
            await DatabaseRegistry.getInstance().connectionProvider('ORACLE_NO_PROCEDURE')?.end();
            await asSystem([`DROP USER IF EXISTS ${user} CASCADE`]);
        }
    });

    it('is missing from a store an earlier version made, which compares as before, until the graph is ensured again', async () => {
        const pm = managerFor('ORACLE_NO_FUNCTION', graph);
        // The first statement's connection makes the graph, the function with it; then it is taken away.
        await pm.query(new QuerySpecification('SELECT 1 FROM DUAL'));
        await run([`DROP FUNCTION ${f}`]);
        expect(await cypher(pm, WRITE)).toEqual([[false, 'null']]);
        // A read declares the function itself.
        expect(await cypher(pm, READ)).toEqual([['null', 'null']]);
        const connection = await session();
        try {
            await new OracleGraph(graph).ensure(connection);
        } finally {
            await connection.close();
        }
        expect(await cypher(pm, WRITE)).toEqual([['null', 'null']]);
    });

    it('is made by sessions at once, while others call it, and all succeed', async () => {
        // Two pools first ensuring a graph whose function is missing both run CREATE OR REPLACE FUNCTION.
        await run([new OracleGraph(graph).ensuring]);
        const ensuring = new OracleGraph(graph).ensuring;
        const sessions = await Promise.all(Array.from({ length: 6 }, async () => session()));
        try {
            for (let round = 0; round < 15; round++) {
                await run([`DROP FUNCTION ${f}`]);
                const failures: unknown[] = [];
                await Promise.all(
                    sessions.map(async (connection, i) => {
                        try {
                            if (i % 2 === 0) {
                                await connection.execute(ensuring);
                                return;
                            }
                            for (let call = 0; call < 20; call++) {
                                try {
                                    await connection.execute(
                                        `SELECT ${f}(JSON('[1, null]'), JSON('[2, null]')) FROM DUAL`
                                    );
                                } catch (e) {
                                    if (![904, 6575].includes((e as { errorNum?: number }).errorNum ?? -1)) {
                                        throw e;
                                    }
                                }
                            }
                        } catch (e) {
                            failures.push(e);
                        }
                    })
                );
                expect(failures).toEqual([]);
                expect(await answer(`SELECT TO_CHAR(${f}(JSON('[1, null]'), JSON('[2, null]'))) FROM DUAL`)).toEqual(
                    '0'
                );
            }
        } finally {
            await Promise.all(sessions.map(async (it) => it.close()));
        }
    });
});

/**
 * Whether a session may call the function, asked of a store whose function each test makes or takes away: a graph of
 * its own for each test, as what a session found is remembered for the process.
 */
describeOnOracle(
    'Whether an Oracle session may call the function a graph compares values that may hold a null by',
    () => {
        const clock = OracleStoredFunctions.clock;
        // Read in beforeAll, not here: a skipped describe still runs its body, where no ORACLE connection is set.
        let database: string;
        let connection: oracledb.Connection;

        beforeAll(async () => {
            database = `${connectString()}|${ConnectionPropertiesFromEnv('ORACLE').userName}`;
            connection = await session();
        });

        afterAll(async () => {
            await connection.close();
        });

        /** Runs `test` over the graph `graph`, whose function nothing has made, and drops what it made after. */
        const withGraph = async (graph: string, test: (f: string) => Promise<void>): Promise<void> => {
            const f = new OracleGraph(graph).nullsEqual;
            await run(dropping(graph));
            try {
                await test(f);
            } finally {
                OracleStoredFunctions.clock = clock;
                await run(dropping(graph));
            }
        };

        it('is not asked again of a session found to call none until a minute passes', async () =>
            withGraph('fresh_absent', async () => {
                // A store without the function would otherwise pay a query and a second compile on every statement.
                const g = 'fresh_absent';
                expect(await OracleStoredFunctions.nullsEqual(connection, database, g)).toBe(false);
                await connection.execute(new OracleGraph(g).functions[0]);
                expect(await OracleStoredFunctions.nullsEqual(connection, database, g)).toBe(false);
                const now = performance.now();
                OracleStoredFunctions.clock = () => now + OracleStoredFunctions.ABSENT_FOR_MS + 1;
                expect(await OracleStoredFunctions.nullsEqual(connection, database, g)).toBe(true);
            }));

        it('is asked again of a session found to call none once the graph is ensured', async () =>
            withGraph('fresh_ensured', async () => {
                const g = 'fresh_ensured';
                expect(await OracleStoredFunctions.nullsEqual(connection, database, g)).toBe(false);
                await new OracleGraph(g).ensure(connection);
                expect(await OracleStoredFunctions.nullsEqual(connection, database, g)).toBe(true);
            }));

        it('takes a function that is not valid as missing', async () =>
            withGraph('fresh_invalid', async (f) => {
                // Calling it gives ORA-06575.
                await connection.execute(
                    `CREATE OR REPLACE FUNCTION ${f}(a JSON, b JSON) RETURN NUMBER IS BEGIN RETURN nope; END;`
                );
                expect(await OracleStoredFunctions.nullsEqual(connection, database, 'fresh_invalid')).toBe(false);
            }));

        it('takes only the errors of a function there is none of as missing, and reports any other', async () =>
            withGraph('fresh_failing', async (f) => {
                // Only the errors of a function there is none of (ORA-00904, ORA-06575…) mean none: this one, like a
                // connection lost, is reported.
                await connection.execute(
                    `CREATE OR REPLACE FUNCTION ${f}(a JSON, b JSON) RETURN NUMBER IS BEGIN RAISE_APPLICATION_ERROR(-20001, 'failed'); END;`
                );
                await expect(
                    OracleStoredFunctions.nullsEqual(connection, database, 'fresh_failing')
                ).rejects.toMatchObject({ errorNum: 20001 });
            }));
    }
);
