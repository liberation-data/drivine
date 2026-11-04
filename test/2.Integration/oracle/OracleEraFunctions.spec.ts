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
async function session(): Promise<oracledb.Connection> {
    const it = ConnectionPropertiesFromEnv('ORACLE');
    return oracledb.getConnection({ user: it.userName, password: it.password, connectString: connectString() });
}

/** Runs `statements` in a session of its own. */
async function run(statements: string[]): Promise<void> {
    const connection = await session();
    try {
        for (const statement of statements) {
            await connection.execute(statement);
        }
    } finally {
        await connection.close();
    }
}

/** The names of the graph's three functions. */
function functionsOf(graph: string): string[] {
    const it = new OracleGraph(graph);
    return [it.nullsEqual, it.era, it.eraDate];
}

/** What drops the graph `graph`'s store, its functions among it. */
function dropping(graph: string): string[] {
    return [
        `DROP PROPERTY GRAPH IF EXISTS ${graph}`,
        `DROP TABLE IF EXISTS ${graph}_edge PURGE`,
        `DROP TABLE IF EXISTS ${graph}_node PURGE`,
        `DROP TABLE IF EXISTS ${graph}_schema PURGE`,
        ...functionsOf(graph).map((it) => `DROP FUNCTION IF EXISTS ${it}`)
    ];
}

/**
 * The functions an Oracle graph renumbers a year BC by, `<graph>_era` and `<graph>_era_date`, made beside its
 * `<graph>_nulls_equal`, and what happens where a store lacks them (#609): drivine4j's OracleFreshGraphTest and
 * OracleTablesOnFirstConnectionTest of liberation-data/drivine4j#584.
 */
describeOnOracle('The functions an Oracle graph renumbers a year BC by', () => {
    const clock = OracleStoredFunctions.clock;
    // Read in beforeAll, not here: a skipped describe still runs its body, where no ORACLE connection is set.
    let database: string;
    let connection: oracledb.Connection;
    const graphs = ['era_fresh', 'era_upgrade', 'era_half', 'era_first'];

    beforeAll(async () => {
        database = `${connectString()}|${ConnectionPropertiesFromEnv('ORACLE').userName}`;
        connection = await session();
        await run(graphs.flatMap(dropping));
    });

    afterEach(() => {
        OracleStoredFunctions.clock = clock;
    });

    afterAll(async () => {
        await connection.close();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        await run(graphs.flatMap(dropping));
    });

    /** The first column of the rows `sql` gives. */
    const column = async (sql: string): Promise<any[]> =>
        ((await connection.execute<any[]>(sql)).rows ?? []).map((it) => it[0]);

    /** The graph's functions that are made and valid, by name. */
    const made = async (graph: string): Promise<string> =>
        (
            await column(
                `SELECT LISTAGG(object_name, ',') WITHIN GROUP (ORDER BY object_name) FROM user_objects WHERE object_type = 'FUNCTION' AND status = 'VALID' AND object_name IN (${functionsOf(
                    graph
                )
                    .map((it) => `'${it.toUpperCase()}'`)
                    .join(', ')})`
            )
        )[0];

    it('are made with the graph, and renumber a year as Oracle and as ISO 8601 number it', async () => {
        const graph = new OracleGraph('era_fresh');
        await graph.ensure(connection);
        const texts = (f: string, values: string[]): string =>
            values.map((it) => `NVL(${f}(${it}), 'null')`).join(" || ',' || ");
        const read = texts(graph.era, [
            "'0000-03-15'",
            "'-0044-03-15T12:00:00'",
            "'0999-12-31'",
            "'2024-03-15'",
            'NULL'
        ]);
        const written = texts(graph.eraDate, [
            "'-0001-03-15'",
            "'-0045-03-15T12:00:00'",
            "'0999-12-31'",
            "'2024-03-15'",
            'NULL'
        ]);
        expect(await column(`SELECT ${read} FROM DUAL UNION ALL SELECT ${written} FROM DUAL`)).toEqual([
            '-0001-03-15,-0045-03-15T12:00:00,0999-12-31,2024-03-15,null',
            '0000-03-15,-0044-03-15T12:00:00,0999-12-31,2024-03-15,null'
        ]);
    });

    it('are gained by a store an earlier version made when the graph is ensured, and each is made on its own', async () => {
        // A store made before #609 has its nulls_equal and not the era functions: ensured, it gains them, and keeps the other.
        const g = 'era_upgrade';
        const graph = new OracleGraph(g);
        await graph.ensure(connection);
        await run([`DROP FUNCTION ${graph.era}`, `DROP FUNCTION ${graph.eraDate}`]);
        expect(await OracleStoredFunctions.era(connection, database, g)).toBe(false);
        expect(await OracleStoredFunctions.nullsEqual(connection, database, g)).toBe(true);
        await graph.ensure(connection);
        expect(await OracleStoredFunctions.era(connection, database, g)).toBe(true);
        expect(await made(g)).toEqual('ERA_UPGRADE_ERA,ERA_UPGRADE_ERA_DATE,ERA_UPGRADE_NULLS_EQUAL');
        // One of the two missing is made on its own.
        await run([`DROP FUNCTION ${graph.eraDate}`]);
        await graph.ensure(connection);
        expect(await made(g)).toEqual('ERA_UPGRADE_ERA,ERA_UPGRADE_ERA_DATE,ERA_UPGRADE_NULLS_EQUAL');
    });

    it('are taken as neither where a session may call only one of them', async () => {
        const g = 'era_half';
        await connection.execute(new OracleGraph(g).functions[1]);
        expect(await OracleStoredFunctions.era(connection, database, g)).toBe(false);
    });

    it("are gained, with nulls_equal, by a store with its tables and none of its functions, on a provider's first connection", async () => {
        const g = 'era_first';
        const managerFor = (name: string): PersistenceManager => {
            const registry = DatabaseRegistry.getInstance();
            registry
                .builder()
                .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: g })
                .register(name);
            return new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance()).get(
                name,
                'NON_TRANSACTIONAL'
            );
        };
        await managerFor('ORACLE_ERA_FIRST_1').query(new QuerySpecification('SELECT 1 FROM DUAL'));
        await run(functionsOf(g).map((it) => `DROP FUNCTION ${it}`));
        expect(await OracleStoredFunctions.nullsEqual(connection, database, g)).toBe(false);
        expect(await OracleStoredFunctions.era(connection, database, g)).toBe(false);

        await managerFor('ORACLE_ERA_FIRST_2').query(new QuerySpecification('SELECT 1 FROM DUAL'));
        // Asked again once the provider has ensured the graph.
        expect(await OracleStoredFunctions.nullsEqual(connection, database, g)).toBe(true);
        expect(await OracleStoredFunctions.era(connection, database, g)).toBe(true);
        expect(await made(g)).toEqual('ERA_FIRST_ERA,ERA_FIRST_ERA_DATE,ERA_FIRST_NULLS_EQUAL');
    });
});
