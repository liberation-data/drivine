import * as oracledb from 'oracledb';
import { ConnectionPropertiesFromEnv, QuerySpecification } from '@liberation-data/drivine';
import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleSpecCompiler } from '@/connection/oracle/OracleSpecCompiler';
import { SharedCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { TEST_CONTAINER_PASSWORD } from '@/testing';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(300_000);

/** The graph the statements are compiled against: its tables and functions are made first, and dropped after. */
const GRAPH = 'cy_era_parse';

const at = "datetime(CASE k WHEN 0 THEN '2024-03-15T10:00:00+02:00' ELSE '2024-03-15T09:00:00Z' END)";

/**
 * How long Oracle takes to plan a statement of temporal arithmetic, so that a change to the SQL a year BC is read and
 * written by fails here, clearly, and not as a test that times out. Renumbered inline, with a test and a regular
 * expression that wrote each value three or four times, the min and max of a collected list of moments took 4.8 seconds
 * of Oracle's hard parse, a moment two `CALL`s deep 74 seconds, and a truncation four deep was not planned in ten minutes
 * (#572). The store's era functions (see `OracleGraph.era`) took them to 1.0, 27 and 16 seconds on a fast machine
 * (#609), and a CI runner takes longer: the bounds leave room for that. drivine4j's OracleEraParseTest. `npm test` runs
 * this suite on its own (`test/run-tests.ts`), as another suite planning on the same database at once slows it.
 *
 * The time is the session's `parse time cpu` in `v$sesstat`, which the test user may not read, so the system user reads
 * it; each statement is new to Oracle (a comment that no other has), so it is parsed hard. A statement still being
 * planned well past its bound has its session killed, so a regression fails here and does not hold the database.
 */
describeOnOracle('The hard parse of temporal arithmetic on Oracle', () => {
    let attributes: oracledb.ConnectionAttributes;
    let admin: oracledb.Connection;

    /** Runs each statement on a connection of its own, and commits. */
    const run = async (statements: string[]): Promise<void> => {
        const connection = await oracledb.getConnection(attributes);
        try {
            for (const statement of statements) {
                await connection.execute(statement);
            }
            await connection.commit();
        } finally {
            await connection.close();
        }
    };

    const dropping = (): string[] => {
        const graph = new OracleGraph(GRAPH);
        return [
            `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
            `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`,
            ...[graph.nullsEqual, graph.era, graph.eraDate].map((it) => `DROP FUNCTION IF EXISTS ${it}`)
        ];
    };

    /** `cypher` compiled for a store with the era functions, as OracleConnection binds it, and whether it calls them. */
    const compiled = (cypher: string): { statement: string; parameters: any; callsEra: boolean } => {
        const compiler = new SharedCypherCompiler('oracle', { name: GRAPH });
        const cypherCompiled = compiler.compile(cypher);
        return {
            ...new OracleSpecCompiler(
                new QuerySpecification(cypherCompiled.sql).bind(cypherCompiled.parameters).finalizedCopy('SQL')
            ).compile(),
            callsEra: compiler.callsStoredEra
        };
    };

    beforeAll(async () => {
        const properties = ConnectionPropertiesFromEnv('ORACLE');
        attributes = {
            user: properties.userName,
            password: properties.password,
            connectString: `${properties.host}:${properties.port ?? 1521}/${properties.databaseName}`
        };
        admin = await oracledb.getConnection({ ...attributes, user: 'system', password: TEST_CONTAINER_PASSWORD });
        await run(dropping());
        await run([new OracleGraph(GRAPH).ensuring]);
        const write = compiled("CREATE (:CyTemporal {id: 'a', day: date('2024-03-15')})");
        const connection = await oracledb.getConnection(attributes);
        try {
            await connection.execute(write.statement, write.parameters);
            await connection.commit();
        } finally {
            await connection.close();
        }
    });

    afterAll(async () => {
        await run(dropping());
        await admin?.close();
    });

    /** The session's CPU spent parsing, in milliseconds (`v$sesstat` counts centiseconds). */
    const parseCpu = async (sid: number): Promise<number> => {
        const result = await admin.execute<[number]>(
            "SELECT s.value FROM v$sesstat s JOIN v$statname n ON n.statistic# = s.statistic# WHERE s.sid = :sid AND n.name = 'parse time cpu'",
            { sid }
        );
        return (result.rows ?? [])[0][0] * 10;
    };

    /**
     * The milliseconds of CPU Oracle took to parse `cypher`, compiled for a store with the era functions, and the first
     * column of its rows as JSON text. A session still running it at `deadline` milliseconds is killed.
     */
    const parsed = async (cypher: string, deadline: number): Promise<[number, string[]]> => {
        const statement = compiled(cypher);
        expect(statement.callsEra).toBe(true);
        const connection = await oracledb.getConnection(attributes);
        const sid = Number(
            ((await connection.execute<[string]>("SELECT SYS_CONTEXT('USERENV', 'SID') FROM dual")).rows ?? [])[0][0]
        );
        let timer: NodeJS.Timeout | undefined;
        const killing = new Promise<void>((resolve) => {
            timer = setTimeout(() => resolve(), deadline);
        }).then(async () => {
            const [[serial]] =
                (await admin.execute<[number]>(`SELECT serial# FROM v$session WHERE sid = ${sid}`)).rows ?? [];
            await admin.execute(`ALTER SYSTEM KILL SESSION '${sid},${serial}' IMMEDIATE`).catch(() => undefined);
        });
        try {
            const before = await parseCpu(sid);
            const result = await connection.execute<any[]>(
                `/* era parse ${process.hrtime.bigint()} */ ${statement.statement}`,
                statement.parameters,
                {
                    fetchTypeHandler: (meta) =>
                        meta.dbType === oracledb.DB_TYPE_CLOB ? { type: oracledb.STRING } : undefined
                }
            );
            const ms = (await parseCpu(sid)) - before;
            return [ms, (result.rows ?? []).map((it) => JSON.stringify(it[0]))];
        } finally {
            clearTimeout(timer);
            killing.catch(() => undefined);
            await connection.close().catch(() => undefined);
        }
    };

    it('plans the min and max of a collected list of moments in seconds', async () => {
        // 1.0 second measured; 4.8 renumbered inline.
        const [ms, rows] = await parsed(
            `UNWIND [0, 1] AS k UNWIND range(1, 3) AS i WITH k, ${at} + duration({minutes: i}) AS t WITH k, collect(t) AS l RETURN [min(l)[0].hour, max(l)[0].hour]`,
            60_000
        );
        expect(rows).toEqual(['[10,9]']);
        expect(ms).toBeLessThan(3_500);
    });

    it('plans a moment two CALLs deep in a minute and a half', async () => {
        // 27 seconds measured on a fast machine, and 67 on a CI runner beside other suites; 74 and over two minutes
        // renumbered inline. `compiled` checks that it calls the era functions.
        const [ms, rows] = await parsed(
            "MATCH (n:CyTemporal) CALL { WITH n CALL { WITH n RETURN n.day + duration('P1D') AS e } RETURN e AS d } RETURN (d + duration('P1D')).day",
            180_000
        );
        expect(rows).toEqual(['17']);
        expect(ms).toBeLessThan(90_000);
    });

    it('plans a truncation with fields four deep in a minute and a half', async () => {
        // 16 seconds measured; renumbered inline it was still being planned after ten minutes.
        const [ms, rows] = await parsed(
            'RETURN ' +
                "datetime.truncate('second', ".repeat(4) +
                "datetime('2017-10-11T12:31:14+01:00')" +
                ', {hour: 3})'.repeat(4) +
                '.hour',
            180_000
        );
        expect(rows).toEqual(['3']);
        expect(ms).toBeLessThan(90_000);
    });
});
