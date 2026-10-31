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
                    [
                        'WITH [1] AS l RETURN l[$k]',
                        { k: 'a' },
                        'A list is indexed by an integer, not a text, as in Neo4j.'
                    ],
                    [
                        'WITH {a: 1} AS m RETURN m[$k]',
                        { k: 1 },
                        'A map is indexed by a text, not an integer, as in Neo4j.'
                    ],
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
                    [
                        'RETURN NOT null, null XOR true, null.num, null[0], [1, 2, 3][null], 1 IN null, properties(null)',
                        {}
                    ],
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
            const boundBefore =
                'A relationship variable bound before its pattern is Cypher, and is not compiled to SQL yet.';
            [
                ['MATCH ()-[r]->() WITH r MATCH ()-[r]->() RETURN r', boundBefore],
                ['MATCH (a)-[r]->() RETURN EXISTS { (a)-[r]->() } AS e', boundBefore],
                ['MATCH (a)-[r]->(b) MERGE (a)-[r]->(b)', boundBefore],
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
        const units =
            'millennium, century, decade, year, weekYear, quarter, month, week, day, hour, minute, second, millisecond or microsecond';
        compilers.forEach(([, compiler]) => {
            for (const unit of ['constructor', 'toString', 'hasOwnProperty']) {
                expect(() => compiler().compile(`RETURN date.truncate('${unit}', date('2024-03-15'))`)).toThrow(
                    `date.truncate() truncates to ${units}, not ${unit}.`
                );
            }
        });
    });

    it("a truncation's fields given beside a value the compiler takes, past what the spec holds", () => {
        // drivine4j's #468, and liberation-data/drivine#442: Neo4j takes a time zone as an offset alone or by name, which no
        // store's text holds yet, and the fields of a week or a quarter, which no store has SQL for yet.
        compilers.forEach(([, compiler]) => {
            (
                [
                    ["RETURN datetime.truncate('day', datetime(), {timezone: '+19:00'})", "'+19:00' is no time zone."],
                    ["RETURN datetime.truncate('day', datetime(), {timezone: '+05:60'})", "'+05:60' is no time zone."],
                    [
                        "RETURN datetime.truncate('day', datetime(), {timezone: 'UTC'})",
                        "The time zone 'UTC' is Cypher, and is not compiled to SQL yet."
                    ],
                    [
                        "RETURN date.truncate('year', date(), {quarter: 2})",
                        'date.truncate() of a map with quarter is Cypher, and is not compiled to SQL yet.'
                    ],
                    ["RETURN time.truncate('hour', time(), {year: 2000})", 'time.truncate() takes no field year.'],
                    [
                        "RETURN date.truncate('month', date(), {day: -1})",
                        'date.truncate() takes a day from 1 to 31, not -1.'
                    ],
                    [
                        "RETURN date.truncate('month', date(), {day: true})",
                        'date.truncate() takes a whole number for day, not true.'
                    ]
                ] as const
            ).forEach(([cypher, message]) => expect(() => compiler().compile(cypher)).toThrow(message));
            // A field given as an expression, or as a whole number negated, a time zone at UTC or at 18 hours, and a map of none.
            [
                "MATCH (n) RETURN date.truncate('month', date(), {day: n.day, year: -1})",
                "RETURN datetime.truncate('day', datetime(), {timezone: '-00:00'}), datetime.truncate('day', datetime(), {timezone: '+18:00'})",
                "RETURN localdatetime.truncate('day', localdatetime(), {}), localtime.truncate('hour', localtime(), null)"
            ].forEach((cypher) => compiler().compile(cypher));
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

    it('an aggregate in a WHERE is refused, as Neo4j refuses it', () => {
        // drivine4j's #489 (#487 here): Neo4j's 42I24, "invalid use of aggregate function". Each was compiled, its aggregate
        // straight into the SQL WHERE. Beside the spec's "Aggregate in a WHERE", those drivine4j holds of its own.
        const where = (aggregate: string): string =>
            `${aggregate} aggregates, and a WHERE holds no aggregate, as in Neo4j: aggregate in a WITH first, ` +
            "and filter what it gives in that WITH's WHERE, as in WITH x, count(*) AS c WHERE c > 1.";
        compilers.forEach(([store, compiler]) => {
            [
                ['UNWIND [1, 2] AS i WITH i WHERE sum(i) > 1 RETURN i', 'sum()'],
                ['UNWIND [1, 2] AS i WITH i WHERE i > 1 AND count(*) > 0 RETURN i', 'count(*)'],
                ['MATCH (n) WHERE count(*) > 1 RETURN n', 'count(*)'],
                ['MATCH (a) WHERE a.x IN collect(a.y) RETURN a', 'collect()'],
                ['MATCH (n) RETURN [(n)-->(m) WHERE count(m) > 1 | m] AS ms', 'count()'],
                ['UNWIND [[1, 2]] AS l RETURN all(x IN l WHERE sum(x) > 1) AS a', 'sum()'],
                ['UNWIND [[1, 2]] AS l RETURN [x IN l WHERE count(x) > 1 | x] AS a', 'count()'],
                ['MATCH (a) ((x)-[:R]->(y) WHERE count(x) > 1)+ (b) RETURN a', 'count()'],
                ['MATCH (n) WHERE EXISTS { (n)-->(m) WHERE count(m) > 1 } RETURN n', 'count()'],
                ['MATCH (n) WHERE COUNT { (n)-->(m) WHERE count(m) > 1 } > 0 RETURN n', 'count()'],
                ['MATCH (n) RETURN COUNT { MATCH (n)-->(m) WHERE count(m) > 1 RETURN m } AS c', 'count()'],
                ['MATCH (n) RETURN COUNT { MATCH (n)-->(m) WITH m WHERE count(m) > 1 RETURN m } AS c', 'count()'],
                ['MATCH (n) CALL { WITH n MATCH (n)-->(m) WHERE count(m) > 1 RETURN m } RETURN m', 'count()'],
                ['UNWIND [1, 2] AS i CALL (i) { WITH i WHERE sum(i) > 1 RETURN i AS j } RETURN j', 'sum()'],
                ['UNWIND [1, 2] AS i CALL { WITH i MATCH (n) WHERE max(n.x) > i RETURN n } RETURN n', 'max()'],
                [
                    'UNWIND [1, 2] AS i CALL (i) { CALL (i) { UNWIND [1, 2] AS x WITH x WHERE sum(x) > i RETURN x } RETURN x } RETURN x',
                    'sum()'
                ],
                [
                    'MATCH (p:Person) RETURN p.name AS n UNION MATCH (m:Movie) WHERE count(*) > 1 RETURN m.title AS n',
                    'count(*)'
                ],
                ['UNWIND [x IN [1, 2] WHERE count(x) > 0 | x] AS y RETURN y', 'count()'],
                ['MATCH (n) SET n.v = [x IN [1, 2] WHERE sum(x) > 0 | x]', 'sum()'],
                ['MERGE (n:N) ON CREATE SET n.v = [x IN [1, 2] WHERE min(x) > 0 | x]', 'min()'],
                ['CREATE (n:N {v: [x IN [1, 2] WHERE avg(x) > 0 | x]})', 'avg()'],
                ['FOREACH (i IN [1] | CREATE (:N {v: [x IN [1, 2] WHERE max(x) > 0 | x]}))', 'max()'],
                // Each other place a WHERE may be, as Neo4j 2026.10 refuses it.
                ['MATCH (n) DELETE [x IN [n] WHERE count(x) > 0 | x][0]', 'count()'],
                ['MERGE (n:N) ON MATCH SET n.v = [x IN [1, 2] WHERE min(x) > 0 | x]', 'min()'],
                ['MATCH (n {v: [x IN [1, 2] WHERE sum(x) > 0 | x]}) RETURN n', 'sum()'],
                ['UNWIND [1] AS i RETURN i ORDER BY size([x IN [1, 2] WHERE sum(x) > 0 | x])', 'sum()'],
                ['UNWIND [1] AS i WITH i ORDER BY size([x IN [1, 2] WHERE sum(x) > 0 | x]) RETURN i', 'sum()'],
                ['MATCH (n) WHERE reduce(s = 0, x IN [1] | s + count(x)) > 0 RETURN n', 'count()'],
                ['MATCH (n) WHERE (n)-->({v: [x IN [1] WHERE sum(x) > 0 | x]}) RETURN n', 'sum()']
            ].forEach(([cypher, aggregate]) =>
                expect([store, cypher, refusal(compiler, cypher)]).toEqual([store, cypher, where(aggregate)])
            );
            // A WHERE over what an aggregate gave, or in a subquery or a CALL that aggregates in its own query, is compiled, as Neo4j runs it.
            [
                'UNWIND [1, 2] AS i WITH count(*) AS c WHERE c > 1 RETURN c',
                'UNWIND [1, 2] AS i WITH collect(i) AS l WHERE size(l) > 1 RETURN l',
                'MATCH (n) RETURN COUNT { MATCH (n)-->(m) WITH count(m) AS c WHERE c > 0 RETURN c } AS k',
                'MATCH (n) WHERE EXISTS { MATCH (n)-->(m) WITH count(m) AS c WHERE c > 0 RETURN c } RETURN n.x',
                'MATCH (n) CALL (n) { MATCH (n)-->(m) WITH count(m) AS c WHERE c > 0 RETURN c } RETURN n.x, c',
                'MATCH (n) WITH n, count { (n)-->() } AS c WHERE c > 0 RETURN n.x',
                'UNWIND [{a: 1}, {a: 2}] AS x RETURN x.a, count(*)',
                'UNWIND [1, 2] AS x RETURN x, collect(x)'
            ].forEach((cypher) =>
                expect([store, cypher, refusal(compiler, cypher)]).toEqual([store, cypher, undefined])
            );
        });
    });

    it("an aggregating item or order term that names a variable no item groups by, in a comprehension's or a pattern's body too, is refused", () => {
        // drivine4j's #482 (#488 here): Neo4j's 42I18, "reference to non-grouping sub-expression". The body of a comprehension, a
        // quantifier, a reduce() or a pattern was not read for the variables it names, nor an order term at all. Beside the spec's
        // "Implicit grouping key in a body or an ORDER BY", those drivine4j holds of its own.
        const item = (name: string, variable: string): string =>
            `${name} aggregates, and names ${variable} outside its aggregates, which no other item is: ` +
            `Cypher would group by it without being told. Aggregate in a WITH first, as in WITH ${variable}, collect(…) AS items RETURN { … }.`;
        const sort = (variable: string): string =>
            `A term of an ORDER BY aggregates, and names ${variable} outside its aggregates and the items: ` +
            "Cypher would group by it without being told. Order by an item's name, or by an expression of the items and aggregates.";
        compilers.forEach(([store, compiler]) => {
            [
                ['UNWIND [1, 2] AS x UNWIND [3] AS z RETURN x, [y IN collect(z) | y + z] AS l', item('l', 'z')],
                [
                    'UNWIND [1, 2] AS x UNWIND [3] AS z WITH x, [y IN collect(z) | y + z] AS l RETURN x, l',
                    item('l', 'z')
                ],
                ['UNWIND [1, 2] AS x UNWIND [3] AS z RETURN x, [y IN collect(x) WHERE y > z | y] AS l', item('l', 'z')],
                ['UNWIND [1, 2] AS x UNWIND [3] AS z RETURN x, any(y IN collect(x) WHERE y > z) AS l', item('l', 'z')],
                ['UNWIND [1, 2] AS x UNWIND [3] AS z RETURN x, reduce(s = 0, y IN collect(x) | s + z) AS l', item('l', 'z')],
                ['UNWIND [{a: 1, b: 2}] AS x RETURN x.a, [y IN collect(x) | y.a + x.b] AS l', item('l', 'x')],
                ['MATCH (n) RETURN size([(n)-->(m) | m]) + count(*) AS c', item('c', 'n')],
                ['MATCH (n) RETURN n.x, size([(n)-->(m) | m.x]) + count(*) AS c', item('c', 'n')],
                ['MATCH (n) RETURN EXISTS { (n)-->() } AND count(*) > 0 AS b', item('b', 'n')],
                ['UNWIND [{a: 1}, {a: 2}] AS x RETURN x.a AS a, count(*) AS c ORDER BY x.b + count(*)', sort('x')],
                ['UNWIND [{a: 1, b: 2}] AS x WITH x.a AS a, count(*) AS c ORDER BY x.b + count(*) RETURN a', sort('x')],
                ['UNWIND [1, 2] AS x UNWIND [3] AS z RETURN x, count(*) AS c ORDER BY z + count(*)', sort('z')],
                ['UNWIND [1, 2] AS x UNWIND [3] AS z RETURN x, count(*) AS c ORDER BY [w IN collect(z) | w + z]', sort('z')],
                [
                    'MATCH (me:Person)--(you:Person) RETURN count(you.age) AS agg ORDER BY me.age + count(you.age)',
                    sort('me')
                ],
                [
                    'MATCH (me:Person)--(you:Person) WITH count(you.age) AS agg ORDER BY me.age + count(you.age) RETURN agg',
                    sort('me')
                ],
                [
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p AS q, count(*) AS c ORDER BY size(keys(m {.title})) + count(*)',
                    sort('m')
                ],
                // Neo4j runs these, but reads p in the pattern as a new variable that matches any node, not as the key q is.
                [
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p AS q, count(*) AS c ORDER BY size([(p)-[:KNOWS]->(k) | k]) + count(*)',
                    sort('p')
                ],
                [
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p AS q, count(*) AS c ORDER BY EXISTS { (p)-[:KNOWS]->() } AND count(*) > 1',
                    sort('p')
                ]
            ].forEach(([cypher, message]) =>
                expect([store, cypher, refusal(compiler, cypher)]).toEqual([store, cypher, message])
            );
            // A body or an order term that names only what the projection groups by, an item's name, or a variable of its own is
            // compiled, as Neo4j runs it.
            [
                'UNWIND [1, 2] AS x RETURN x, [y IN collect(x) | y + x] AS l',
                'UNWIND [1, 2] AS x RETURN x, collect(x) AS c',
                'UNWIND [1, 2] AS x RETURN [x IN collect(x) | x + 1] AS l',
                'UNWIND [1, 2] AS x RETURN x, reduce(s = 0, y IN collect(x) | s + y + x) AS l',
                'UNWIND [{a: 1}, {a: 2}] AS x RETURN x.a, count(*) AS c',
                'UNWIND [{a: 1}] AS x RETURN x.a, [y IN collect(x) | y.a + x.a] AS l',
                'MATCH (p:Person)-[r:ACTED_IN]->(m) RETURN p.name, size([x IN collect(r) WHERE x.role <> p.name]) AS n',
                'MATCH (n) RETURN n, size([(n)-->(m) | m]) + count(*) AS c',
                'MATCH (n) RETURN n, EXISTS { (n)-->() } AND count(*) > 0 AS b',
                'UNWIND [{a: 1}, {a: 2}] AS x RETURN x.a AS a, count(*) AS c ORDER BY x.a + count(*)',
                'UNWIND [1, 2] AS x RETURN x AS y, count(*) AS c ORDER BY x + count(*)',
                'UNWIND [1, 2] AS x RETURN x AS y, count(*) AS c ORDER BY y + count(*)',
                'UNWIND [{a: 1, b: 2}] AS x RETURN x.a + x.b, count(*) AS cnt ORDER BY x.a + x.b + count(*)',
                // A key matched whole however it is written: spaced, bracketed, or its function named in another case, as Neo4j
                // names a function.
                "UNWIND [{a: 'x'}] AS x RETURN toUpper(x.a), count(*) AS c ORDER BY toUpper(x.a) + count(*)",
                "UNWIND [{a: 'x'}] AS x RETURN toUpper( x.a ) AS u, count(*) AS c ORDER BY (toUpper(x . a))+count(*)",
                "UNWIND [{a: 'x'}] AS x RETURN toUpper(x.a), count(*) AS c ORDER BY TOUPPER(x.a) + count(*)",
                'UNWIND [1, 2] AS x UNWIND [3] AS z RETURN x, count(*) AS c ORDER BY [w IN collect(z) | w + x]',
                // A key an item renames, named by an order term's map projection, or by a pattern where no item renames it.
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p AS q, count(*) AS c ORDER BY size(keys(p {.name})) + count(*)',
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p AS q, count(*) AS c ORDER BY p {.born}.born + count(*)',
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p, count(*) AS c ORDER BY size([(p)-[:KNOWS]->(k) | k]) + count(*)',
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p, count(*) AS c ORDER BY EXISTS { (p)-[:KNOWS]->() } AND count(*) > 1'
            ].forEach((cypher) =>
                expect([store, cypher, refusal(compiler, cypher)]).toEqual([store, cypher, undefined])
            );
        });
    });

    it("an aggregating item reads a key that is a variable or a variable's property, and an order term a key written in any case", () => {
        // drivine4j's #491 (#494 here): Neo4j reads `x.a` in `x.a + count(*)` as the key `x.a`, but no key of another shape
        // there (its 42I18), in a body too, and in a pattern's parts only a key that is a variable. It names a function in
        // any case. Beside the spec's "Implicit grouping key" and "Implicit grouping key in a body or an ORDER BY", those
        // drivine4j holds of its own.
        const item = (name: string, variable: string): string =>
            `${name} aggregates, and names ${variable} outside its aggregates, which no other item is: ` +
            `Cypher would group by it without being told. Aggregate in a WITH first, as in WITH ${variable}, collect(…) AS items RETURN { … }.`;
        compilers.forEach(([store, compiler]) => {
            [
                ['UNWIND [{a: 1, b: 2}] AS x RETURN x.a AS a, x.b + count(*) AS c', item('c', 'x')],
                [
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN toUpper(p.name) AS u, toUpper(p.name) + count(*) AS c ORDER BY u',
                    item('c', 'p')
                ],
                [
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN toUpper(p.name) AS u, [t IN collect(m.title) | t + toUpper(p.name)] AS c ORDER BY u',
                    item('c', 'p')
                ],
                // Matched whole however its function is named, but read in a body, a key of that shape is refused all the same.
                [
                    "UNWIND [{a: 'x'}] AS x RETURN toUpper(x.a), size([y IN collect(x) WHERE ToUpper(y.a) = TOUPPER(x.a)]) AS n",
                    item('n', 'x')
                ],
                [
                    'UNWIND [{a: {b: 1}}, {a: {b: 1}}, {a: {b: 2}}] AS x RETURN x.a.b AS k, x.a.b + count(*) AS c ORDER BY k',
                    item('c', 'x')
                ],
                [
                    'UNWIND [{a: {b: 1}}, {a: {b: 1}}, {a: {b: 2}}] AS x RETURN x.a.b AS k, [y IN collect(x) | y.a.b + x.a.b] AS c ORDER BY k',
                    item('c', 'x')
                ],
                [
                    'UNWIND [{a: 1}, {a: 1}, {a: 2}] AS x RETURN x.a + 1 AS k, x.a + 1 + count(*) AS c ORDER BY k',
                    item('c', 'x')
                ],
                [
                    "UNWIND [{a: 1}, {a: 1}, {a: 2}] AS x RETURN x['a'] AS a, x['a'] + count(*) AS b ORDER BY a",
                    item('b', 'x')
                ],
                [
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p.name AS name, size([(q:Person)-[:KNOWS]->() WHERE q.name = p.name | q]) + count(*) AS c ORDER BY name',
                    item('c', 'p')
                ],
                [
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p.name AS name, [x IN collect(m) | size([(x)<-[:ACTED_IN]-(q) WHERE q.name = p.name | q])] AS c ORDER BY name',
                    item('c', 'p')
                ],
                // Unnamed, the map projection is the item p, not the variable.
                [
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p {.name}, count(*) + size(p.name) AS c ORDER BY p.name',
                    item('c', 'p')
                ],
                [
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p {.name} AS q, p {.name}.name + count(*) AS c',
                    item('c', 'p')
                ]
            ].forEach(([cypher, message]) =>
                expect([store, cypher, refusal(compiler, cypher)]).toEqual([store, cypher, message])
            );
            [
                'MATCH (x) RETURN x.a AS a, x.a + count(*) AS b',
                'UNWIND [{a: 1}, {a: 1}, {a: 2}] AS x RETURN x.a, x.a + count(*) AS b ORDER BY x.a',
                'UNWIND [{a: 1}, {a: 1}, {a: 2}] AS x RETURN x.a + count(*) AS b, x.a AS a ORDER BY a',
                'UNWIND [{a: 1}, {a: 1}, {a: 2}] AS x RETURN x.a AS a, count(*) + x.a AS b, max(x.a) - x.a AS c ORDER BY a',
                "MATCH (:Person)-[r:ACTED_IN]->(m) RETURN r.role AS role, CASE WHEN r.role STARTS WITH 'N' THEN count(*) ELSE 0 END AS n ORDER BY role",
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p.name, reduce(s = p.name, t IN collect(m.title) | s + t) AS r ORDER BY p.name',
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p.name, p.name IN collect(m.title) AS r ORDER BY p.name',
                'UNWIND [{a: {b: 1}}, {a: {b: 1}}, {a: {b: 2}}] AS x RETURN x.a AS k, [y IN collect(x) | x.a.b] AS c ORDER BY c',
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p AS q, p.name + count(*) AS c ORDER BY c',
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p {.name}, collect(m.title) AS ts ORDER BY p.name',
                'MATCH (p:Person)-[:ACTED_IN]->(m) WITH p {.name}, count(*) AS c RETURN p.name, c ORDER BY p.name',
                "UNWIND [{a: 'x'}, {a: 'x'}, {a: 'y'}] AS x RETURN toUpper(x.a), count(*) ORDER BY TOUPPER(x.a) + count(*)",
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN toUpper(p.name) AS u, COUNT(m) AS c ORDER BY toUpper(p.name) + count(m) DESC'
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
