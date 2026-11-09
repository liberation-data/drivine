import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';
import { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { drained } from '@/cypher/sql/JsonText';

function* letters(): Generator<string> {
    yield 'a';
    yield 'b';
}

const COMPILERS: [string, () => SqlCypherCompiler][] = [
    ['Postgres', () => new PostgresCypherCompiler('g')],
    ['Oracle', () => new OracleCypherCompiler('g')],
    ['SQLite', () => new SqliteCypherCompiler('g')]
];

// A one-shot iterator nested in a parameter is bound as its items, as an array is (drivine#408, drivine#662).
describe('An iterator in a compiled statement parameter', () => {
    describe.each(COMPILERS)('on %s', (_, compiler) => {
        it("in a map a read looks into, is bound as an array's items", () => {
            const cypher = 'MATCH (n) WHERE n.id IN $p.ids RETURN n';
            expect(compiler().compile(cypher, { p: { ids: letters() } }).parameters).toEqual(
                compiler().compile(cypher, { p: { ids: ['a', 'b'] } }).parameters
            );
        });

        it("in a row a write reads, is written as an array's items", () => {
            const cypher = 'UNWIND $rows AS row MATCH (a:L {id: row.id}) SET a.t = row.t';
            expect(compiler().compile(cypher, { rows: [{ id: 1, t: letters() }] }).parameters).toEqual(
                compiler().compile(cypher, { rows: [{ id: 1, t: ['a', 'b'] }] }).parameters
            );
        });

        it("in a Set in a map, and from map.values(), is bound as an array's items", () => {
            const cypher = 'MATCH (n) WHERE n.id IN $p.ids RETURN n';
            const values = new Map([
                [1, 'a'],
                [2, 'b']
            ]).values();
            expect(compiler().compile(cypher, { p: { ids: values } }).parameters).toEqual(
                compiler().compile(cypher, { p: { ids: ['a', 'b'] } }).parameters
            );
            expect(compiler().compile(cypher, { p: { ids: new Set([letters()]) } }).parameters).toEqual(
                compiler().compile(cypher, { p: { ids: [['a', 'b']] } }).parameters
            );
        });
    });
});

describe('drained', () => {
    it('keeps the parameters themselves where no iterator is in them', () => {
        const ids = new Set(['a']);
        const parameters = { p: { ids, at: new Date(0) }, bytes: Buffer.from([1]) };
        expect(drained(parameters)).toBe(parameters);
    });

    it("turns an iterator at any depth into its items' array, and leaves the given parameters as they are", () => {
        const given = { p: { rows: [{ t: letters() }] }, q: 1 };
        const result = drained(given);
        expect(result).toEqual({ p: { rows: [{ t: ['a', 'b'] }] }, q: 1 });
        expect(result.q).toBe(1);
        expect(given.p.rows[0].t).not.toEqual(['a', 'b']);
    });
});
