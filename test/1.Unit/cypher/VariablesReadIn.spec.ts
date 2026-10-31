import { CypherReader } from '@/cypher/CypherReader';
import { Return } from '@/cypher/ast/Query';
import { variablesReadIn } from '@/cypher/sql/CypherSyntax';

/** The variables the one item of `RETURN <expression>` reads of the scope it is in, sorted. */
function readIn(expression: string): string[] {
    const clauses = CypherReader.read(`RETURN ${expression} AS x`).clauses;
    return [...variablesReadIn((clauses[clauses.length - 1] as Return).projection.items[0].expression)].sort();
}

/**
 * variablesReadIn, which tells a pattern comprehension whose body reads none of its pattern's own variables (#486): a
 * name a comprehension, a quantifier or a reduce binds for itself is not read of the scope, but its list is.
 */
describe('variablesReadIn', () => {
    it("leaves out a name a binder binds for itself, and reads a binder's list of the scope", () => {
        expect(readIn('[m IN [p.name] | m]')).toEqual(['p']);
        expect(readIn('[m IN [m.name] | m]')).toEqual(['m']);
        expect(readIn('[x IN [1] WHERE m IS NOT NULL | p]')).toEqual(['m', 'p']);
        expect(readIn('any(m IN [p.name] WHERE m = 1)')).toEqual(['p']);
        expect(readIn('any(m IN [m.name] WHERE m = 1)')).toEqual(['m']);
        expect(readIn("reduce(m = '', x IN [1] | m + x + p.name)")).toEqual(['p']);
        expect(readIn('reduce(acc = m.name, x IN [n] | acc)')).toEqual(['m', 'n']);
    });

    it("reads a pattern's variables, and a map projection's", () => {
        expect(readIn('[(p)-->(m) | [m IN [q] | m]]')).toEqual(['m', 'p', 'q']);
        expect(readIn('EXISTS { (p)-->(m) }')).toEqual(['m', 'p']);
        expect(readIn('p {.name, r, n: [r IN [1] | r]}')).toEqual(['p', 'r']);
    });
});
