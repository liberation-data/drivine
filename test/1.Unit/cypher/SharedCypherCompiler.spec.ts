import neo4j from 'neo4j-driver';
import { DrivineError } from '@/DrivineError';
import { parametersJson, SharedCypherCompiler, SharedStore } from '@/cypher/SharedCypherCompiler';

const STORES: SharedStore[] = ['postgres', 'oracle', 'sqlite'];

/**
 * A statement's parameters as the shared compiler reads them: tagged JSON that keeps the kinds plain JSON loses, so a
 * value the Neo4j driver would send is bound as it sends it (once `jsonText`, beside Drivine's own compiler).
 */
describe('parametersJson', () => {
    it("writes the whole number the Neo4j driver's Integer holds, and a bigint, as digits, in a list or a map too", () => {
        expect(
            parametersJson({ a: [neo4j.int(1), { b: neo4j.int('9007199254740993') }], c: BigInt(2) ** BigInt(70) })
        ).toEqual('{"a":[1,{"b":9007199254740993}],"c":1180591620717411303424}');
    });

    it("writes the base64 text of a Buffer and of an Int8Array, the Neo4j driver's bytes, as bytes", () => {
        expect(parametersJson({ b: Buffer.from([1, 2, 255]), i: new Int8Array([0, 1, 2, -1]).subarray(1) })).toEqual(
            '{"b":{"$bytes":"AQL/"},"i":{"$bytes":"AQL/"}}'
        );
    });

    it('writes the list of the items of a Set or a Map, as the Neo4j driver sends them', () => {
        expect(parametersJson({ s: new Set([1, 'a']), m: new Map([['a', 1]]), ids: new Set([neo4j.int(2)]) })).toEqual(
            '{"s":[1,"a"],"m":[["a",1]],"ids":[2]}'
        );
    });

    it('wraps a map with a key that starts with $, so no map a caller binds is read as a tag, and leaves out an undefined key', () => {
        expect(parametersJson({ k: { $k: 1, u: undefined }, $numberDouble: '2' })).toEqual(
            '{"$map":{"k":{"$map":{"$k":1}},"$numberDouble":"2"}}'
        );
    });

    it("writes a whole JavaScript number past a whole number's range, NaN and the infinities as floats", () => {
        // The Neo4j driver sends 1e20 as a float (liberation-data/drivine#378).
        expect(parametersJson({ x: 1e20, n: NaN, i: -Infinity, y: 2.5, w: 3, z: -0 })).toEqual(
            '{"x":{"$float":"100000000000000000000"},"n":{"$float":"NaN"},"i":{"$float":"-Infinity"},"y":2.5,"w":3,"z":0}'
        );
    });

    it('writes a Date as the moment Drivine binds it, and an invalid one as null', () => {
        expect(parametersJson({ d: new Date(0), x: new Date(NaN) })).toEqual(
            '{"d":{"$temporal":"DATE_TIME","text":"1970-01-01T00:00:00.000Z"},"x":null}'
        );
    });
});

describe('SharedCypherCompiler', () => {
    it.each(STORES)("binds a count given as the Neo4j driver's Integer or a bigint as a bigint on %s", (store) => {
        for (const count of [neo4j.int(2), BigInt(2)]) {
            const compiled = new SharedCypherCompiler(store, { name: 'g' }).compile('MATCH (n) RETURN n SKIP $s', {
                s: count
            });
            expect(compiled.parameters._cyn_s).toBe(BigInt(2));
        }
        expect(
            new SharedCypherCompiler(store, { name: 'g' }).compile('MATCH (n) RETURN n SKIP $s', { s: 2 }).parameters
                ._cyn_s
        ).toBe(2);
    });

    it.each(STORES)('throws what the compiler refuses on %s as a DrivineError', (store) => {
        const compiler = new SharedCypherCompiler(store, { name: 'g' });
        expect(() => compiler.compile('CREATE POINT INDEX FOR (p:Place) ON (p.location)')).toThrow(DrivineError);
        expect(() => compiler.compile('CREATE POINT INDEX FOR (p:Place) ON (p.location)')).toThrow(
            "A POINT index is Neo4j's, and is not made on a SQL store."
        );
    });

    it('says a write on Oracle hands back a row for each, and on Postgres and SQLite rows as any statement', () => {
        const rows = (store: SharedStore): string =>
            new SharedCypherCompiler(store, { name: 'g' }).compile('CREATE (n:A) RETURN n.x').rows;
        expect(STORES.map(rows)).toEqual(['one', 'each', 'one']);
    });

    it('says whether it was given NaN or an infinity', () => {
        const compiler = new SharedCypherCompiler('postgres', { name: 'g' });
        expect(compiler.compile('RETURN $x AS x', { x: NaN }).nonFinite).toBe(true);
        expect(compiler.compile('RETURN $x AS x', { x: 1.5 }).nonFinite).toBe(false);
    });

    it("says which of an Oracle graph's stored functions the last statement calls, and calls none the store doesn't keep", () => {
        const cypher = "RETURN toString(date('-0044-03-15') + duration('P1D'))";
        const stored = new SharedCypherCompiler('oracle', { name: 'g' });
        expect(stored.compile(cypher).sql).toContain('g_era(');
        expect(stored.callsStoredEra).toBe(true);
        stored.compile('RETURN 1 AS x');
        expect(stored.callsStoredEra).toBe(false);
        const inline = new SharedCypherCompiler('oracle', { name: 'g', eraStored: false });
        expect(inline.compile(cypher).sql).not.toContain('_era');
        expect(inline.callsStoredEra).toBe(false);
    });
});
