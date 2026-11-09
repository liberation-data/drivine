import neo4j from 'neo4j-driver';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger/DrivineLogger';
import { parametersJson, SharedCypherCompiler, SharedStore } from '@/cypher/SharedCypherCompiler';
import { CypherFloat, cypherFloat } from '@liberation-data/drivine';
import { withFloatsAsNumbers } from '@/cypher/CypherFloat';
import { Neo4jSpecCompiler } from '@/connection/neo4j/Neo4jSpecCompiler';
import { FalkorDbParameterCoercer } from '@/connection/falkordb/FalkorDbParameterCoercer';
import { QuerySpecification } from '@/query/QuerySpecification';
import { CompiledCypher } from '@/cypher/CompiledCypher';

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
        expect(parametersJson({ min: -(2 ** 63), max: 2 ** 63 })).toEqual(
            '{"min":-9223372036854775808,"max":{"$float":"9223372036854776000"}}'
        );
        expect(parametersJson({ x: 1e20, n: NaN, i: -Infinity, y: 2.5, w: 3, z: -0 })).toEqual(
            '{"x":{"$float":"100000000000000000000"},"n":{"$float":"NaN"},"i":{"$float":"-Infinity"},"y":2.5,"w":3,"z":0}'
        );
    });

    it('writes a Date as the moment Drivine binds it, and an invalid one as null', () => {
        expect(parametersJson({ d: new Date(0), x: new Date(NaN) })).toEqual(
            '{"d":{"$temporal":"DATE_TIME","text":"1970-01-01T00:00:00.000Z"},"x":null}'
        );
    });

    it('writes a CypherFloat as a float, whole or not, in a list or a map too', () => {
        expect(parametersJson({ f: cypherFloat(5), l: [cypherFloat(2.5), 3], m: { k: cypherFloat(-0) } })).toEqual(
            '{"f":{"$float":"5"},"l":[{"$float":"2.5"},3],"m":{"k":{"$float":"-0"}}}'
        );
    });
});

