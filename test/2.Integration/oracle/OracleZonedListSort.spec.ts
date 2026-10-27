import * as oracledb from 'oracledb';
import { ConnectionPropertiesFromEnv } from '@liberation-data/drivine';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { TEST_CONTAINER_PASSWORD } from '@/testing';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(120_000);

/** liberation-data/drivine4j#331's statement: a list worked out item by item with temporal arithmetic, by a comprehension. */
const repro =
    "UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | localdatetime('2024-03-15T10:00:00') + duration({minutes: i})] AS l";

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

    beforeAll(() => {
        const properties = ConnectionPropertiesFromEnv('ORACLE');
        attributes = {
            user: properties.userName,
            password: properties.password,
            connectString: `${properties.host}:${properties.port ?? 1521}/${properties.databaseName}`
        };
    });

    /**
     * The first column of each row `cypher`, compiled for Oracle, gives, as JSON text; failing where they take past
     * `seconds`, which is short of the 21 seconds the parse of a `JSON_TABLE` over liberation-data/drivine4j#331's list
     * took, and far past the 15 to 200 milliseconds each of these statements takes, so a loaded machine does not fail them.
     */
    const rows = async (cypher: string, seconds: number = 10): Promise<string[]> => {
        const compiled = new OracleCypherCompiler('cypher').compile(cypher);
        const connection = await oracledb.getConnection(attributes);
        const sid = ((await connection.execute<[string]>("SELECT SYS_CONTEXT('USERENV', 'SID') FROM dual")).rows ??
            [])[0][0];
        let timer: NodeJS.Timeout | undefined;
        const deadline = new Promise<undefined>((resolve) => {
            timer = setTimeout(() => resolve(undefined), seconds * 1000);
        });
        const running = connection.execute<any[]>(compiled.sql, compiled.parameters);
        try {
            const result = await Promise.race([running, deadline]);
            if (result !== undefined) {
                return (result.rows ?? []).map((it) => JSON.stringify(it[0]));
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
