import { check, CypherCase, CypherStep, HELD, loadSpec } from '../../cypher/CypherSpec';

/**
 * A held step must still fail, by rows or a message not as the spec says, or as the store fails: one the runner crashes
 * on is no hold. The case is one the test holds, its step 2 held on Oracle, beside what HELD holds already, which is put
 * back after.
 */
describe('The Cypher spec runner holds a step', () => {
    const holds = HELD['queries.yaml'];

    beforeAll(() => {
        HELD['queries.yaml'] = { ...holds, 'NaN worked out': [{ issue: 512, steps: [2], on: ['oracle'] }] };
    });

    afterAll(() => {
        HELD['queries.yaml'] = holds;
    });

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
        // A row that refers to itself, which the runner can't put in order to compare: it overflows the stack.
        const loop: Record<string, unknown> = {};
        loop.self = loop;
        await expect(oracle(held(step), async () => await Promise.resolve([loop]))).rejects.toThrow(RangeError);
    });

    it("by another repository's issue, named with its repository", async () => {
        HELD['queries.yaml']['NaN worked out'] = [{ issue: 'drivine-cypher-spec#320', steps: [2], on: ['sql'] }];
        try {
            await expect(oracle(held(step), async () => await Promise.resolve([1]))).rejects.toThrow(
                /step 2 is held on oracle for liberation-data\/drivine-cypher-spec#320, and passes/
            );
        } finally {
            HELD['queries.yaml']['NaN worked out'] = [{ issue: 512, steps: [2], on: ['oracle'] }];
        }
    });

    it('that may pass where it says why, and fails otherwise as any hold does', async () => {
        HELD['queries.yaml']['NaN worked out'] = [
            { issue: 'drivine-cypher-spec#320', steps: [2], on: ['oracle'], mayPass: 'the stack differs by platform' }
        ];
        try {
            await oracle(held(step), async () => await Promise.resolve([1]));
            await oracle(held(step), async () => await Promise.resolve([2]));
            const loop: Record<string, unknown> = {};
            loop.self = loop;
            await expect(oracle(held(step), async () => await Promise.resolve([loop]))).rejects.toThrow(RangeError);
        } finally {
            HELD['queries.yaml']['NaN worked out'] = [{ issue: 512, steps: [2], on: ['oracle'] }];
        }
    });

    it('only on the stores its hold names', async () => {
        await expect(
            check('queries.yaml', held(step), 1, 'neo4j', async () => await Promise.resolve([2]))
        ).rejects.toThrow(/Expected: \[1\]/);
    });
});

describe('Each hold of the Cypher spec runner', () => {
    it('names a case of its file, and steps the case has', () => {
        const stale = Object.entries(HELD).flatMap(([file, cases]) => {
            const spec = loadSpec(file);
            return Object.entries(cases)
                .filter(([name, holds]) => {
                    const found = spec.cases.find((it) => it.name === name);
                    return (
                        !found ||
                        holds.some(
                            (hold) => hold.steps !== 'all' && hold.steps.some((n) => n < 1 || n > found.steps.length)
                        )
                    );
                })
                .map(([name]) => `${file}: ${name}`);
        });
        expect(stale).toEqual([]);
    });
});
