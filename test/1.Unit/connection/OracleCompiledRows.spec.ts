import { OracleConnection } from '@/connection/oracle/OracleConnection';
import { OracleResultMapper } from '@/connection/oracle/OracleResultMapper';
import { QuerySpecification } from '@/query/QuerySpecification';
import { CompiledSpecification } from '@/cypher/CompiledSpecification';
import { CompiledRows } from '@/cypher/CompiledCypher';
import { compiledAs } from '../../CompiledAs';

/** A session whose every statement gives `result`, as node-oracledb gives it. */
function session(result: unknown): { execute: jest.Mock } {
    return { execute: jest.fn(async () => Promise.resolve(result)) };
}

const connection = (it: { execute: jest.Mock }): OracleConnection =>
    new OracleConnection(it as any, new OracleResultMapper(), 'oracle.1', `rows_${Date.now()}`, 'db|me');

/** A PL/SQL block, compiled already, whose rows come back in the shape `rows`. */
const block = (rows: CompiledRows): CompiledSpecification<unknown> => ({
    spec: new QuerySpecification({ text: 'BEGIN NULL; END;', language: 'SQL' }),
    setup: [],
    rows,
    nonFinite: false
});

/**
 * An implicit result of Drivine's own compiler: one row, its column `rows:json` the rows as JSON text, a CLOB read as
 * text (see OracleCypherCompiler.returnRows).
 */
const ONE = { implicitResults: [[{ 'rows:json': '[1, {"a": [2, "x"]}, null]' }]] };

/** An implicit result of drivine4j's compiler: a row for each, in a JSON column `result`, which Oracle names `RESULT`. */
const EACH = { implicitResults: [[{ RESULT: 1 }, { RESULT: { a: [2, 'x'] } }, { RESULT: null }]] };

/**
 * Which rows a compiled write's implicit result gives, by the shape the compiler says it has, and never by a column's
 * name (liberation-data/drivine#673).
 */
describe('The rows of a compiled Oracle write', () => {
    it("should read 'one' as the items of the one row's rows:json", async () => {
        expect(await compiledAs(connection(session(ONE)), block('one'))).toEqual([1, { a: [2, 'x'] }, null]);
    });

    it("should read 'each' as a row for each row of the implicit result, its RESULT's value", async () => {
        expect(await compiledAs(connection(session(EACH)), block('each'))).toEqual([1, { a: [2, 'x'] }, null]);
    });

    it("should read 'each' with one row, and with none", async () => {
        expect(
            await compiledAs(connection(session({ implicitResults: [[{ RESULT: { n: 1 } }]] })), block('each'))
        ).toEqual([{ n: 1 }]);
        expect(await compiledAs(connection(session({ implicitResults: [[]] })), block('each'))).toEqual([]);
        expect(await compiledAs(connection(session({})), block('each'))).toEqual([]);
    });

    it('should not pick the shape by the name of a column', async () => {
        // A RESULT column read as 'one' has no rows, and a rows:json column read as 'each' is one row: its array.
        expect(await compiledAs(connection(session(EACH)), block('one'))).toEqual([]);
        expect(await compiledAs(connection(session(ONE)), block('each'))).toEqual([[1, { a: [2, 'x'] }, null]]);
    });

    it.each(['one', 'each'] as const)(
        "should read a compiled read's rows as they are, said to be '%s'",
        async (rows) => {
            const read = { rows: [{ RESULT: 1 }, { RESULT: { a: 2 } }] };
            expect(await compiledAs(connection(session(read)), block(rows))).toEqual([1, { a: 2 }]);
        }
    );

    it("should keep a compiled statement out of the driver's cache, as a Cypher statement is", async () => {
        const it = session(EACH);
        await compiledAs(connection(it), block('each'));
        expect(it.execute.mock.calls[0][2].keepInStmtCache).toBe(false);
    });

    it("should read a Cypher write compiled by the shared compiler as 'each'", async () => {
        const it = session(EACH);
        const rows = await connection(it).query(
            new QuerySpecification({ text: 'CREATE (n:T) RETURN n.x AS x', language: 'CYPHER' })
        );
        expect(it.execute.mock.calls.at(-1)[0]).toContain('DBMS_SQL.RETURN_RESULT');
        expect(rows).toEqual([1, { a: [2, 'x'] }, null]);
    });

    it("should hand back a SQL block's implicit result as it is, whatever its columns are named", async () => {
        const sql = new QuerySpecification('BEGIN NULL; END;');
        expect(await connection(session(ONE)).query(sql)).toEqual([[1, { a: [2, 'x'] }, null]]);
        expect(await connection(session(EACH)).query(sql)).toEqual([1, { a: [2, 'x'] }, null]);
    });
});
