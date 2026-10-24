import neo4j from 'neo4j-driver';
import { jsonText } from '@/cypher/sql/JsonText';

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
});
