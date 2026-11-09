import { compiledSpecification } from '@/cypher/CompiledSpecification';
import { CypherCompiler, SharedCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { cypherStatement } from '@/query/Statement';

/** A Cypher specification as the SQL stores run it: its statement compiled, the rest of it kept. */
describe('compiledSpecification', () => {
    it('names parameters given by position from 1, as a graph engine names them', () => {
        const spec = new QuerySpecification<string>(cypherStatement('MATCH (n) WHERE n.name = $1 RETURN n.age')).bind([
            'Keanu'
        ]);
        const compiled = compiledSpecification(
            spec.finalizedCopy('SQL'),
            new SharedCypherCompiler('oracle', { name: 'g' })
        );
        expect(compiled.spec.statement.language).toEqual('SQL');
        expect(compiled.spec.statement.text).toContain('$_cy_1');
        expect(compiled.spec.parameters).toEqual({ _cy_1: '"Keanu"' });
        expect(compiled.setup).toEqual([]);
    });

    it('keeps the paging and post-processors of the specification', () => {
        const spec = new QuerySpecification<number>(cypherStatement('MATCH (n) RETURN n.age'))
            .skip(2)
            .limit(3)
            .map((it) => it + 1);
        const compiled = compiledSpecification(
            spec.finalizedCopy('SQL'),
            new SharedCypherCompiler('postgres', { name: 'g' })
        ).spec;
        expect(compiled._skip).toEqual(2);
        expect(compiled._limit).toEqual(3);
        expect(compiled.postProcessors).toEqual(spec.postProcessors);
        expect(Object.isFrozen(compiled)).toBe(true);
    });

    it('gives what runs before a statement that writes on Postgres: the function it calls', () => {
        const spec = new QuerySpecification(cypherStatement('CREATE (n:A {x: $x}) RETURN n.x')).bind({ x: 1 });
        const compiled = compiledSpecification(
            spec.finalizedCopy('SQL'),
            new SharedCypherCompiler('postgres', { name: 'g' })
        );
        expect(compiled.setup).toHaveLength(1);
        expect(compiled.setup[0]).toMatch(/^CREATE OR REPLACE FUNCTION pg_temp\./);
        expect(compiled.spec.parameters).toEqual({ _cy_params: '{"x":1}' });
    });

    it('carries how the rows come back, and whether they may hold NaN, as the compiler says', () => {
        const compiler: CypherCompiler = {
            compile: () => ({ sql: 'SELECT 1', parameters: {}, setup: [], rows: 'each', nonFinite: true })
        };
        const compiled = compiledSpecification(new QuerySpecification(cypherStatement('RETURN 1 AS x')), compiler);
        expect([compiled.rows, compiled.nonFinite]).toEqual(['each', true]);
    });
});
