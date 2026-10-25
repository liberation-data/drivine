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

    it.each(compilers)(
        'of a sum writes a side the statement makes a text as its own text, and only a side that may be a float as toString writes it, on %s',
        (name, compilerFor) => {
            // Written as toString writes a float, a side that is always a text made `count('x' + toString(i))` 2.5 times
            // as slow on Oracle (#326).
            const written = name === 'oracle' ? 'TO_CHAR(' : 'to_char(';
            const writes = (cypher: string): number => compilerFor().compile(cypher).sql.split(written).length - 1;
            // toString writes its float once, and the sum writes the text it gives as it is.
            const once = writes('MATCH (c:Claim) RETURN toString(c.i)');
            expect(once).toBeGreaterThan(0);
            expect(writes("MATCH (c:Claim) RETURN 'x' + toString(c.i)")).toEqual(once);
            expect(
                writes(
                    "MATCH (c:Claim) RETURN 'a' + toUpper(c.s), trim(c.s) + substring(c.s, 1) + left(c.s, 2) + replace(c.s, 'a', 'b')"
                )
            ).toEqual(0);
            expect(
                writes("MATCH (c:Claim)-[r]->() RETURN split(c.s, ',')[0] + reverse(toLower(c.s)) + type(r)")
            ).toEqual(0);
            // Carried through a WITH, a collect and an UNWIND, still a text.
            expect(
                writes(
                    'MATCH (c:Claim) WITH toLower(c.s) AS t, collect(toUpper(c.s)) AS ts UNWIND ts AS u RETURN t + u + ts[0] + head(ts)'
                )
            ).toEqual(0);
            // A property may hold a float: it is written as toString writes it, beside a text or not.
            expect(writes("MATCH (c:Claim) RETURN c.s + 'b'")).toEqual(once);
            expect(writes('MATCH (c:Claim) RETURN toUpper(c.s) + c.f')).toEqual(once);
            expect(writes("MATCH (c:Claim) RETURN 'x' + toString(c.i) + c.f")).toEqual(2 * once);
            // A CASE, a coalesce and a list written are a text, or hold texts, where each of theirs is; a text unwound is one.
            expect(
                writes(
                    "MATCH (c:Claim) RETURN CASE WHEN c.b THEN toUpper(c.s) ELSE 'n' END + coalesce(toLower(c.s), 'z') + ['a', toUpper(c.s)][1]"
                )
            ).toEqual(0);
            expect(writes('MATCH (c:Claim) RETURN ltrim(c.s) + rtrim(c.s) + right(c.s, 2)')).toEqual(0);
            expect(writes("MATCH (c:Claim) UNWIND toUpper(c.s) AS u RETURN u + 'x'")).toEqual(0);
            // A list of texts kept distinct, sliced, its tail, its last, and an item an expression names, still holds texts.
            expect(
                writes(
                    'MATCH (c:Claim) WITH collect(DISTINCT toUpper(c.s)) AS ts RETURN last(ts) + ts[1..][0] + tail(ts)[0] + ts[size(ts) - 1]'
                )
            ).toEqual(0);
            expect(
                writes(
                    "MATCH (c:Claim) WITH collect(toUpper(c.s)) AS ts RETURN reverse(ts)[0] + coalesce(ts, split('a,b', ','))[0]"
                )
            ).toEqual(0);
            // Joined to texts, too: the join writes its sides as any `+` does, and its item, added to a text, is written as
            // it is.
            const joined =
                "MATCH (c:Claim) WITH collect(toUpper(c.s)) AS ts, collect(c.f) AS fs RETURN (ts + ['a'])[0], ('b' + ts)[0], (ts + fs)[0]";
            expect(writes(joined.split('[0],').join("[0] + 'x',"))).toEqual(writes(joined));
            expect(writes(`${joined} + 'x'`)).toEqual(writes(joined) + once);
            // Each query of a CALL's UNION makes it a text, and a write carries it on.
            expect(
                writes(
                    "MATCH (c:Claim) CALL { WITH c RETURN toUpper(c.s) AS v UNION WITH c RETURN 'n' AS v } RETURN v + 'x'"
                )
            ).toEqual(0);
            expect(writes("MATCH (c:Claim) WITH c, toUpper(c.s) AS t SET c.t = t RETURN t + 'x'")).toEqual(0);
            // Where any one of them may be a float, it is written as toString writes it.
            expect(writes("MATCH (c:Claim) RETURN CASE WHEN c.b THEN 'a' ELSE c.f END + 'x'")).toEqual(once);
            expect(writes("MATCH (c:Claim) RETURN coalesce(toUpper(c.s), c.f) + 'x'")).toEqual(once);
            expect(writes("MATCH (c:Claim) RETURN ['a', c.f][1] + 'x'")).toEqual(once);
            expect(
                writes(
                    "MATCH (c:Claim) CALL { WITH c RETURN toUpper(c.s) AS v UNION WITH c RETURN c.f AS v } RETURN v + 'x'"
                )
            ).toEqual(once);
            // The least and the greatest of texts are a text; of a property, which may hold a float, not.
            expect(
                writes("MATCH (c:Claim) WITH min(toUpper(c.s)) AS lo, max(toLower(c.s)) AS hi RETURN lo + hi + 'x'")
            ).toEqual(0);
            expect(writes("MATCH (c:Claim) WITH max(c.f) AS hi RETURN hi + 'x'")).toEqual(once);
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
