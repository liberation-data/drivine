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

    it('round() of two arguments, a precision below 0 when cut toward zero, written, negated or given', () => {
        // Not in the spec's refusals yet, which name the message for three arguments alone.
        compilers.forEach(([, compiler]) => {
            (
                [
                    ['RETURN round(1234.5, -2)', {}],
                    ['RETURN round(1234.5, -1.2)', {}],
                    ['RETURN round(1234.5, -$p)', { p: 2 }],
                    ['RETURN round(1234.5, $p)', { p: -2.5 }]
                ] as const
            ).forEach(([cypher, parameters]) => {
                expect(() => compiler().compile(cypher, parameters)).toThrow(
                    'round() takes a precision of 0 or more, as in Neo4j.'
                );
            });
            // -0.5 and -0.9 cut toward zero are 0 places.
            expect(() =>
                compiler().compile("RETURN [round(1234.5, -0.5), round(1234.5, $p, 'HALF_UP')]", { p: -0.9 })
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

    it('a statement that is not Cypher, with where it goes wrong', () => {
        expect(() => new PostgresCypherCompiler('g').compile('MATCH (n RETURN n')).toThrow(
            "The statement is not Cypher, at line 1, column 10: no viable alternative at input 'MATCH (n RETURN'"
        );
    });
});
