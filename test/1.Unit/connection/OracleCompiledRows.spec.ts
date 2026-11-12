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
 * An implicit result of the shared compiler with `oracleRowsAsText`: one row, its column `rows:json` the rows as JSON
 * text, a CLOB read as text.
 */
const ONE = { implicitResults: [[{ 'rows:json': '[1, {"a": [2, "x"]}, null]' }]] };

/** An implicit result of the shared compiler otherwise: a row for each, in a JSON column `result`, which Oracle names `RESULT`. */
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
        "should read a compiled read's rows from their extended JSON text, said to be '%s' (#737)",
        async (rows) => {
            const read = {
                rows: [
                    { RESULT: '1' },
                    { RESULT: '{"a":2}' },
                    { RESULT: '9007199254740993' },
                    { RESULT: '{"$numberDouble":2.5}' },
                    { RESULT: '[{"$numberDouble":"Nan"}]' },
                    { RESULT: '"9007199254740993"' },
                    { RESULT: null }
                ]
            };
            expect(await compiledAs(connection(session(read)), block(rows))).toEqual([
                1,
                { a: 2 },
                BigInt('9007199254740993'),
                2.5,
                [NaN],
                '9007199254740993',
                null
            ]);
        }
    );

    it("should keep a compiled statement out of the driver's cache, as a Cypher statement is", async () => {
        const it = session(EACH);
        await compiledAs(connection(it), block('each'));
        expect(it.execute.mock.calls[0][2].keepInStmtCache).toBe(false);
    });

    it("should read a Cypher write compiled by the shared compiler as 'one', its rows as text", async () => {
        const it = session(ONE);
        const rows = await connection(it).query(
            new QuerySpecification({ text: 'CREATE (n:T) RETURN n.x AS x', language: 'CYPHER' })
        );
        expect(it.execute.mock.calls.at(-1)[0]).toContain('AS "rows:json"');
        expect(rows).toEqual([1, { a: [2, 'x'] }, null]);
    });

    it("should read a float, NaN and the infinities of Oracle's extended JSON in a write's rows, at any depth", async () => {
        const floats = {
            implicitResults: [
                [
                    {
                        'rows:json':
                            '[{"$numberDouble": 2}, [{"$numberDouble": 2.5}, {"$numberDouble": "Nan"}], ' +
                            '{"k": {"$numberDouble": "Inf"}, "l": {"$numberDouble": "-Inf"}}, ' +
                            '{"$numberDouble": "x"}, {"$numberDouble": "constructor"}, {"$numberDouble": 1, "y": 2}, "2026-01-02T03:04:05.123Z"]'
                    }
                ]
            ]
        };
        const rows = await compiledAs(connection(session(floats)), block('one'));
        expect(rows).toEqual([
            2,
            [2.5, NaN],
            { k: Infinity, l: -Infinity },
            { $numberDouble: 'x' },
            { $numberDouble: 'constructor' },
            { $numberDouble: 1, y: 2 },
            '2026-01-02T03:04:05.123Z'
        ]);
    });

    it("should hand back a SQL block's implicit result as it is, whatever its columns are named", async () => {
        const sql = new QuerySpecification('BEGIN NULL; END;');
        expect(await connection(session(ONE)).query(sql)).toEqual([[1, { a: [2, 'x'] }, null]]);
        expect(await connection(session(EACH)).query(sql)).toEqual([1, { a: [2, 'x'] }, null]);
    });
});
