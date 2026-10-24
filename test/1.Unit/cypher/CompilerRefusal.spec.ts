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

    it('a statement that is not Cypher, with where it goes wrong', () => {
        expect(() => new PostgresCypherCompiler('g').compile('MATCH (n RETURN n')).toThrow(
            "The statement is not Cypher, at line 1, column 10: no viable alternative at input 'MATCH (n RETURN'"
        );
    });
});
