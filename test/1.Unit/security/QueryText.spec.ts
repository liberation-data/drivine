import {
    NodeFragment,
    NodeId,
    PropertyBag,
    ModelRegistry,
    GraphObjectMapper,
    QuerySpecification
} from '@liberation-data/drivine';
import { quoteName, quoteString } from '@/backend/Cypher';
import { hasLabels } from '@/backend/oracle/OracleGraph';

/**
 * What Drivine writes into query text from names and values that may come from data. A backtick escaped as \u0060
 * closed a quoted name on Neo4j, which decodes the escape before it reads the quoting.
 */
describe('query text from data', () => {
    describe('quoteName', () => {
        it('should leave a plain name as it is, and quote another, doubling its backticks', () => {
            expect(quoteName('name')).toEqual('name');
            expect(quoteName('first name')).toEqual('`first name`');
            expect(quoteName('a`b')).toEqual('`a``b`');
        });

        it('should double a backtick written as its escape, which Neo4j decodes before it reads the quoting', () => {
            expect(quoteName('x\\u0060 , 42 AS injected //')).toEqual('`x`` , 42 AS injected //`');
            expect(quoteName('NoSuchLabel\\u0060 OR true OR n:\\u0060Y')).toEqual('`NoSuchLabel`` OR true OR n:``Y`');
        });

        it('should keep a backslash that escapes nothing, as drivine4j does', () => {
            expect(quoteName('back\\slash')).toEqual('`back\\slash`');
        });
    });

    describe('quoteString', () => {
        it('should write an index name as a string, escaping its quotes', () => {
            expect(quoteString('Doc_embedding_vector')).toEqual("'Doc_embedding_vector'");
            expect(quoteString("it's")).toEqual("'it\\'s'");
        });

        it('should escape a backslash before a quote, so neither a quote nor the escape of one ends the string', () => {
            expect(quoteString("x\\', 42 AS injected //")).toEqual("'x\\\\\\', 42 AS injected //'");
            expect(quoteString('back\\slash')).toEqual("'back\\\\slash'");
        });
    });

    describe("Oracle's label test", () => {
        it('should escape a backslash before the quotes, for the JSON path string and the SQL literal', () => {
            expect(hasLabels('n', ['a\\b'])).toEqual(`JSON_EXISTS(n.labels, '$?(@ == "a\\\\b")')`);
            expect(hasLabels('n', [`x"y'z`])).toEqual(`JSON_EXISTS(n.labels, '$?(@ == "x\\"y''z")')`);
            expect(hasLabels('n', ['x\\") || 1'])).toEqual(`JSON_EXISTS(n.labels, '$?(@ == "x\\\\\\") || 1")')`);
        });

        it("should escape a label after the first alike, in the text it's found in", () => {
            expect(hasLabels('n', ['A', `x\\"') > 0 OR 1 = 1 --`])).toEqual(
                `JSON_EXISTS(n.labels, '$?(@ == "A")') AND INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(n.labels), ']'), '[') || ',"', ',"x\\\\\\"'') > 0 OR 1 = 1 --","') > 0`
            );
        });
    });

    describe('skip and limit', () => {
        it('should take whole numbers of at least 0, and nothing', () => {
            const spec = new QuerySpecification('MATCH (n) RETURN n').skip(0).limit(10);
            expect([spec._skip, spec._limit]).toEqual([0, 10]);
            expect(new QuerySpecification('RETURN 1').skip(undefined)._skip).toBeUndefined();
        });

        it('should refuse anything else, which would be written into the statement as it is', () => {
            const injected = '1 WITH 1 AS x MATCH (n) DETACH DELETE n RETURN x' as unknown as number;
            for (const count of [injected, -1, 1.5, NaN, Infinity]) {
                expect(() => new QuerySpecification('RETURN 1').limit(count)).toThrow(/whole number/);
                expect(() => new QuerySpecification('RETURN 1').skip(count)).toThrow(/whole number/);
            }
        });
    });

    describe('mapping a row', () => {
        @NodeFragment({ labels: ['Bagged'] })
        class Bagged {
            @NodeId() id: string;
            name: string;
            @PropertyBag() metadata: Record<string, any> = {};
        }

        it('should copy no property bag entry or field under __proto__, constructor or prototype', () => {
            const mapper = new GraphObjectMapper();
            const model = new ModelRegistry().fragment(Bagged);
            // A bag's entries are stored under its namespace: here an entry named __proto__ and a field named so.
            const props = JSON.parse(
                '{"id": "1", "name": "n", "metadata.colour": "red", "metadata.__proto__": {"admin": true}, ' +
                    '"metadata.constructor": "c", "__proto__": {"admin": true}}'
            );
            const bagged = mapper.fragment<Bagged>(model, { props, labels: ['Bagged'] });
            expect(bagged.metadata).toEqual({ colour: 'red' });
            expect((bagged.metadata as any).admin).toBeUndefined();
            expect(Object.getPrototypeOf(bagged.metadata)).toBe(Object.prototype);
            expect(bagged).toBeInstanceOf(Bagged);
            expect((bagged as any).admin).toBeUndefined();
        });
    });
});
