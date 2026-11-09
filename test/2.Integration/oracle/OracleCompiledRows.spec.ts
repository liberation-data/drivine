import { DatabaseRegistry, QuerySpecification } from '@liberation-data/drivine';
import { OracleConnection } from '@/connection/oracle/OracleConnection';
import { CompiledRows } from '@/cypher/CompiledCypher';
import { compiledAs } from '../../CompiledAs';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';

jest.setTimeout(60_000);

/**
 * A PL/SQL block in drivine4j's shape: `count` rows, at most 10, a row for each, in a JSON column `result`, handed
 * back as an implicit result (drivine4j's OracleCypherCompiler.returnRows).
 */
const block = (count: number): string => `
    DECLARE cy_cursor SYS_REFCURSOR;
    BEGIN
        OPEN cy_cursor FOR
            SELECT JSON_OBJECT('n' VALUE l, 's' VALUE 'x' || l RETURNING JSON) AS result
            FROM (SELECT LEVEL AS l FROM dual CONNECT BY LEVEL <= 10) WHERE l <= ${count} ORDER BY l;
        DBMS_SQL.RETURN_RESULT(cy_cursor);
    END;`;

const expected = (count: number): any[] => Array.from({ length: count }, (_, i) => ({ n: i + 1, s: `x${i + 1}` }));

/**
 * A compiled write's rows read in the shape it says they come back in, here drivine4j's, `'each'`
 * (liberation-data/drivine#673).
 */
describeOnOracle("The rows of a compiled Oracle write in drivine4j's shape", () => {
    let connection: OracleConnection;

    beforeAll(async () => {
        oraclePersistenceManager();
        connection = (await DatabaseRegistry.getInstance().connectionProvider('ORACLE')!.connect()) as OracleConnection;
        expect(connection).toBeInstanceOf(OracleConnection);
    });

    afterAll(async () => {
        await connection?.release();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    const run = async (sql: string, rows: CompiledRows): Promise<any[]> =>
        compiledAs(connection, {
            spec: new QuerySpecification({ text: sql, language: 'SQL' }),
            setup: [],
            rows,
            nonFinite: false
        });

    it.each([0, 1, 2])("should read %s rows as 'each', a row for each", async (count) => {
        expect(await run(block(count), 'each')).toEqual(expected(count));
    });

    it("should read none of them as 'one', whose rows are in a column it hasn't", async () => {
        expect(await run(block(2), 'one')).toEqual([]);
    });

    /**
     * A canary for oracle/node-oracledb#1795: in thin mode an implicit result with a JSON column gives only the rows the
     * driver prefetched, 2 by default, and no error. Fixed on node-oracledb's main (16346adb7f, 2026-11-03), in no
     * release yet. When this fails because all 10 rows came back, the driver has the fix: check NJS-126 (OSON version
     * 2) on that release, then Drivine can read drivine4j's shape and needn't ask the compiler for its own
     * (liberation-data/drivine#673). Until then, Drivine's own compiler returns a write's rows in one ('one').
     */
    it('should give only the prefetched rows of more, on a node-oracledb without the fix for #1795', async () => {
        // Fewer than all, the first of them: as many as were prefetched, whatever prefetchRows is set to.
        const rows = await run(block(10), 'each');
        expect(rows.length).toBeLessThan(10);
        expect(rows).toEqual(expected(rows.length));
    });
});
