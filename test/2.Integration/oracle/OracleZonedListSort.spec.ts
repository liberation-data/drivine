import * as oracledb from 'oracledb';
import { ConnectionPropertiesFromEnv, QuerySpecification } from '@liberation-data/drivine';
import { OracleSpecCompiler } from '@/connection/oracle/OracleSpecCompiler';
import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { TEST_CONTAINER_PASSWORD } from '@/testing';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(120_000);

/** The graph the statements are compiled against: its tables are made for the one that writes, and dropped after. */
const GRAPH = 'drivine_unwound_temporals';

/** liberation-data/drivine4j#331's list: worked out item by item with temporal arithmetic, by a comprehension. */
const list = "[i IN range(1, 10) | localdatetime('2024-03-15T10:00:00') + duration({minutes: i})]";

/** #331's statement: its list, on each of two rows. */
const repro = `UNWIND [0, 1] AS k WITH k, ${list} AS l`;

/**
 * #331's list in a map, unwound, and taken out by a `WITH` (liberation-data/drivine4j#369): from a map, one the list was
 * put in after it was worked out, a map two levels down, a list of two maps, and after a write.
 */
const unwoundRepros = [
    `UNWIND [0, 1] AS k WITH k, [{l: ${list}}] AS ms UNWIND ms AS t WITH k, t.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`,
    `${repro} UNWIND [{l: l}] AS t WITH k, t.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`,
    `UNWIND [0, 1] AS k WITH k, [{m: {l: ${list}}}] AS ms UNWIND ms AS t WITH k, t.m AS m WITH k, m.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`,
    `UNWIND [0, 1] AS k WITH k, [{l: ${list}}, {l: ${list}}] AS ms UNWIND ms AS t WITH k, t.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`,
    `UNWIND [0, 1] AS k WITH k, [{l: ${list}}] AS ms UNWIND ms AS t CREATE (:CyUnwoundTemporals) WITH k, t.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`
];

/** Statements that collect, once each, lists that hold #331's temporal values two levels down, or in maps: see liberation-data/drivine4j#347. */
const deepRepros = [
    `${repro} RETURN collect(DISTINCT [l, l])`,
    `${repro} RETURN collect(DISTINCT [x IN l | [x]])`,
    `${repro} RETURN collect(DISTINCT [x IN l | [x, null]])`,
    `${repro} WITH k, [l, l] AS ll RETURN collect(DISTINCT ll)`,
    `${repro} RETURN collect(DISTINCT [x IN l | {t: x}])`
];

/**
 * Statements whose lists may hold #331's temporal values: a list of lists of them, an item of which a quantifier or reduce takes,
 * a list worked out item by item with a coalesce or a CASE that is a temporal value or a number, a list a reduce gives of them,
 * and a list of them at a map's key that a temporal value's field is named for.
 */
const mayHoldRepros = [
    `${repro} WITH k, [l, l] AS ll RETURN [k, any(x IN ll WHERE size([y IN x WHERE y IS NOT NULL]) > 9)] ORDER BY k`,
    `${repro} WITH k, [l, l] AS ll RETURN reduce(s = 0, x IN ll | s + size([y IN x WHERE y IS NOT NULL])) / 2`,
    "UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | coalesce(CASE WHEN k > 5 THEN k END, localdatetime('2024-03-15T10:00:00') + duration({minutes: i}))] AS l " +
        'RETURN size([x IN l WHERE x IS NOT NULL])',
    "UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | CASE WHEN k > 5 THEN k ELSE localdatetime('2024-03-15T10:00:00') + duration({minutes: i}) END] AS l " +
        'RETURN size([x IN l WHERE x IS NOT NULL])',
    `${repro} WITH k, reduce(acc = [], x IN l | acc + [x]) AS m RETURN size([y IN m WHERE y IS NOT NULL])`,
    `${repro} WITH k, {minute: l} AS m RETURN size([y IN m.minute WHERE y IS NOT NULL])`,
    `${repro} WITH k, [{minute: l}] AS ms RETURN size([y IN ms[0].minute WHERE y IS NOT NULL])`
];

/** #331's list in a map whose keys are taken: Oracle reads them from the map's data guide. */
const keyed = `${repro} WITH k, {l: l} AS m RETURN size(keys(m))`;

/**
 * The statements whose reads of a list stalled Oracle's parse (liberation-data/drivine4j#331) run in moments, and lists of
 * zoned values sort by their moments. Each runs on a connection of its own, with a deadline: neither a query timeout nor a
 * kill ends Oracle's parse, so past the deadline the session is killed, which marks it, and the connection broken and
 * closed unawaited, which ends the wait here, and the test fails rather than holding the suite.
 */
