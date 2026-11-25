import neo4j from 'neo4j-driver';
import { QuerySpecification } from '@/query';
import { Neo4jSpecCompiler } from '@/connection/neo4j/Neo4jSpecCompiler';

describe('Neo4jSpecCompiler', () => {
    const spec = new QuerySpecification().withStatement(`match (n) return count(n)`).bind([1, 'foo', 'bar', false]);

    it('should map parameters to Neo4j format', () => {
        const compiledSpec = new Neo4jSpecCompiler(spec.finalizedCopy('CYPHER')).compile();
        expect(compiledSpec.parameters).toEqual({ '1': 1, '2': 'foo', '3': 'bar', '4': false });
    });

    describe('a JavaScript Date (#810)', () => {
        const compiled = (parameters: any): any =>
            new Neo4jSpecCompiler(
                new QuerySpecification().withStatement('RETURN $at').bind(parameters).finalizedCopy('CYPHER')
            ).compile().parameters;
        const at = new Date('2026-03-04T05:06:07.089Z');

        it("binds as the driver's datetime at an offset of zero, the same instant", () => {
            const bound = compiled({ at }).at;
            expect(neo4j.isDateTime(bound)).toBe(true);
            expect(bound.toString()).toEqual('2026-03-04T05:06:07.089000000Z');
            expect([bound.timeZoneOffsetSeconds, bound.timeZoneId ?? null]).toEqual([0, null]);
            expect(new Date(bound.toString()).getTime()).toEqual(at.getTime());
        });

        it('binds in a list, a map and a positional parameter', () => {
            const bound = compiled({ props: { at, list: [at] } }).props;
            expect(neo4j.isDateTime(bound.at)).toBe(true);
            expect(neo4j.isDateTime(bound.list[0])).toBe(true);
            expect(neo4j.isDateTime(compiled([at])['1'])).toBe(true);
        });

        it('binds an invalid Date as null', () => {
            expect(compiled({ at: new Date(Number.NaN) }).at).toBeNull();
        });
    });
});
