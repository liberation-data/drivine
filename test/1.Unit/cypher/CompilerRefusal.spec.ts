import { int } from 'neo4j-driver';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqlCypherCompiler } from '@/cypher/sql/SqlCypherCompiler';
import { check, loadSpec, runsOn, trimIndent, valuesFor } from '../../cypher/CypherSpec';

/**
 * A statement the compiler cannot make SQL of, or that is wrong as Cypher is, is refused when it is compiled, with what
 * is wrong, on each store alike: before the store is sent anything. The statements and messages are the spec's, in
 * `test/cypher/refusals.yaml`.
 */
describe('The Cypher compiler refuses', () => {
    const spec = loadSpec('refusals.yaml');
    const compilers: [string, () => SqlCypherCompiler][] = [
        ['postgres', () => new PostgresCypherCompiler('g')],
        ['oracle', () => new OracleCypherCompiler('g')]
    ];

    describe.each(compilers)('on %s', (store, compiler) => {
        it.each(spec.cases.map((it) => [it.name, it] as const))('%s', async (_, cypherCase) => {
            for (let i = 0; i < cypherCase.steps.length; i++) {
                if (runsOn(cypherCase.steps[i], store)) {
                    await check(cypherCase, i, store, async (step) => {
                        compiler().compile(trimIndent(step.cypher), valuesFor(step.parameters ?? {}, Number));
                        return Promise.resolve([]);
                    });
                }
            }
        });
    });

    it('round() compiles a precision below 0 or past 2147483647, written, negated or given, to fail on the row that rounds a number by it', () => {
        // Neo4j reads the precision only when it rounds (#364), so none is refused when compiling, in both forms.
        const message = 'round() takes a precision from 0 to 2147483647, as in Neo4j.';
        compilers.forEach(([store, compiler]) => {
            (
                [
                    ['RETURN round(1234.5, -2)', {}],
                    ["RETURN round(1234.5, -1.2, 'UP')", {}],
                    ['RETURN round(1234.5, -$p)', { p: 2 }],
                    ['RETURN round(1234.5, $p)', { p: -2.5 }],
                    ['RETURN round(1234.5, 2147483648)', {}],
                    ["RETURN round(1234.5, $p, 'HALF_UP')", { p: Infinity }],
                    // A whole number a caller binds as a bigint or as the Neo4j driver's Integer.
                    ['RETURN round(1234.5, $p)', { p: BigInt(-2) }],
                    ['RETURN round(1234.5, $p)', { p: int(2147483648) }]
                ] as const
            ).forEach(([cypher, parameters]) => {
                expect(`${store}: ${cypher}: ${compiler().compile(cypher, parameters).sql}`).toContain(message);
            });
            // -0.5 and -0.9 cut toward zero are 0 places, and 2147483647.9 is 2147483647: none fails.
            (
                [
                    ["RETURN [round(1234.5, -0.5), round(1234.5, $p, 'HALF_UP')]", { p: -0.9 }],
                    ["RETURN [round(1234.5, 2147483647), round(1234.5, $p, 'UP')]", { p: 2147483647.9 }]
                ] as const
            ).forEach(([cypher, parameters]) => {
                expect(compiler().compile(cypher, parameters).sql).not.toContain('round() takes a precision');
            });
        });
    });

    it('a start or length of substring(), left() or right() written as a float, or given out of range beside a text', () => {
        // Beyond the spec's refusals (#319): what drivine4j's #263 refuses, and a whole number a caller binds as a bigint, the
        // Neo4j driver's Integer, or past what a float holds, and a float no number is, cut as Java casts a double.
        const float = (fn: string, what: string): string =>
            `${fn}() takes an integer for its ${what}, not a float, as in Neo4j.`;
        const outOfRange = (fn: string, what: string): string =>
            `${fn}() takes a ${what} from 0 to 2147483647, as in Neo4j.`;
        compilers.forEach(([, compiler]) => {
            (
                [
                    ['RETURN left($t, 2.0)', { t: 'hello' }, float('left', 'length')],
                    ['RETURN right(null, -0.5)', {}, float('right', 'length')],
                    ['MATCH (n:Count) RETURN substring(n.t, 1.0)', {}, float('substring', 'start')],
                    ["RETURN left('hello', $n)", { n: BigInt(-1) }, outOfRange('left', 'length')],
                    ["RETURN left('hello', $n)", { n: int(2147483648) }, outOfRange('left', 'length')],
                    ["RETURN left('hello', $n)", { n: BigInt('1' + '0'.repeat(400)) }, outOfRange('left', 'length')],
                    ["RETURN right('hello', $n)", { n: Infinity }, outOfRange('right', 'length')],
                    ["RETURN substring('hello', $n)", { n: -Infinity }, outOfRange('substring', 'start')],
                    ['RETURN substring($p.t, 0, -$n)', { p: { t: 'hello' }, n: 1 }, outOfRange('substring', 'length')]
                ] as const
            ).forEach(([cypher, parameters, message]) => {
                expect(() => compiler().compile(cypher, parameters)).toThrow(message);
            });
            // NaN is 0; out of range beside a null text, given, is null; and a count from data is read on a row.
            expect(() =>
                compiler().compile(
                    "RETURN [left('hello', $n), substring('hello', $n), left(null, -1), left($p.none, $m), left($t, $m)]",
                    { n: NaN, p: {}, m: BigInt(-1), t: null }
                )
            ).not.toThrow();
            expect(() =>
                compiler().compile('MATCH (n:Count) RETURN [left(n.t, -1), left(n.t, n.m), substring(n.t, 1 - 3)]')
            ).not.toThrow();
        });
    });

    it('collect(DISTINCT) beside a variable no other item is, outside its aggregates, as collect() is', () => {
        // Not in the spec: distinctFirst groups by each such variable, so it is refused before.
        compilers.forEach(([, compiler]) => {
            expect(() =>
                compiler().compile('MATCH (p:Person) RETURN p.born, collect(DISTINCT p.name) + p.name')
            ).toThrow('names p outside its aggregates');
        });
    });

    it('toString() of a list or a map the statement makes, as Neo4j refuses it', () => {
        // drivine4j's #349: Postgres gave the list's JSON text, and Oracle null. The spec's refusals hold the rest.
        compilers.forEach(([, compiler]) => {
            for (const [cypher, kind] of [
                ['WITH [1, 2] AS l RETURN toString(l)', 'list'],
                ['RETURN toString({a: 1})', 'map']
            ]) {
                expect(() => compiler().compile(cypher)).toThrow(
                    `toString() takes a number, a text, a truth value or a temporal value, not a ${kind}, as in Neo4j.`
                );
            }
            // A value whose kind the statement leaves open is compiled, as Neo4j plans it.
            compiler().compile("UNWIND [1, 'a'] AS x RETURN toString(x)");
            compiler().compile('MATCH (n) RETURN toString(n.x)');
        });
    });

    it('a value the statement writes as one of a kind an operator or a function does not take, but not one whose kind is left open', () => {
        // drivine4j's #420 (#448 there): the spec's refusals hold the statements written; these are beside them.
        compilers.forEach(([, compiler]) => {
            // A parameter's value is known as the statement is compiled, once for each call: a step of 0 would never end, and an
            // index given of another kind is refused as one written is.
            (
                [
                    ['RETURN range(2, 8, $s)', { s: 0 }, 'range() takes a step other than 0, as in Neo4j.'],
                    ['RETURN range(2, 8, $s)', { s: BigInt(0) }, 'range() takes a step other than 0, as in Neo4j.'],
                    ['RETURN range(2, 8, $s)', { s: int(0) }, 'range() takes a step other than 0, as in Neo4j.'],
                    ['WITH [1] AS l RETURN l[$k]', { k: 'a' }, 'A list is indexed by an integer, not a text, as in Neo4j.'],
                    ['WITH {a: 1} AS m RETURN m[$k]', { k: 1 }, 'A map is indexed by a text, not an integer, as in Neo4j.'],
                    // A value carried across a write is of the kind the statement made it.
                    ['WITH 1 AS x CREATE (n) RETURN x.num', {}, 'An integer has no properties.']
                ] as const
            ).forEach(([cypher, parameters, message]) => {
                expect(() => compiler().compile(cypher, parameters)).toThrow(message);
            });
            // A value whose kind is known only when the row is read, a property, a parameter or an unwound item, is compiled, as
            // Neo4j plans it; and so are null and the kinds each takes.
            (
                [
                    ['MATCH (n) WHERE n.flag AND NOT n.other RETURN n', {}],
                    ['RETURN $p AND true', { p: 1 }],
                    ['MATCH (n) RETURN n.x.y, n.x[0], 1 IN n.x, range(0, n.x), properties(n.x)', {}],
                    ["UNWIND [{a: 1}] AS m RETURN m.a, m['a']", {}],
                    ['RETURN NOT null, null XOR true, null.num, null[0], [1, 2, 3][null], 1 IN null, properties(null)', {}],
                    ["WITH {a: 1} AS m, 'a' AS k RETURN m.a, m[k], properties(m), [1, 2][-1], range(0, 10, -2)", {}],
                    ["MATCH (a) SET a.tags = ['x', 'y'], a.n = -1", {}],
                    // A variable each query of a UNION makes of another kind is of none known.
                    ['CALL { RETURN 1 AS x UNION RETURN {a: 1} AS x } RETURN x.a', {}],
                    // A variable a later WITH, a comprehension, a quantifier or a reduce() binds again is of the kind that one makes it.
                    ['WITH 1 AS x WITH {a: 1} AS x RETURN x.a', {}],
                    [
                        'WITH 1 AS x RETURN [x IN [{a: 1}] | x.a], [x IN [true] WHERE x], any(x IN [true] WHERE x), reduce(x = true, y IN [true] | x AND y)',
                        {}
                    ],
                    // A CASE, a coalesce(), a list joined, an item of a list or a map written, or a parameter, is of no kind known.
                    [
                        'WITH CASE WHEN true THEN {a: 1} ELSE 1 END AS x, coalesce(null, {a: 1}) AS y, [1] + [{a: 1}] AS z RETURN x.a, y.a, z[1]',
                        {}
                    ],
                    ["RETURN [{a: 1}][0].a, [true][0] AND true, {a: true}.a AND true, {a: [1]}['a'][0]", {}],
                    ['WITH $p AS x RETURN x.a, x AND true, x[0], 1 IN x, properties(x)', { p: { a: 1 } }],
                    ['WITH [1] AS l, {a: 1} AS m RETURN l[$i], m[$k]', { i: 0, k: 'a' }],
                    ['WITH {a: 1} AS m CREATE (n) RETURN m.a', {}],
                    // A name a WITH or an UNWIND binds again after a write is of the kind that one makes it.
                    ['WITH 1 AS x CREATE (n {v: x}) WITH n AS x RETURN x.v', {}],
                    ['WITH 1 AS x CREATE (n {v: x}) WITH n.v AS x RETURN x.a', {}],
                    ['WITH 1 AS x CREATE (n) WITH {a: 1} AS x CREATE (m) RETURN x.a', {}],
                    ['WITH 1 AS x CREATE (n) WITH 1 AS y UNWIND [{a: 1}] AS x RETURN x.a', {}]
                ] as const
            ).forEach(([cypher, parameters]) => compiler().compile(cypher, parameters));
        });
    });

    it('a variable used as two kinds, or made where it is bound already, but not where Neo4j takes it', () => {
        // drivine4j's #451: the spec's refusals hold the statements Neo4j refuses; these are beside them.
        compilers.forEach(([, compiler]) => {
            expect(() => compiler().compile('MATCH (a) CALL (*) { CREATE (a) } RETURN 1')).toThrow(
                'a is bound already, so a CREATE makes no node of it, as in Neo4j.'
            );
            // Neo4j takes each of these: a node bound before an OPTIONAL MATCH or a MERGE that joins it up, a name a WITH, a
            // UNION, a pattern comprehension, an EXISTS or a CALL that imports nothing leaves to a new variable, a list a
            // variable-length relationship matches, a value whose kind the statement leaves open, and a variable bound
            // already that a CREATE or a MERGE in a FOREACH names.
            [
                'MATCH (a) OPTIONAL MATCH (a)-->(b) RETURN b',
                'MATCH (a) OPTIONAL MATCH (a) RETURN a',
                'OPTIONAL MATCH (a) MATCH (a)-->() RETURN a',
                'MATCH (a) MERGE (a)-[:R]->(b)',
                'MATCH (a) MERGE (b)-[:R]->(a)',
                'MATCH (a) MERGE (a)-[:R]->(a)',
                'CREATE (a) MERGE (a)-[:R]->(b)',
                'MATCH (a)-[r]->(b) MERGE (a)-[s:T]->(b)',
                'MATCH (n) CREATE (n)-[:R]->(n)',
                'CREATE (n)-[:T1]->(), (n)-[:T2]->()',
                'MATCH (a) CREATE (b), (a)-[:R]->(b)',
                'MATCH (n) FOREACH (x IN [1] | CREATE (n)-[:R]->())',
                'MATCH (n) FOREACH (x IN [1] | CREATE (n))',
                'FOREACH (x IN [1] | CREATE (n), (n))',
                'MATCH (a) FOREACH (x IN [1] | MERGE (a)-[:R]->())',
                'MATCH (a) WITH a SKIP 0 MERGE (a)-[:R]->()',
                'MATCH (a) CALL { CREATE (a) RETURN 1 AS x } RETURN x',
                'MATCH (a)-[r*]->() WITH r MATCH ()-[r*]->() RETURN r',
                'MATCH (a) RETURN [(a)-->(a) | 1] AS l',
                'WITH 1 AS p RETURN [p = ()-->() | length(p)] AS l',
                'MATCH (a), (a)-->() RETURN a',
                'MATCH (n) WITH n MATCH (n:L) RETURN n',
                'MATCH (a) WITH a AS b, a AS c MATCH (b)-->(c) RETURN b',
                'MATCH ()-[a]->() WITH 1 AS x MATCH (a) RETURN a',
                'MATCH ()-[r]->() RETURN r UNION ALL MATCH (r) RETURN r',
                'MATCH (a) RETURN [a IN [1] | a] AS x',
                'MATCH (n) RETURN [p = (n)-->() | length(p)] AS x',
                'MATCH (a) WITH [(a)-[r]->() | r] AS rs MATCH ()-[r]->() RETURN r',
                'MATCH (a) WHERE EXISTS { MATCH (a)-[r]->() } MATCH ()-[r]->() RETURN r',
                'MATCH (a) CALL { WITH a MATCH (a)-->(b) RETURN b } MATCH (b)-->() RETURN b',
                'MATCH (a) CALL (a) { MATCH (a)-->(b) RETURN b } MATCH (b)-->() RETURN b',
                'MATCH (a) CALL (a) { CREATE (a)-[:R]->(b) RETURN b } RETURN b',
                'MATCH ()-[n]->(m) FOREACH (n IN [m] | CREATE (n)-[:R]->())',
                'MATCH (a) WITH a, 1 AS b ORDER BY size([(a)-->(x) | x]) RETURN b',
                'MATCH (a) MATCH p = (a)-->() RETURN nodes(p)',
                'MATCH ()-[r*]->() RETURN size(r)',
                'WITH [] AS r MATCH ()-[r*]-() RETURN r',
                'MATCH (a) WITH collect(a) AS ns UNWIND ns AS n MATCH (n)-->(m) RETURN m'
            ].forEach((cypher) => compiler().compile(cypher));
            // Neo4j takes these too, and the compiler refuses them for what it does not compile yet, as before. So it refuses a
            // relationship bound before a CREATE or a MERGE that makes it again, as the spec has it, which Neo4j refuses as bound already.
            const boundBefore = 'A relationship variable bound before its pattern is Cypher, and is not compiled to SQL yet.';
            [
                ['MATCH ()-[r]->() WITH r MATCH ()-[r]->() RETURN r', boundBefore],
                ['MATCH (a)-[r]->() RETURN EXISTS { (a)-[r]->() } AS e', boundBefore],
                ['MATCH (a)-[r]->(b) MERGE (a)-[r]->(b)', boundBefore],
                ['MATCH (a) CALL { MATCH ()-[a]->() RETURN 1 AS x } RETURN a, x', boundBefore],
                ['MATCH (a) CALL () { MATCH ()-[a]->() RETURN 1 AS x } RETURN a, x', boundBefore],
                ['MATCH ()-[r]->() FOREACH (x IN [1] | CREATE ()-[r:T]->())', boundBefore],
                [
                    'MATCH (a) CALL { WITH a RETURN a AS b UNION WITH a MATCH ()-[b]->() RETURN b } RETURN b',
                    'A UNION in CALL { … } whose queries return values of different kinds is Cypher, and is not compiled to SQL yet.'
                ],
                [
                    'MATCH p = ()-->() RETURN [p = ()-->() | p] AS x',
                    'A path is not a value drivine gives the same on each store: use nodes(p), relationships(p) and length(p).'
                ]
            ].forEach(([cypher, message]) => expect(() => compiler().compile(cypher)).toThrow(message));
        });
    });

    it('two lists compared in a statement that writes, or in the step of a reduce(), on Oracle, whose block calls no function the query declares', () => {
        // drivine4j's #349: Oracle compares two lists by a function the query declares, which a procedure's queries do not call.
        const write = 'CREATE (n:N {a: [1] < [2]})';
        expect(() => new OracleCypherCompiler('g').compile(write)).toThrow(
            'Two lists compared with <, <=, > or >= do not run on Oracle in a statement that writes'
        );
        new PostgresCypherCompiler('g').compile(write);
        // Nor does a reduce()'s step, which is a function the query declares.
        const folded = 'RETURN reduce(acc = false, x IN [[1], [2]] | acc OR [1] < x)';
        expect(() => new OracleCypherCompiler('g').compile(folded)).toThrow(
            'Two lists compared with <, <=, > or >= do not run on Oracle in the step of a reduce()'
        );
        new PostgresCypherCompiler('g').compile(folded);
    });

    it('a date written as a text that is no date, with what is wrong with it', () => {
        // Not in the spec: the message ends with the parser's own text.
        compilers.forEach(([, compiler]) => {
            expect(() => compiler().compile("RETURN date('2024-02-30')")).toThrow(
                "'2024-02-30' is no date: Text '2024-02-30' could not be parsed: Invalid date 'FEBRUARY 30'"
            );
        });
    });

    it('a function named as a property every JavaScript object has, as any function it has no SQL for', () => {
        // Not in the spec: a name such as `constructor` is no function in drivine4j's compiler either.
        compilers.forEach(([, compiler]) => {
            expect(() => compiler().compile('RETURN constructor(1)')).toThrow(
                'The function constructor() is Cypher, and is not compiled to SQL yet.'
            );
        });
    });

    it('a truncation to a unit named as a property every JavaScript object has, as any unit it has no SQL for', () => {
        compilers.forEach(([, compiler]) => {
            expect(() => compiler().compile("RETURN date.truncate('constructor', date('2024-03-15'))")).toThrow(
                'date.truncate() truncates to year, quarter, month, week, day, hour, minute, second or millisecond, not constructor.'
            );
        });
    });

    it.each([
        ['a list comprehension', '[z IN [1] WHERE COUNT { (y)-->() } > z]'],
        ['a reduce', 'reduce(s = 0, z IN [1] | s + COUNT { (y)-->() }) > 0'],
        ["a pattern's node properties", '(y)-[:S]->({k: COUNT { (y)-->() }})'],
        ["a pattern's relationship properties", '(y)-[:S {k: COUNT { (y)-->() }}]->()']
    ])(
        'on Oracle, a subquery in %s in a quantified path pattern that may read a variable from outside it',
        (_, test) => {
            // Not in the spec, which has a subquery in a quantifier, a pattern comprehension and an EXISTS pattern.
            const cypher = `MATCH (a) ((x)-[:R]->(y) WHERE ${test})+ (b) RETURN b`;
            expect(() => new OracleCypherCompiler('g').compile(cypher)).toThrow(
                'On Oracle, a subquery in a quantified path pattern that may read a variable from outside it is Cypher, and is not compiled to SQL yet.'
            );
            expect(() => new PostgresCypherCompiler('g').compile(cypher)).not.toThrow();
        }
    );

    /** Why `compiler` refuses `cypher`, or undefined where it compiles it. */
    const refusal = (compiler: () => SqlCypherCompiler, cypher: string): string | undefined => {
        try {
            compiler().compile(cypher);
            return undefined;
        } catch (e) {
            return (e as Error).message;
        }
    };

    it('a CALL sees only the variables of the row it imports, and a bracketed name not of the row is refused', () => {
        // drivine4j's #410 (#473 here). A CALL saw every variable of its row, so a name it does not import joined the row's.
        const undefinedVariable = (name: string): string =>
            `${name} is not defined: a variable is bound by a pattern, a WITH or an UNWIND before it is used.`;
        compilers.forEach(([store, compiler]) => {
            [
                // A CALL's brackets import only variables of its row; a nested CALL imports from the outer CALL's scope.
                ['MATCH (a) CALL (x) { RETURN 1 AS n } RETURN n', 'x'],
                ['MATCH (a), (b) CALL (a) { CALL (b) { MATCH (b)-->(d) RETURN d } RETURN d.x AS x } RETURN x', 'b'],
                // A procedure's call sees the whole row, which holds no a after a WITH that does not pass it on.
                ['MATCH (a) WITH 1 AS x CALL db.labels() YIELD label WHERE label = a.kind RETURN label', 'a'],
                // A CALL holding a randomUUID() reads the UUID made for its row, and still imports only what it names (#471).
                ['UNWIND [1] AS i CALL { RETURN toString(i) + randomUUID() AS u } RETURN u', 'i'],
                ['UNWIND [1] AS i CALL (x) { RETURN randomUUID() AS u } RETURN u', 'x'],
                // A variable quoted as the compiler names its own is imported as any other is.
                ['UNWIND [1] AS `#anew9` CALL () { RETURN `#anew9` AS x } RETURN x', '#anew9']
            ].forEach(([cypher, name]) => {
                expect(() => compiler().compile(cypher)).toThrow(undefinedVariable(name));
            });
            // A name a CALL does not import is a new variable in it, of any kind.
            [
                'MATCH (a) CALL { MATCH ()-[a]->() RETURN 1 AS x } RETURN a, x',
                'MATCH (a) CALL () { MATCH ()-[a]->() RETURN 1 AS x } RETURN a, x',
                'MATCH (a), (b) CALL (a) { MATCH ()-[b]->() RETURN 1 AS x } RETURN x',
                'MATCH (a) CALL { WITH a WITH 1 AS one MATCH ()-[a]->() RETURN 1 AS x } RETURN x',
                'MATCH (a) CALL () { CREATE (a) RETURN 1 AS x } RETURN x',
                'MATCH (a) CALL { WITH a MATCH (a)-->(b) RETURN b } MATCH (b)-->() RETURN b',
                'MATCH (a) CALL (a) { MATCH (a)-->(b) RETURN b } MATCH (b)-->() RETURN b',
                'MATCH (a) CALL (a) { CREATE (a)-[:R]->(b) RETURN b } RETURN b',
                // A procedure's call imports each variable of the row, so its WHERE reads them.
                'MATCH (a) CALL db.labels() YIELD label WHERE label = a.kind RETURN label'
            ].forEach((cypher) =>
                expect([store, cypher, refusal(compiler, cypher)]).toEqual([store, cypher, undefined])
            );
        });
    });

    it("a CALL's leading WITH that imports names variables of the row alone, as Neo4j has it", () => {
        // drivine4j's #410 (#473 here): Neo4j refuses an importing WITH with anything more (its 42I28), which was compiled as any WITH.
        compilers.forEach(([store, compiler]) => {
            [
                'MATCH (a), (b) CALL { WITH a, b AS c MATCH (a)-->(c) RETURN c.x AS x } RETURN x',
                'MATCH (a) CALL { WITH a AS c MATCH (c)-->(d) RETURN d.x AS x } RETURN x',
                'MATCH (a) CALL { WITH a WHERE a.x > 1 RETURN count(*) AS n } RETURN a, n',
                'MATCH (a) CALL { WITH a ORDER BY a.x LIMIT 1 MATCH (a)-->(d) RETURN d.x AS x } RETURN x',
                'MATCH (a) CALL { WITH a SKIP 0 RETURN 1 AS x } RETURN x',
                'MATCH (a) CALL { WITH DISTINCT a MATCH (a)-->(d) RETURN d.x AS x } RETURN x',
                'MATCH (a) CALL { WITH a, 1 AS one MATCH (a)-->(d) RETURN d.x + one AS x } RETURN x',
                'MATCH (a) CALL { WITH * WHERE true RETURN 1 AS x } RETURN x',
                'MATCH (a) CALL { UNWIND [1] AS x RETURN x UNION WITH a WHERE true RETURN 1 AS x } RETURN x',
                'MATCH (a) CALL { WITH a WHERE a.x > 1 SET a.y = 1 } RETURN a',
                // One holding a randomUUID() too, whose query reads a UUID made for the row before its WITH (#471).
                'MATCH (a) CALL { WITH a AS c RETURN c.x + randomUUID() AS x } RETURN x'
            ].forEach((cypher) => {
                expect(() => compiler().compile(cypher)).toThrow(
                    'The importing WITH of a CALL { … } names variables of the row alone, as in Cypher: no alias, expression, ' +
                        'DISTINCT, WHERE, ORDER BY, SKIP or LIMIT. Import them with CALL (a, b) { … }, and work on them in a WITH after.'
                );
            });
            // A leading WITH that names no variable of the row as it is imports nothing, and is any WITH; so is one of a CALL with brackets.
            [
                'MATCH (a) CALL { WITH 1 AS one WHERE one > 0 RETURN one } RETURN one',
                'MATCH (a) CALL { WITH DISTINCT 1 AS one RETURN one } RETURN one',
                'MATCH (a) CALL { WITH a AS a RETURN 1 AS one } RETURN one',
                'MATCH (a) CALL (a) { WITH a WHERE a.x > 1 RETURN a.x AS x } RETURN x',
                'MATCH (a) CALL (a) { WITH DISTINCT a, 1 AS one ORDER BY a.x LIMIT 1 RETURN one } RETURN one'
            ].forEach((cypher) =>
                expect([store, cypher, refusal(compiler, cypher)]).toEqual([store, cypher, undefined])
            );
        });
    });

    it('a statement that is not Cypher, with where it goes wrong', () => {
        expect(() => new PostgresCypherCompiler('g').compile('MATCH (n RETURN n')).toThrow(
            "The statement is not Cypher, at line 1, column 10: no viable alternative at input 'MATCH (n RETURN'"
        );
    });
});
