import { compiledSpecification } from '@/cypher/sql/CompiledSpecification';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { cypherStatement } from '@/query/Statement';

/** A Cypher specification as the SQL stores run it: its statement compiled, the rest of it kept. */
describe('compiledSpecification', () => {
    it('names parameters given by position from 1, as a graph engine names them', () => {
        const spec = new QuerySpecification<string>(cypherStatement('MATCH (n) WHERE n.name = $1 RETURN n.age')).bind([
            'Keanu'
        ]);
        const compiled = compiledSpecification(spec.finalizedCopy('SQL'), new OracleCypherCompiler('g'));
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
        const compiled = compiledSpecification(spec.finalizedCopy('SQL'), new PostgresCypherCompiler('g')).spec;
        expect(compiled._skip).toEqual(2);
        expect(compiled._limit).toEqual(3);
        expect(compiled.postProcessors).toEqual(spec.postProcessors);
        expect(Object.isFrozen(compiled)).toBe(true);
    });

    it('gives what runs before a statement that writes on Postgres: the function it calls', () => {
        const spec = new QuerySpecification(cypherStatement('CREATE (n:A {x: $x}) RETURN n.x')).bind({ x: 1 });
        const compiled = compiledSpecification(spec.finalizedCopy('SQL'), new PostgresCypherCompiler('g'));
        expect(compiled.setup).toHaveLength(1);
        expect(compiled.setup[0]).toMatch(/^CREATE OR REPLACE FUNCTION pg_temp\./);
        expect(compiled.spec.parameters).toEqual({ _cy_params: '{"x":1}' });
    });

    it('holds the parameters of a statement that writes on Oracle as text, read as JSON where each is read', () => {
        // Oracle crashed the session where a block read a value past 32 KB more than once from a JSON variable (#308).
        const spec = new QuerySpecification(cypherStatement('MATCH (n) SET n.a = $a')).bind({ a: 'x' });
        const sql = compiledSpecification(spec.finalizedCopy('SQL'), new OracleCypherCompiler('g')).spec.statement.text;
        expect(sql).toContain('cy_params CLOB := $_cy_params;');
        expect(sql).not.toContain('cy_params JSON');
        expect(sql).toContain("JSON_QUERY(cy_params, '$.a' RETURNING JSON)");
    });
});