describeOnOracle('a list of zoned values on Oracle', () => {
    /** By its moment 10:00+02:00 (08:00 UTC) comes first, as every store sorts it; by its text 09:00Z would. */
    const at = "datetime(CASE k WHEN 0 THEN '2024-03-15T10:00:00+02:00' ELSE '2024-03-15T09:00:00Z' END)";

    let attributes: oracledb.ConnectionAttributes;

    /** Runs each statement on a connection of its own. */
    const run = async (statements: string[]): Promise<void> => {
        const connection = await oracledb.getConnection(attributes);
        try {
            for (const statement of statements) {
                await connection.execute(statement);
            }
        } finally {
            await connection.close();
        }
    };

    beforeAll(async () => {
        const properties = ConnectionPropertiesFromEnv('ORACLE');
        attributes = {
            user: properties.userName,
            password: properties.password,
            connectString: `${properties.host}:${properties.port ?? 1521}/${properties.databaseName}`
        };
        await run([new OracleGraph(GRAPH).ensuring]);
    });

    afterAll(async () => {
        await run([
            `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
            `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`
        ]);
    });

    /**
     * The first column of each row `cypher`, compiled for Oracle, gives, as JSON text; failing where they take past
     * `seconds`, which is short of the 21 seconds the parse of a `JSON_TABLE` over liberation-data/drivine4j#331's list
     * took, and far past the 15 to 200 milliseconds each of these statements takes, so a loaded machine does not fail them.
     * A statement that writes is a block that hands its rows back in one, as OracleConnection reads them, and what it
     * writes is rolled back.
     */
    const rows = async (cypher: string, seconds: number = 10): Promise<string[]> => {
        const cypherCompiled = new OracleCypherCompiler(GRAPH).compile(cypher);
        // Its parameters bound as OracleConnection binds them: a write reads them from one, `$_cy_params`.
        const compiled = new OracleSpecCompiler(
            new QuerySpecification(cypherCompiled.sql).bind(cypherCompiled.parameters).finalizedCopy('SQL')
        ).compile();
        const connection = await oracledb.getConnection(attributes);
        const sid = ((await connection.execute<[string]>("SELECT SYS_CONTEXT('USERENV', 'SID') FROM dual")).rows ??
            [])[0][0];
        let timer: NodeJS.Timeout | undefined;
        const deadline = new Promise<undefined>((resolve) => {
            timer = setTimeout(() => resolve(undefined), seconds * 1000);
        });
        const running = connection.execute<any[]>(compiled.statement, compiled.parameters, {
            fetchTypeHandler: (meta) => (meta.dbType === oracledb.DB_TYPE_CLOB ? { type: oracledb.STRING } : undefined)
        });
        try {
            const result = await Promise.race([running, deadline]);
            if (result !== undefined) {
                const written = result.rows ? undefined : (result.implicitResults?.[0] as any[][] | undefined);
                return (written ? JSON.parse(written[0][0]) : (result.rows ?? []).map((it) => it[0])).map((it: any) =>
                    JSON.stringify(it)
                );
            }
            running.catch(() => undefined);
            try {
                const admin = await oracledb.getConnection({
                    ...attributes,
                    user: 'system',
                    password: TEST_CONTAINER_PASSWORD
                });
                try {
                    const [[serial]] =
                        (await admin.execute<[number]>(`SELECT serial# FROM v$session WHERE sid = ${sid}`)).rows ?? [];
                    await admin.execute(`ALTER SYSTEM KILL SESSION '${sid},${serial}' IMMEDIATE`);
                } finally {
                    await admin.close();
                }
            } catch {
                // The session may have ended already, or no admin session be had: the connection is broken all the same.
            }
            await connection.break().catch(() => undefined);
            throw new Error(`Oracle took more than ${seconds} seconds to run: ${cypher}`);
        } finally {
            clearTimeout(timer);
            await Promise.race([
                connection.rollback().catch(() => undefined),
                new Promise((resolve) => setTimeout(resolve, 1000).unref())
            ]);
            // Not awaited past the deadline: a session still parsing would hold the close.
            const closed = connection.close().catch(() => undefined);
            await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 1000).unref())]);
        }
    };

    it('filters, sorts and reverses a list worked out item by item with temporal arithmetic, and takes its size, in moments', async () => {
        expect(await rows(`${repro} RETURN [k, size([x IN l WHERE x IS NOT NULL])] ORDER BY k`)).toEqual([
            '[0,10]',
            '[1,10]'
        ]);
        expect((await rows(`${repro} RETURN k ORDER BY size([x IN l WHERE x IS NOT NULL])`)).sort()).toEqual([
            '0',
            '1'
        ]);
        const zoned =
            "UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | datetime('2024-03-15T10:00:00Z') + duration({minutes: i})] AS l";
        expect(await rows(`${zoned} RETURN [k, size([x IN l WHERE x IS NOT NULL])] ORDER BY k`)).toEqual([
            '[0,10]',
            '[1,10]'
        ]);
        expect(
            await rows(
                `${zoned} WITH k, l WHERE k = 0 RETURN [k, all(x IN l WHERE x > datetime('2024-03-15T10:00:00Z')), size([x IN l WHERE x.minute = 1])]`
            )
        ).toEqual(['[0,true,1]']);
        expect(await rows(`${repro} WITH k, l WHERE k = 0 UNWIND l AS t RETURN count(t)`)).toEqual(['10']);
        expect(await rows(`${repro} WITH k, l WHERE k = 0 RETURN [reverse(l)[0].minute, tail(l)[0].minute]`)).toEqual([
            '[10,2]'
        ]);
        expect(await rows(`${repro} WITH collect(DISTINCT l) AS ls RETURN [size(ls), size(ls[0])]`)).toEqual([
            '[1,10]'
        ]);
    });

    it('reads a coalesce of such a list, and a list of lists of them or of maps of them, in moments', async () => {
        // 21 to 106 seconds each, before liberation-data/drivine4j#347.
        expect(await rows(`${repro} RETURN [k, size([x IN coalesce(l, []) WHERE x IS NOT NULL])] ORDER BY k`)).toEqual([
            '[0,10]',
            '[1,10]'
        ]);
        expect(
            (await rows(`${repro} RETURN k ORDER BY size([x IN coalesce(l, []) WHERE x IS NOT NULL])`)).sort()
        ).toEqual(['0', '1']);
        for (const deep of deepRepros) {
            const found = await rows(deep);
            expect(found).toHaveLength(1);
            expect([deep, found[0].startsWith('[[') && found[0].includes('2024-03-15T10:10:00')]).toEqual([deep, true]);
        }
        expect(
            await rows(`${repro} WITH collect(DISTINCT [l, l]) AS ls RETURN [size(ls), size(ls[0]), size(ls[0][0])]`)
        ).toEqual(['[1,2,10]']);
        expect(
            await rows(`${repro} WITH k, [x IN l | {t: x}] AS ms WHERE k = 0 UNWIND ms AS m RETURN count(m.t)`)
        ).toEqual(['10']);
        expect(await rows(`${repro} WITH k, {l: l} AS m WHERE k = 0 UNWIND m.l AS t RETURN count(t)`)).toEqual(['10']);
        expect(await rows(mayHoldRepros[0])).toEqual(['[0,true]', '[1,true]']);
        for (const cypher of mayHoldRepros.slice(1)) {
            expect([cypher, await rows(cypher)]).toEqual([cypher, ['10', '10']]);
        }
        expect(await rows(keyed)).toEqual(['1', '1']);
    });

    it('reads a list of temporal values a WITH takes out of an unwound map in moments', async () => {
        // No answer within 30 seconds before liberation-data/drivine4j#369; the session had to be killed.
        for (const cypher of unwoundRepros.slice(0, -2)) {
            expect([cypher, await rows(cypher)]).toEqual([cypher, ['10', '10']]);
        }
        expect(await rows(unwoundRepros[3])).toEqual(['10', '10', '10', '10']);
        // After a write, rolled back with the session's work.
        expect(await rows(unwoundRepros[4])).toEqual(['10', '10']);
    });

    it('sorts a list worked out with temporal arithmetic, by a comprehension or collect, by its moments, and in moments', async () => {
        const comprehension = `UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | ${at} + duration({minutes: i})] AS l`;
        expect(await rows(`${comprehension} RETURN k ORDER BY l`)).toEqual(['0', '1']);
        expect(await rows(`${comprehension} RETURN k ORDER BY [l]`)).toEqual(['0', '1']);
        expect(await rows(`${comprehension} RETURN [min(l)[0].hour, max(l)[0].hour]`)).toEqual(['[10,9]']);
        const collected = `UNWIND [0, 1] AS k UNWIND range(1, 3) AS i WITH k, ${at} + duration({minutes: i}) AS t WITH k, collect(t) AS l`;
        expect(await rows(`${collected} RETURN k ORDER BY l`)).toEqual(['0', '1']);
        expect(await rows(`${collected} RETURN [min(l)[0].hour, max(l)[0].hour]`)).toEqual(['[10,9]']);
    });
});
