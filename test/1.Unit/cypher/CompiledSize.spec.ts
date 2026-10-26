import { int } from 'neo4j-driver';
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

    it.each(compilers)(
        'of round() to places known when compiling, nested under an aggregate, rounds one way, not both, on %s',
        (_, compilerFor) => {
            // Under an aggregate nothing is bound: a CASE of both roundings, nested four deep, made 85 KB on Postgres and
            // 8.8 MB on Oracle of what round(x) makes in 4 KB and 26 KB (liberation-data/drivine#328).
            const nested = (precision: string) =>
                'UNWIND [1.5] AS x RETURN ' + 'round('.repeat(4) + 'sum(x)' + `${precision})`.repeat(4);
            const size = (precision: string, parameters: Record<string, any> = {}) =>
                compilerFor().compile(nested(precision), parameters).sql.length;
            const whole = size('');
            expect(size(', 0')).toEqual(whole);
            expect(size(', -0.5')).toEqual(whole);
            expect(size(', $p', { p: 0 })).toEqual(whole);
            // A bigint or the Neo4j driver's Integer is read as the number it is.
            expect(size(', $p', { p: BigInt(0) })).toEqual(whole);
            expect(size(', $p', { p: int(0) })).toEqual(whole);
        }
    );

    it.each(compilers)(
        'of round() to places from data, nested under an aggregate, reads the value once more for its kind, not in the places, on %s',
        (name, compilerFor) => {
            // A null value rounds to null by negative places, so the value is read where they are refused
            // (liberation-data/drivine#336). Read in the places, it was written out again at each place they are, and
            // three rounds deep made 26 MB on Oracle and 550 KB on Postgres.
            for (const mode of ['', ", 'HALF_UP'"]) {
                const nested =
                    'UNWIND [1.5] AS x WITH x, 1 AS p RETURN p, ' +
                    'round('.repeat(3) +
                    'sum(x)' +
                    `, p${mode})`.repeat(3);
                expect(compilerFor().compile(nested).sql.length).toBeLessThan(name === 'oracle' ? 2_000_000 : 100_000);
            }
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
            // A text put together with a number given, on either side, is a text; with a property, which may hold a list,
            // not.
            expect(writes('MATCH (c:Claim) RETURN toUpper(c.s) + 1 + c.f')).toEqual(once);
            expect(writes('MATCH (c:Claim) RETURN 1 + toUpper(c.s) + c.f')).toEqual(once);
            expect(writes("MATCH (c:Claim) RETURN toUpper(c.s) + c.f + 'x'")).toEqual(2 * once);
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
            const added = "MATCH (c:Claim) WITH collect(toUpper(c.s)) AS ts RETURN (ts + toLower('a'))[0]";
            expect(writes(`${added} + 'x'`)).toEqual(writes(added));
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

    it.each(compilers)(
        'of an equality of values that hold no null in a list or a map has no test for one, on %s',
        (name, compilerFor) => {
            // drivine4j#225: a null a list or a map holds is tested for, and the two walked, only where one may hold one.
            const test = name === 'oracle' ? '[[,:]null[],}]' : 'jsonb_path_exists(';
            const tests = (cypher: string, parameters: Record<string, any> = {}): boolean =>
                compilerFor().compile(cypher, parameters).sql.includes(test);
            expect(tests('MATCH (c:Claim) WHERE c.list = $p RETURN c.id', { p: [1, 2] })).toBe(false);
            expect(
                tests(
                    'MATCH (c:Claim) WITH c, c.list AS l RETURN [1, 2] = [1, 2], c.a = c.b, l = c.b, c.list IN $ls, {x: 1} <> {x: 2}, size(l) = 2',
                    { ls: [[1]] }
                )
            ).toBe(false);
            // Lists and maps written out are compared item by item.
            expect(
                tests('MATCH (c:Claim) WITH c.a AS a, c.b AS b RETURN [a, b] = [b, a], {x: a} = {x: b}, a IN [b, null]')
            ).toBe(false);
            // A parameter's list that holds a null is compared item by item as the statement is compiled; a map is walked.
            expect(tests('MATCH (c:Claim) WHERE c.list = $p RETURN c.id', { p: [1, null, [null, 2]] })).toBe(false);
            expect(tests('MATCH (c:Claim) WHERE c.map = $p RETURN c.id', { p: { x: null } })).toBe(true);
            expect(tests('MATCH (c:Claim) WITH c, [c.a] AS l RETURN l = [c.b]')).toBe(true);
        }
    );

    it.each(compilers)(
        'of a value that holds no null, carried past a write, has no test for one, on %s',
        (name, compilerFor) => {
            // A row carried between a procedure's statements holds each value as its JSON, which holds no null where the
            // value held none. drivine4j's row carry forgets this, and tests for one.
            const test = name === 'oracle' ? '[[,:]null[],}]' : 'jsonb_path_exists(';
            const compiled = compilerFor().compile(
                'MATCH (c:Claim) WITH c, c.list AS l SET c.b = 1 WITH c, l WHERE l = c.other RETURN c.id'
            );
            expect([compiled.sql, ...compiled.setup].some((it) => it.includes(test))).toBe(false);
        }
    );

    it.each(compilers)(
        'of a parameter that holds a number JSON has no text for, NaN, compares it as the null it is bound as, on %s',
        (_, compilerFor) => {
            const compiled = (p: unknown[]): string =>
                compilerFor().compile('MATCH (c:Claim) WHERE c.list = $p RETURN c.list = $p', { p }).sql;
            expect(compiled([1, NaN])).toEqual(compiled([1, null]));
            expect(compiled([Infinity])).toEqual(compiled([null]));
        }
    );

    it.each(compilers)(
        'of a parameter that is an iterator, which gives its items once, binds them where it is compared, on %s',
        (_, compilerFor) => {
            function* items(): Generator<number> {
                yield 1;
                yield 2;
            }
            for (const cypher of [
                'MATCH (c:Claim) WHERE c.a IN $l RETURN c.id',
                'MATCH (c:Claim) RETURN c.list = $l',
                'MATCH (c:Claim) SET c.b = 1 WITH c WHERE c.a IN $l RETURN c.id'
            ]) {
                const bound = JSON.stringify(compilerFor().compile(cypher, { l: items() }).parameters);
                expect(bound).toContain('[1,2]');
            }
        }
    );

    it.each(compilers)(
        'of a WHERE that searches a list that holds no null is the search alone, on %s',
        (_, compilerFor) => {
            // drivine4j#225: null and false keep no row alike, so a WHERE needs no test of the value being null.
            const compiled = (cypher: string, parameters: Record<string, any> = {}): string =>
                compilerFor().compile(cypher, parameters).sql;
            const tested = (sql: string): boolean => sql.includes('ELSE FALSE') || sql.includes('THEN FALSE');
            expect(
                tested(
                    compiled('MATCH (c:Claim) WHERE c.a IN $l AND (c.b IN [1, 2] OR c.c > 1) RETURN c.id', {
                        l: [1, 2]
                    })
                )
            ).toBe(false);
            // Nor of the list being null or holding a null, beside a value that holds none.
            expect(
                tested(compiled("MATCH (c:Claim) WHERE 'a' IN c.tags AND c.a IN $l RETURN c.id", { l: [1, null] }))
            ).toBe(false);
            // Nor in a quantified path pattern's WHERE, which keeps a step where it is true.
            expect(tested(compiled('MATCH (a:Claim) ((x)-[:R]->(y) WHERE y.a IN [1, 2]){1,3} (b) RETURN b.id'))).toBe(
                false
            );
            expect(compiled('MATCH (c:Claim) RETURN c.a IN $l', { l: [1, 2] })).toContain('THEN FALSE');
        }
    );

    it.each(compilers)('of an IN of an IN grows with each, not exponentially, on %s', (_, compilerFor) => {
        const nested = (times: number, list: string): string =>
            'MATCH (c:Claim) RETURN ' + '('.repeat(times) + 'c.a' + ` IN ${list})`.repeat(times);
        for (const list of ['[true]', 'c.list']) {
            const [two, four] = [2, 4].map((it) => compilerFor().compile(nested(it, list)).sql.length);
            expect(four).toBeLessThan(3 * two);
        }
    });

    it('of values that may hold a null walks them on Postgres over arrays unnested, which the planner costs low', () => {
        // As the sort key's walk is: a set-returning function's 100 rows, multiplied through the walk, bring in its JIT.
        const sql = new PostgresCypherCompiler('g').compile(
            'MATCH (c:Claim) WITH [c.a] AS l, [c.b] AS m RETURN l = m'
        ).sql;
        expect(sql).toContain('WITH RECURSIVE');
        expect(sql).not.toContain('FROM jsonb_array_elements(');
        expect(sql).not.toContain('jsonb_each(');
    });

    it.each(compilers)(
        'of lists and maps written out that may hold a null compares them item by item, not built and compared whole, on %s',
        (name, compilerFor) => {
            const built = name === 'oracle' ? ['JSON_ARRAY(', 'JSON_OBJECT('] : ['json_build_'];
            for (const equality of ['[a, b] = [b, a]', '{x: a} = {x: b}']) {
                const sql = compilerFor().compile(
                    `MATCH (c:Claim) WITH c.a AS a, c.b AS b RETURN ${equality} AS e`
                ).sql;
                expect(built.filter((it) => sql.includes(it))).toEqual([]);
            }
        }
    );

    it('of a sort by a property on Postgres is by its JSON and its text, and only a list the statement makes is keyed as a list', () => {
        // Keyed as a list, a term costs thousands a row in the planner's estimate, which brings in its JIT for the whole
        // statement past a few dozen rows (liberation-data/drivine4j#223). A text sorts by its code points (#339), in the
        // same row, with no subquery.
        const order = (cypher: string): string => {
            const sql = new PostgresCypherCompiler('g').compile(cypher).sql;
            return sql.substring(sql.indexOf('ORDER BY ') + 'ORDER BY '.length);
        };
        expect(order('MATCH (c:Claim) RETURN c.name ORDER BY c.name')).toEqual(
            "ROW(CASE WHEN jsonb_typeof(p2.s1) = 'string' THEN '\"\"'::jsonb ELSE NULLIF(p2.s1, 'null'::jsonb) END, " +
                "(CASE WHEN jsonb_typeof(p2.s1) = 'string' THEN (p2.s1 #>> '{}') END) COLLATE \"C\")"
        );
        const list = order('MATCH (c:Claim) WITH c.name AS n, collect(c.id) AS ids RETURN n ORDER BY ids');
        expect(list).toContain('WITH RECURSIVE');
        // Its items as arrays unnested, which the planner takes for 10 items, not a set-returning function's 100: a
        // 150th of the cost.
        expect(list).not.toContain('FROM jsonb_array_elements(');
        expect(list).toContain('unnest(ARRAY(SELECT jsonb_array_elements(');
    });

    it.each(compilers)(
        'of a sign() nested under an aggregate is about the size of a ceil(), reading its number once, on %s',
        (_, compilerFor) => {
            // Under an aggregate nothing is bound, so a sign that read its number twice wrote it out twice at each level:
            // on Oracle, where a sign is not SIGN alone (liberation-data/drivine#342), four deep was 14 times a ceil().
            const nested = (fn: string) => 'UNWIND [1.5] AS x RETURN ' + `${fn}(`.repeat(4) + 'sum(x)' + ')'.repeat(4);
            const [sign, ceil] = ['sign', 'ceil'].map((it) => compilerFor().compile(nested(it)).sql.length);
            expect(sign).toBeLessThan(ceil * 1.1);
        }
    );
});
