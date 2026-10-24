import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { Stamps } from '@/model/Stamps';

/**
 * Operations nested in one another compile to a statement that grows with them, not exponentially: an operand read more
 * than once, to test its kind and then its value, is bound once where it is long. Unbound, the clause that stamps a node
 * compiled to 650 KB on Oracle, which took half a gigabyte of a session's memory. drivine4j's CompiledSizeTest.
 */
describe('A compiled Cypher statement', () => {
    // A compiler compiles one statement: each test is given its own, as drivine4j's are.
    const compilers: [string, () => SqlCypherCompiler][] = [
        ['oracle', () => new OracleCypherCompiler('g')],
        ['postgres', () => new PostgresCypherCompiler('g')]
    ];

    it.each(compilers)('that stamps a node is a few kilobytes on %s', (_, compilerFor) => {
        const compiler = compilerFor();
        const sql = compiler.compile(`MATCH (c:Claim {id: $id}) SET ${Stamps.setClause('c')}`, { id: 'x' }).sql;
        expect(sql.length).toBeLessThan(20_000);
    });

    it.each(compilers)(
        'grows with each duration added to a stored value, not exponentially, on %s',
        (_, compilerFor) => {
            const compiler = compilerFor();
            const added = (times: number) =>
                'MATCH (c:Claim) RETURN ' + '('.repeat(times) + 'c.day' + " + duration('P1D'))".repeat(times);
            const [one, two, four] = [1, 2, 4].map((it) => compiler.compile(added(it)).sql.length);
            expect(one).toBeLessThan(20_000);
            expect(four).toBeLessThan(3 * two);
        }
    );

    it.each(compilers)('of a sum of twice the terms is about twice as long on %s', (_, compilerFor) => {
        const compiler = compilerFor();
        const sum = (terms: number) =>
            'MATCH (c:Claim) RETURN ' + Array.from({ length: terms }, (_, i) => `c.p${i + 1}`).join(' + ');
        const [short, long] = [8, 16].map((it) => compiler.compile(sum(it)).sql.length);
        expect(long).toBeLessThan(3 * short);
    });
});
