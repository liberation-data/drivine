import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
// The script is plain JavaScript, run by nightly.yml; its functions are typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { LIMIT, judge, regressions, summary }: Record<string, any> = require(
    path.join(ROOT, 'scripts/bench-regression.js')
);

/** The bench's numbers, as scripts/bench-compiler.js writes them with `--json`: warm medians by store, in ms. */
function numbers(medians: Record<string, number>, version: string = '0.32.0') {
    return {
        compiler: { name: '@liberation-data/drivine-cypher-compiler', version },
        stores: Object.fromEntries(
            Object.entries(medians).map(([store, warmMedianMs]) => [
                store,
                { coldLoadMs: 50, firstCompileMs: 10, warmMedianMs, warmP99Ms: warmMedianMs * 10 }
            ])
        )
    };
}

/** A bench faked: each run gives the next numbers, and a run past them fails the test. */
function bench(...runs: ReturnType<typeof numbers>[]) {
    const fake = jest.fn(() => {
        const next = runs.shift();
        if (next === undefined) {
            throw new Error('The bench was run more often than expected.');
        }
        return next;
    });
    return fake;
}

const BASELINE = numbers({ postgres: 0.25, oracle: 0.5, sqlite: 0.25 });

describe('The nightly check of the compiler bench (scripts/bench-regression.js)', () => {
    it('passes, on one run, when every warm median is within the limit of the last nightly', () => {
        const run = bench(numbers({ postgres: 0.3, oracle: 0.74, sqlite: 0.2 }));
        const verdict = judge(BASELINE, run);
        expect(verdict.outcome).toBe('pass');
        expect(run).toHaveBeenCalledTimes(1);
        expect(summary(BASELINE, verdict)).toContain(`within ${LIMIT}x`);
    });

    it('fails when a warm median is over the limit in the run and in the rerun', () => {
        const run = bench(
            numbers({ postgres: 0.25, oracle: 0.8, sqlite: 0.25 }),
            numbers({ postgres: 0.25, oracle: 0.9, sqlite: 0.25 })
        );
        const verdict = judge(BASELINE, run);
        expect(verdict.outcome).toBe('fail');
        expect(run).toHaveBeenCalledTimes(2);
        expect(verdict.numbers.stores.oracle.warmMedianMs).toBe(0.9);
        expect(verdict.runs[1]).toEqual([{ store: 'oracle', before: 0.5, after: 0.9, ratio: 1.8 }]);
        expect(summary(BASELINE, verdict)).toContain('**Regressed:**');
        expect(summary(BASELINE, verdict)).toContain('oracle (1.80x)');
    });

    it('passes when the run is over the limit and the rerun within it, judging by the rerun', () => {
        const run = bench(
            numbers({ postgres: 0.4, oracle: 0.5, sqlite: 0.25 }),
            numbers({ postgres: 0.26, oracle: 0.5, sqlite: 0.25 })
        );
        const verdict = judge(BASELINE, run);
        expect(verdict.outcome).toBe('pass-on-rerun');
        expect(run).toHaveBeenCalledTimes(2);
        expect(verdict.numbers.stores.postgres.warmMedianMs).toBe(0.26);
        expect(summary(BASELINE, verdict)).toContain('postgres (1.60x)');
    });

    it('records the numbers and passes without the last nightly', () => {
        const tonight = numbers({ postgres: 9, oracle: 9, sqlite: 9 });
        const run = bench(tonight);
        const verdict = judge(undefined, run);
        expect(verdict.outcome).toBe('no-baseline');
        expect(verdict.numbers).toBe(tonight);
        expect(run).toHaveBeenCalledTimes(1);
        expect(summary(undefined, verdict)).toContain('nothing is compared');
    });

    it('fails on a rise just over the limit, and not at it', () => {
        expect(regressions(BASELINE, numbers({ postgres: 0.25 * LIMIT }))).toEqual([]);
        expect(regressions(BASELINE, numbers({ postgres: 0.25 * LIMIT + 0.001 }))).toHaveLength(1);
    });

    it("leaves out a store the last nightly hadn't, and says the compiler's version changed", () => {
        const before = numbers({ postgres: 0.25 }, '0.31.0');
        const tonight = numbers({ postgres: 0.25, oracle: 5 });
        expect(regressions(before, tonight)).toEqual([]);
        const text = summary(before, judge(before, bench(tonight)));
        expect(text).toContain('| oracle | none | 5.000 |  |');
        expect(text).toContain('The compiler is 0.32.0 tonight, and was 0.31.0.');
    });
});
