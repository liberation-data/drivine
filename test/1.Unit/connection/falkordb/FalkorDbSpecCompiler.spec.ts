import { QuerySpecification } from '@liberation-data/drivine';
import { FalkorDbSpecCompiler } from '@/connection/falkordb/FalkorDbSpecCompiler';

describe('FalkorDbSpecCompiler', () => {
    it('should pass named parameters through, coerced', () => {
        const spec = new QuerySpecification(`MATCH (n {name: $name}) RETURN n`)
            .bind({ name: 'Moon Girl', at: new Date(0) })
            .finalizedCopy('CYPHER');
        const compiled = new FalkorDbSpecCompiler(spec).compile();
        expect(compiled.statement).toEqual('MATCH (n {name: $name}) RETURN n');
        expect(compiled.parameters).toEqual({ name: 'Moon Girl', at: '1970-01-01T00:00:00.000000000Z' });
    });

    it('should bind positional parameters as $p1, $p2', () => {
        const spec = new QuerySpecification(`MATCH (a {name: $1})-->(b {name: $2}) RETURN b`)
            .bind(['a', 'b'])
            .finalizedCopy('CYPHER');
        const compiled = new FalkorDbSpecCompiler(spec).compile();
        expect(compiled.statement).toEqual('MATCH (a {name: $p1})-->(b {name: $p2}) RETURN b');
        expect(compiled.parameters).toEqual({ p1: 'a', p2: 'b' });
    });

    it('should apply skip and limit', () => {
        const spec = new QuerySpecification(`MATCH (n) RETURN n`).skip(5).limit(10).finalizedCopy('CYPHER');
        expect(new FalkorDbSpecCompiler(spec).compile().statement).toEqual('MATCH (n) RETURN n SKIP 5 LIMIT 10');
    });

    it('should refuse SQL', () => {
        const spec = new QuerySpecification(`select 1`).finalizedCopy('SQL');
        expect(() => new FalkorDbSpecCompiler(spec)).toThrow(/SQL is not supported on FalkorDB/);
    });
});
