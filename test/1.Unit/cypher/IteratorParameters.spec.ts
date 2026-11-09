import { int } from 'neo4j-driver';
import { CypherFloat } from '@/cypher/CypherFloat';
import { compiledSpecification, cypherParameters, drained } from '@/cypher/CompiledSpecification';
import { SharedCypherCompiler, SharedStore } from '@/cypher/SharedCypherCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { cypherStatement } from '@/query/Statement';

function* letters(): Generator<string> {
    yield 'a';
    yield 'b';
}

const STORES: SharedStore[] = ['postgres', 'oracle', 'sqlite'];

/** The parameters `cypher` binds on `store`, given `parameters`. */
const bound = (store: SharedStore, cypher: string, parameters: Record<string, any>): unknown =>
    compiledSpecification(
        new QuerySpecification(cypherStatement(cypher)).bind(parameters),
        new SharedCypherCompiler(store, { name: 'g' })
    ).spec.parameters;

// A one-shot iterator nested in a parameter is bound as its items, as an array is (drivine#408, drivine#662).
describe('An iterator in a compiled statement parameter', () => {
    describe.each(STORES)('on %s', (store) => {
        it("in a map a read looks into, is bound as an array's items", () => {
            const cypher = 'MATCH (n) WHERE n.id IN $p.ids RETURN n';
            expect(bound(store, cypher, { p: { ids: letters() } })).toEqual(
                bound(store, cypher, { p: { ids: ['a', 'b'] } })
            );
        });

        it("in a row a write reads, is written as an array's items", () => {
            const cypher = 'UNWIND $rows AS row MATCH (a:L {id: row.id}) SET a.t = row.t';
            expect(bound(store, cypher, { rows: [{ id: 1, t: letters() }] })).toEqual(
                bound(store, cypher, { rows: [{ id: 1, t: ['a', 'b'] }] })
            );
        });

        it("in a map each query of a UNION looks into, is bound as an array's items", () => {
            const cypher =
                'MATCH (n) WHERE n.id IN $p.ids RETURN n.id AS id UNION MATCH (m) WHERE m.id IN $p.ids RETURN m.id AS id';
            expect(bound(store, cypher, { p: { ids: letters() } })).toEqual(
                bound(store, cypher, { p: { ids: ['a', 'b'] } })
            );
        });

        it("in a Set in a map, and from map.values(), is bound as an array's items", () => {
            const cypher = 'MATCH (n) WHERE n.id IN $p.ids RETURN n';
            const values = new Map([
                [1, 'a'],
                [2, 'b']
            ]).values();
            expect(bound(store, cypher, { p: { ids: values } })).toEqual(
                bound(store, cypher, { p: { ids: ['a', 'b'] } })
            );
            expect(bound(store, cypher, { p: { ids: new Set([letters()]) } })).toEqual(
                bound(store, cypher, { p: { ids: [['a', 'b']] } })
            );
        });

        it("is bound as its items by a second compile of the statement's parameters, too", () => {
            const cypher = 'MATCH (n) WHERE n.id IN $p.ids RETURN n';
            const spec = new QuerySpecification(cypherStatement(cypher)).bind({ p: { ids: letters() } });
            const parameters = cypherParameters(spec);
            const compile = (): unknown =>
                compiledSpecification(spec, new SharedCypherCompiler(store, { name: 'g' }), parameters).spec.parameters;
            const first = compile();
            expect(compile()).toEqual(first);
            expect(first).toEqual(bound(store, cypher, { p: { ids: ['a', 'b'] } }));
        });
    });
});

describe('cypherParameters', () => {
    it('names parameters given by position from 1, with each iterator in them its items', () => {
        const spec = new QuerySpecification(cypherStatement('RETURN $1, $2')).bind(['x', letters()]);
        expect(cypherParameters(spec)).toEqual({ '1': 'x', '2': ['a', 'b'] });
    });
});

describe('drained', () => {
    it('keeps the parameters themselves where no iterator is in them', () => {
        const ids = new Set(['a']);
        const parameters = {
            p: { ids, at: new Date(0), n: int(1), f: new CypherFloat(2), rows: [[1, undefined]] },
            bytes: Buffer.from([1]),
            driverBytes: new Int8Array([1]),
            byId: new Map([['a', [1]]])
        };
        expect(drained(parameters)).toBe(parameters);
    });

    it("turns an iterator at any depth into its items' array, and leaves the given parameters as they are", () => {
        const given = { p: { rows: [{ t: letters() }] }, q: 1 };
        const result = drained(given);
        expect(result).toEqual({ p: { rows: [{ t: ['a', 'b'] }] }, q: 1 });
        expect(result.q).toBe(1);
        expect(given.p.rows[0].t).not.toEqual(['a', 'b']);
    });

    it("turns an iterator in a Map's value into its items' array, as the Map's entries are written", () => {
        expect(drained({ byId: new Map([['x', letters()]]) })).toEqual({ byId: [['x', ['a', 'b']]] });
    });

    it('turns an iterator given as a parameter itself into its items', () => {
        expect(drained({ ids: letters() })).toEqual({ ids: ['a', 'b'] });
    });
});
