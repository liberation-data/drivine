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
            // A sum that may be a text writes each side as toString does, a float as Java writes it.
            expect(one).toBeLessThan(25_000);
            expect(four).toBeLessThan(3 * two);
        }
    );

    it.each(compilers)(
        'of a WITH sorted by a duration added to a stored value, which is none of its items, grows with each addition, not exponentially, on %s',
        (_, compilerFor) => {
            const compiler = compilerFor();
            const added = (times: number) =>
                'MATCH (c:Claim) WITH c ORDER BY ' +
                '('.repeat(times) +
                'c.day' +
                " + duration('P1D'))".repeat(times) +
                ' RETURN c.id';
            const [one, two, four] = [1, 2, 4].map((it) => compiler.compile(added(it)).sql.length);
            expect(one).toBeLessThan(40_000);
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

    it.each(compilers)(
        'of a quantified path pattern of twice the hops, each node read by its WHERE, is about twice as long on %s',
        (_, compilerFor) => {
            const group = (hops: number) =>
                'MATCH (a:Claim) ((n0)' +
                Array.from({ length: hops }, (_, i) => `-[:R]->(n${i + 1})`).join('') +
                ' WHERE ' +
                Array.from({ length: hops }, (_, i) => `n${i}.v < n${i + 1}.v`).join(' AND ') +
                '){1,3} (b) RETURN b';
            const [short, long] = [4, 8].map((it) => compilerFor().compile(group(it)).sql.length);
            expect(short).toBeLessThan(20_000);
            expect(long).toBeLessThan(3 * short);
        }
    );

    it.each(compilers)(
        'of items taken out of lists nested twice as deep, holding a relationship, is about twice as long on %s',
        (_, compilerFor) => {
            const taken = (depth: number) =>
                `MATCH (c:Claim)-[r:R]->() WITH ${'['.repeat(depth)}r, 1${']'.repeat(
                    depth
                )} AS m RETURN m${'[0]'.repeat(depth)} = 1`;
            const [short, long] = [4, 8].map((it) => compilerFor().compile(taken(it)).sql.length);
            expect(short).toBeLessThan(20_000);
            expect(long).toBeLessThan(3 * short);
        }
    );

    it.each(compilers)(
        'of a sum writes a side as toString writes a float only where the statement gives neither side, on %s',
        (name, compilerFor) => {
            // A number the statement gives is written out at compile time, and a side added to one is a text where the sum
            // is one.
            const written = name === 'oracle' ? 'TO_CHAR(' : 'to_char(';
            const writes = (cypher: string, parameters: Record<string, any> = {}): number =>
                compilerFor().compile(cypher, parameters).sql.split(written).length - 1;
            const once = writes('MATCH (c:Claim) RETURN c.a + c.b') / 2;
            expect(once).toBeGreaterThan(0);
            expect(writes('MATCH (c:Claim) RETURN c.a + 1, 2.5 + c.b, c.a + $n', { n: 1.5 })).toEqual(0);
            expect(writes("MATCH (c:Claim) RETURN 'x' + c.b")).toEqual(once);
            // NaN and the infinities count as given neither way, so both sides of a sum with one are written as toString
            // writes them.
            expect(writes('MATCH (c:Claim) RETURN c.a + $n', { n: NaN })).toEqual(2 * once);
        }
    );

    it('of a sort by a property on Postgres is by its JSON alone, and only a list the statement makes is keyed as a list', () => {
        // Keyed as a list, a term costs thousands a row in the planner's estimate, which brings in its JIT for the whole
        // statement past a few dozen rows (liberation-data/drivine4j#223).
        const order = (cypher: string): string => {
            const sql = new PostgresCypherCompiler('g').compile(cypher).sql;
            return sql.substring(sql.indexOf('ORDER BY ') + 'ORDER BY '.length);
        };
        expect(order('MATCH (c:Claim) RETURN c.name ORDER BY c.name')).toEqual("NULLIF(p2.s1, 'null'::jsonb)");
        const list = order('MATCH (c:Claim) WITH c.name AS n, collect(c.id) AS ids RETURN n ORDER BY ids');
        expect(list).toContain('WITH RECURSIVE');
        // Its items as arrays unnested, which the planner takes for 10 items, not a set-returning function's 100: a
        // 150th of the cost.
        expect(list).not.toContain('FROM jsonb_array_elements(');
        expect(list).toContain('unnest(ARRAY(SELECT jsonb_array_elements(');
    });
});
