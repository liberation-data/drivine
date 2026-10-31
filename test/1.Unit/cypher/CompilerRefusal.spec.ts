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
