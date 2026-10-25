import neo4j from 'neo4j-driver';
import { CypherFloat } from '@/cypher/ast/Expression';
import { jsonText } from '@/cypher/sql/JsonText';
import { javaDouble } from '@/cypher/sql/SqlCypherCompiler';

/** A parameter's value as the JSON text a SQL store binds, so it is what the Neo4j driver would send. */
describe('jsonText', () => {
    it("is the whole number the Neo4j driver's Integer holds, in a list or a map too", () => {
        expect(jsonText({ a: [neo4j.int(1), { b: neo4j.int('9007199254740993') }] })).toEqual(
            '{"a":[1,{"b":9007199254740993}]}'
        );
    });

    it("is the base64 text of a Buffer, and of an Int8Array, the Neo4j driver's bytes", () => {
        expect(jsonText(Buffer.from([1, 2, 255]))).toEqual('"AQL/"');
        expect(jsonText(new Int8Array([1, 2, -1]))).toEqual('"AQL/"');
        expect(jsonText(new Int8Array([0, 1, 2, -1]).subarray(1))).toEqual('"AQL/"');
    });

    it('is the list of the items of a Set or a Map, as the Neo4j driver sends them', () => {
        expect(jsonText(new Set([1, 'a']))).toEqual('[1,"a"]');
        expect(jsonText({ ids: new Set([neo4j.int(2)]) })).toEqual('{"ids":[2]}');
        expect(jsonText(new Map([['a', 1]]))).toEqual('[["a",1]]');
    });

    it('with whole floats, as Postgres binds them, writes a float that is a whole number in full from its shortest decimal', () => {
        expect(jsonText([new CypherFloat(2), new CypherFloat(-1e21), new CypherFloat(1e24)], true)).toEqual(
            '[2.0,-1000000000000000000000.0,1000000000000000000000000.0]'
        );
        // A float with a fraction keeps its shortest digits, with two at least where it has an exponent.
        expect(jsonText({ a: new CypherFloat(2.5), b: new CypherFloat(5e-324) }, true)).toEqual(
            '{"a":2.5,"b":4.9e-324}'
        );
        // A JavaScript number past a whole number's range is a float; one within it a whole number.
        expect(jsonText({ big: 1e21, n: 3, i: neo4j.int(4), b: BigInt(5) }, true)).toEqual(
            '{"big":1000000000000000000000.0,"n":3,"i":4,"b":5}'
        );
        expect(jsonText({ big: 1e21 })).toEqual('{"big":1e+21}');
    });
});

describe('javaDouble', () => {
    it("writes a double as Java's Double.toString does", () => {
        expect(
            [2, 1.5, 0.001, 9.99e-4, 1e7, 9999999.5, 1e-5, 5e-324, 1e21, 1.7976931348623157e308, -2.5e-320].map(
                javaDouble
            )
        ).toEqual([
            '2.0',
            '1.5',
            '0.001',
            '9.99E-4',
            '1.0E7',
            '9999999.5',
            '1.0E-5',
            '4.9E-324',
            '1.0E21',
            '1.7976931348623157E308',
            '-2.5E-320'
        ]);
        expect([0, -0, NaN, Infinity, -Infinity].map(javaDouble)).toEqual([
            '0.0',
            '-0.0',
            'NaN',
            'Infinity',
            '-Infinity'
        ]);
    });
});
