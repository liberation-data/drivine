import { QuerySpecification } from '@/query';
import { Neo4jSpecCompiler } from '@/connection/neo4j/Neo4jSpecCompiler';

describe('Neo4jSpecCompiler', () => {
    const spec = new QuerySpecification().withStatement(`match (n) return count(n)`).bind([1, 'foo', 'bar', false]);

    it('should map parameters to Neo4j format', () => {
        const compiledSpec = new Neo4jSpecCompiler(spec.finalizedCopy('CYPHER')).compile();
        expect(compiledSpec.parameters).toEqual({ '1': 1, '2': 'foo', '3': 'bar', '4': false });
    });
});
