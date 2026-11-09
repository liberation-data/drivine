import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
// The script is plain JavaScript, run by nightly.yml; its functions are typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { LIMIT, judge, regressions, summary }: Record<string, any> = require(
    path.join(ROOT, 'scripts/bench-regression.js')
);

/**
 * The bench's numbers, as scripts/bench-compiler.js writes them with `--json`: warm medians by store, in ms, and each
 * store's first compile, 20 ms unless `firsts` gives it.
 */
function numbers(
    medians: Record<string, number>,
    version: string = '0.32.0',
    machine: string = 'AMD EPYC 7763 x4',
    firsts: Record<string, number> = {}
) {
    return {
        machine,
        compiler: { name: '@liberation-data/drivine-cypher-compiler', version },
        stores: Object.fromEntries(
            Object.entries(medians).map(([store, warmMedianMs]) => [
                store,
                {
                    loadMs: 100,
                    firstCompileMs: firsts[store] ?? 20,
                    nextCompileMs: 5,
                    warmMedianMs,
                    warmP99Ms: warmMedianMs * 10
                }
            ])
        )
    };
}

/**
 * Numbers as the bench wrote them before it timed the first compile apart from the load: a `coldLoadMs` and no
 * `loadMs`, and a `firstCompileMs` that was the spec statement's.
 */
function numbersBeforeTheSplit(medians: Record<string, number>) {
    return {
        ...numbers(medians),
        stores: Object.fromEntries(
            Object.entries(medians).map(([store, warmMedianMs]) => [
                store,
                { coldLoadMs: 120, firstCompileMs: 2, warmMedianMs, warmP99Ms: warmMedianMs * 10 }
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

const BASELINE_MEDIANS = { postgres: 0.25, oracle: 0.5, sqlite: 0.25 };
const MACHINE = 'AMD EPYC 7763 x4';
const BASELINE = numbers(BASELINE_MEDIANS);

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
        expect(verdict.runs[1]).toEqual([
            { store: 'oracle', measure: 'warmMedianMs', before: 0.5, after: 0.9, ratio: 1.8 }
        ]);
        expect(summary(BASELINE, verdict)).toContain('**Regressed:**');
        expect(summary(BASELINE, verdict)).toContain("oracle's warm median (1.80x)");
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
        expect(summary(BASELINE, verdict)).toContain("postgres's warm median (1.60x)");
    });

    it("fails when a store's first compile is over the limit in the run and in the rerun", () => {
        const run = bench(
            numbers(BASELINE_MEDIANS, '0.32.0', MACHINE, { postgres: 35 }),
            numbers(BASELINE_MEDIANS, '0.32.0', MACHINE, { postgres: 40 })
        );
        const verdict = judge(BASELINE, run);
        expect(verdict.outcome).toBe('fail');
        expect(run).toHaveBeenCalledTimes(2);
        expect(verdict.runs[1]).toEqual([
            { store: 'postgres', measure: 'firstCompileMs', before: 20, after: 40, ratio: 2 }
        ]);
        const text = summary(BASELINE, verdict);
        expect(text).toContain(
            "**Regressed:** over 1.5x of the last nightly's, in two runs: postgres's first compile (2.00x)."
        );
        expect(text).toContain('| postgres | first compile | 20.000 | 40.000 | 2.00x |');
    });

    it("passes when a store's first compile is over the limit in the run and within it in the rerun", () => {
        const run = bench(
            numbers(BASELINE_MEDIANS, '0.32.0', MACHINE, { sqlite: 31 }),
            numbers(BASELINE_MEDIANS, '0.32.0', MACHINE, { sqlite: 22 })
        );
        const verdict = judge(BASELINE, run);
        expect(verdict.outcome).toBe('pass-on-rerun');
        expect(run).toHaveBeenCalledTimes(2);
        expect(verdict.numbers.stores.sqlite.firstCompileMs).toBe(22);
        expect(summary(BASELINE, verdict)).toContain("sqlite's first compile (1.55x)");
    });

    it('compares no first compile with numbers from before the bench timed it apart from the load, saying so', () => {
        const before = numbersBeforeTheSplit(BASELINE_MEDIANS);
        const run = bench(numbers(BASELINE_MEDIANS, '0.32.0', MACHINE, { postgres: 70, oracle: 25, sqlite: 22 }));
        const verdict = judge(before, run);
        expect(verdict.outcome).toBe('pass');
        expect(run).toHaveBeenCalledTimes(1);
        const text = summary(before, verdict);
        expect(text).toContain('| postgres | first compile | none | 70.000 |  |');
        expect(text).toContain('| postgres | warm median | 0.250 | 0.250 | 1.00x |');
        // Their warm medians are still compared.
        expect(regressions(before, numbers({ ...BASELINE_MEDIANS, oracle: 0.9 }))).toEqual([
            { store: 'oracle', measure: 'warmMedianMs', before: 0.5, after: 0.9, ratio: 1.8 }
        ]);
        expect(text).toContain(
            "The last nightly's numbers have no first compile on postgres, oracle, sqlite, so tonight's are recorded," +
                ' and not compared.'
        );
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
        expect(text).toContain('| oracle | warm median | none | 5.000 |  |');
        expect(text).toContain('| oracle | first compile | none | 20.000 |  |');
        expect(text).toContain(
            "The last nightly's numbers have no warm median on oracle, and no first compile on oracle, so tonight's"
        );
        expect(text).toContain('The compiler is 0.32.0 tonight, and was 0.31.0.');
        expect(text).not.toContain('The machine is');
    });

    it('says the machine changed', () => {
        const tonight = numbers({ postgres: 0.25 }, '0.32.0', 'Intel Xeon 8370C x4');
        const text = summary(BASELINE, judge(BASELINE, bench(tonight)));
        expect(text).toContain('The machine is Intel Xeon 8370C x4 tonight, and was AMD EPYC 7763 x4.');
        expect(text).not.toContain('The compiler is');
    });
});
