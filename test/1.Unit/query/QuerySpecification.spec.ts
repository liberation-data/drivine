
import { DatabaseType, QuerySpecification } from '@liberation-data/drivine';

describe('QuerySpecification', () => {
    describe('When binding parameters', () => {
        const spec = new QuerySpecification().withStatement(`match (n) return count(n)`).bind([1, 'foo', 'bar', false]);

        it('should serialize to AgensGraph format', () => {
            const map: any[] = spec.mapParameters(DatabaseType.AGENS_GRAPH);
            expect(map[0]).toEqual('1');
            expect(map[1]).toEqual('"foo"');
            expect(map[2]).toEqual('"bar"');
            expect(map[3]).toEqual('false');
        });

        it('should serialize to Neo4j format', () => {
            const map: any = spec.mapParameters(DatabaseType.NEO4J);
            expect(map).toEqual({ '1': 1, '2': 'foo', '3': 'bar', '4': false });
        });
    });
});