describe('cypherFloat', () => {
    it('is exported from the package, and writes its value as the JVM writes a double', () => {
        expect(cypherFloat(5)).toBeInstanceOf(CypherFloat);
        expect([5, 2.5, 1e20, 1e21, 1.2e-4, -0, NaN, -Infinity].map((it) => String(cypherFloat(it)))).toEqual([
            '5.0',
            '2.5',
            '1.0E20',
            '1.0E21',
            '1.2E-4',
            '-0.0',
            'NaN',
            '-Infinity'
        ]);
    });

    it('binds a whole float on a SQL store as one, where a JavaScript number binds a whole number', () => {
        const compiled = (f: any) =>
            new SharedCypherCompiler('postgres', { name: 'g' }).compile('RETURN toString($f)', { f });
        expect(compiled(cypherFloat(5)).parameters).toEqual({ _cy_f: '5.0' });
        expect(compiled(5).parameters).toEqual({ _cy_f: '5' });
        const sqlite = new SharedCypherCompiler('sqlite', { name: 'g' }).compile('RETURN $f', { f: cypherFloat(-0) });
        expect(sqlite.parameters).toEqual({ _cy_f: '-0.0' });
    });

    it('is given to a graph engine as the number it holds, at any depth, and nothing else is changed', () => {
        const at = new Date(0);
        expect(
            withFloatsAsNumbers({
                f: cypherFloat(5),
                l: [cypherFloat(1), 'x'],
                m: { k: cypherFloat(2) },
                at,
                i: neo4j.int(3)
            })
        ).toEqual({
            f: 5,
            l: [1, 'x'],
            m: { k: 2 },
            at,
            i: neo4j.int(3)
        });
        const spec = new QuerySpecification({ text: 'RETURN $f', language: 'CYPHER' }).bind({ f: cypherFloat(5) });
        expect(new Neo4jSpecCompiler(spec).formattedParams()).toEqual({ f: 5 });
        const positional = new QuerySpecification({ text: 'RETURN $1', language: 'CYPHER' }).bind([cypherFloat(5)]);
        expect(new Neo4jSpecCompiler(positional).formattedParams()).toEqual({ 1: 5 });
        expect(new FalkorDbParameterCoercer().coerce({ f: cypherFloat(5), l: [cypherFloat(2.5)] })).toEqual({
            f: 5,
            l: [2.5]
        });
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

    it("says a write's rows come back in one row on every store, Oracle's as text (oracleRowsAsText)", () => {
        const rows = (store: SharedStore): string =>
            new SharedCypherCompiler(store, { name: 'g' }).compile('CREATE (n:A) RETURN n.x').rows;
        expect(STORES.map(rows)).toEqual(['one', 'one', 'one']);
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

    it.each(STORES)('logs what the compiler warns of, as a warning, on %s', (store) => {
        const warned = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        try {
            const compiler = new SharedCypherCompiler(store, { name: 'g' });
            compiler.compile('RETURN 1 AS x');
            expect(warned).not.toHaveBeenCalled();
            compiler.compile('RETURN 1 AS a, 2 AS b');
            expect(warned).toHaveBeenCalledTimes(1);
            expect(warned.mock.calls[0][0]).toContain('The statement returns 2 items (a, b).');
        } finally {
            warned.mockRestore();
        }
    });
});

/** A compile of a statement by a package that answers `answer` to each request, loaded afresh for the compile. */
function answered(answer: string, parameters: Record<string, any> = {}): () => CompiledCypher {
    return () => {
        let compiled: CompiledCypher | undefined;
        jest.isolateModules(() => {
            jest.doMock('@liberation-data/drivine-cypher-compiler', () => ({ compile: () => answer }));
            const shared: typeof import('@/cypher/SharedCypherCompiler') = require('@/cypher/SharedCypherCompiler');
            compiled = new shared.SharedCypherCompiler('postgres', { name: 'g' }).compile('RETURN 1', parameters);
        });
        return compiled!;
    };
}

describe("The shared compiler's answer", () => {
    afterEach(() => jest.dontMock('@liberation-data/drivine-cypher-compiler'));

    it('throws a refusal as it is, and a request the compiler could not read as such, each a DrivineError', () => {
        // A DrivineError of the module loaded afresh, so known by its class's name.
        const thrown = (compile: () => unknown): [string, string] => {
            try {
                compile();
            } catch (e: any) {
                return [e.constructor.name, e.message];
            }
            return ['', ''];
        };
        expect(thrown(answered('{"refusal":"No."}'))).toEqual(['DrivineError', 'No.']);
        expect(thrown(answered('{"error":"Unexpected JSON token"}'))).toEqual([
            'DrivineError',
            "The Cypher compiler can't read the request: Unexpected JSON token"
        ]);
    });

    it('reads a float and a decimal it binds, at any depth, a whole number past 2^53 as a bigint, and no setup as none', () => {
        const compiled = answered(
            '{"sql":"SELECT 1","parameters":{"f":{"$float":"2.0"},"d":[{"$decimal":"2.50"}],' +
                '"m":{"k":{"$float":"NaN"},"$float":"x","y":1},"big":9007199254740993}}'
        )();
        expect(compiled.parameters).toEqual({
            f: 2,
            d: ['2.50'],
            m: { k: NaN, $float: 'x', y: 1 },
            big: BigInt('9007199254740993')
        });
        expect(compiled.setup).toEqual([]);
        expect(compiled.nonFinite).toBe(false);
    });

    it('leaves a count bound to null as null, where it was given as a bigint', () => {
        const compiled = answered('{"sql":"SELECT 1","parameters":{"_cyn_s":null,"_cyn_l":3}}', {
            s: BigInt(1),
            l: neo4j.int(3)
        })();
        expect(compiled.parameters).toEqual({ _cyn_s: null, _cyn_l: BigInt(3) });
    });
});
