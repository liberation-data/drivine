import { check, CypherCase, CypherStep } from '../../cypher/CypherSpec';

/**
 * A held step must still fail, by rows or a message not as the spec says, or as the store fails: one the runner crashes
 * on is no hold. The case is one HELD names, its step 2 held on Oracle.
 */
describe('The Cypher spec runner holds a step', () => {
    const held = (step: CypherStep): CypherCase => ({ name: 'NaN worked out', steps: [{ cypher: 'RETURN 0' }, step] });
    const step: CypherStep = { cypher: 'RETURN 1', rows: [1] };
    const oracle = async (cypherCase: CypherCase, run: () => Promise<any[]>): Promise<void> =>
        await check('queries.yaml', cypherCase, 1, 'oracle', run);

    it('that passes, failing the case', async () => {
        await expect(oracle(held(step), async () => await Promise.resolve([1]))).rejects.toThrow(
            /step 2 is held on oracle for liberation-data\/drivine#512, and passes/
        );
    });

    it('that gives other rows, or that the store fails', async () => {
        await oracle(held(step), async () => await Promise.resolve([2]));
        await oracle(held(step), async () => await Promise.reject(new Error('ORA-00900')));
    });

    it('that is to fail, and fails otherwise or not at all', async () => {
        const refused = held({ cypher: 'RETURN 1', error: 'Refused' });
        await oracle(refused, async () => await Promise.reject(new Error('Other')));
        await oracle(refused, async () => await Promise.resolve([1]));
    });

    it('but not one the runner crashes on', async () => {
        await expect(oracle(held(step), async () => await Promise.resolve([BigInt(1)]))).rejects.toThrow(TypeError);
    });

    it('only on the stores its hold names', async () => {
        await expect(check('queries.yaml', held(step), 1, 'neo4j', async () => await Promise.resolve([2]))).rejects.toThrow(
            /Expected: \[1\]/
        );
    });
});
