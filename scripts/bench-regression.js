/**
 * Whether the shared Cypher compiler's warm compile, or a store's first compile, has regressed since the last nightly
 * that passed: nightly.yml runs this on master each night. See #685.
 *
 *     node scripts/bench-regression.js <the last nightly's numbers, compiler-bench.json> <tonight's, to write>
 *
 * It runs the bench (scripts/bench-compiler.js, which needs `npm run build`) and compares each store's warm median and
 * first compile (MEASURES) with the last nightly's. It fails (exits 1) when one rose by more than half (LIMIT), and only
 * when one still has after one more run of the bench: a shared runner is noisy, and a second run filters most of it.
 * Without the last nightly's numbers (the first night, or theirs have expired), it records tonight's and passes; a
 * measure the last nightly's numbers haven't, such as the first compile before the bench timed it apart from the load,
 * is recorded and not compared that night. The bench's own budget, the load, fails it too, as it fails the bench. It writes the numbers of the run it judged by to the second file, which
 * nightly.yml uploads for the next night, and appends what it found to $GITHUB_STEP_SUMMARY on GitHub Actions.
 *
 * There are no absolute ceilings for the warm compile: shared runners differ too much from run to run. A regression it
 * fails on is compared with again each night until a nightly passes, and a nightly that passes is the next baseline.
 * The summary says when the compiler's version or the machine differs from the last nightly's. A slowdown that is
 * accepted is recorded as the baseline by running the nightly by hand with `record-bench`, which gives this no file
 * of the last nightly's.
 */
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// How far a store's measure may rise over the last nightly's: by half.
const LIMIT = 1.5;
// The measures compared, each a store's number in the bench's JSON, with what the summary calls it.
const MEASURES = { warmMedianMs: 'warm median', firstCompileMs: 'first compile' };

/**
 * A store's `measure` in the last nightly's numbers, or undefined when they haven't it. Before the bench timed the
 * first compile apart from the load (`loadMs`), its `firstCompileMs` was of the spec's statement, another measure, so
 * it is no baseline for tonight's.
 */
function before(baseline, store, measure) {
    const numbers = baseline.stores[store];
    if (numbers === undefined || (measure === 'firstCompileMs' && numbers.loadMs === undefined)) return undefined;
    return numbers[measure];
}

/**
 * Each store's measure in `current` that is over LIMIT times `baseline`'s, with both and their ratio. A measure
 * `baseline` hasn't is left out.
 */
function regressions(baseline, current) {
    return Object.entries(current.stores)
        .flatMap(([store, it]) =>
            Object.keys(MEASURES).map((measure) => {
                const was = before(baseline, store, measure);
                return was === undefined
                    ? undefined
                    : { store, measure, before: was, after: it[measure], ratio: it[measure] / was };
            })
        )
        .filter((it) => it !== undefined && it.ratio > LIMIT);
}

/**
 * The verdict on the bench, whose run `bench` gives the numbers of, against `baseline` (undefined without one):
 * `no-baseline`, `pass`, `pass-on-rerun` or `fail`, with the numbers it was reached on, and the runs' regressions.
 */
function judge(baseline, bench) {
    const first = bench();
    if (baseline === undefined) {
        return { outcome: 'no-baseline', numbers: first, runs: [] };
    }
    const found = regressions(baseline, first);
    if (found.length === 0) {
        return { outcome: 'pass', numbers: first, runs: [found] };
    }
    const second = bench();
    const again = regressions(baseline, second);
    return { outcome: again.length === 0 ? 'pass-on-rerun' : 'fail', numbers: second, runs: [found, again] };
}

const ms = (value) => value.toFixed(3);

/** What the verdict says, as Markdown. */
function summary(baseline, verdict) {
    const lines = ['### The warm and first compile against the last nightly', ''];
    if (verdict.outcome === 'no-baseline') {
        lines.push(
            'There are no numbers of a nightly to compare with (none left any, or the run is by hand with record-bench),' +
                " so tonight's are recorded, and nothing is compared."
        );
        return lines.join('\n');
    }
    if (baseline.compiler?.version !== verdict.numbers.compiler?.version) {
        lines.push(
            `The compiler is ${verdict.numbers.compiler?.version} tonight, and was ${baseline.compiler?.version}.`,
            ''
        );
    }
    // A runner of another kind can be slower by itself, which a rerun on it doesn't filter out.
    if (baseline.machine !== verdict.numbers.machine) {
        lines.push(`The machine is ${verdict.numbers.machine} tonight, and was ${baseline.machine}.`, '');
    }
    const header = ['Store', 'Measure', 'Last nightly, ms', 'Tonight, ms', 'Rise'];
    const unmatched = [];
    const rows = Object.entries(verdict.numbers.stores).flatMap(([store, it]) =>
        Object.entries(MEASURES).map(([measure, called]) => {
            const was = before(baseline, store, measure);
            if (was === undefined) {
                unmatched.push(`${store}'s ${called}`);
                return [store, called, 'none', ms(it[measure]), ''];
            }
            return [store, called, ms(was), ms(it[measure]), `${(it[measure] / was).toFixed(2)}x`];
        })
    );
    lines.push(...[header, header.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`), '');
    if (unmatched.length > 0) {
        lines.push(
            `The last nightly's numbers have no ${unmatched.join(', ')}, so tonight's are recorded, and not compared.`,
            ''
        );
    }
    const named = (found) =>
        found.map((it) => `${it.store}'s ${MEASURES[it.measure]} (${it.ratio.toFixed(2)}x)`).join(', ');
    if (verdict.outcome === 'pass') {
        lines.push(`Every measure compared is within ${LIMIT}x of the last nightly's.`);
    } else if (verdict.outcome === 'pass-on-rerun') {
        lines.push(
            `The first run was over ${LIMIT}x on ${named(
                verdict.runs[0]
            )}, and a second run, above, was within it: noise.`
        );
    } else {
        lines.push(`**Regressed:** over ${LIMIT}x of the last nightly's, in two runs: ${named(verdict.runs[1])}.`);
    }
    return lines.join('\n');
}

/** A run of the bench, its numbers read from the JSON it writes. */
function runBench() {
    const into = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-bench-'));
    try {
        const file = path.join(into, 'compiler-bench.json');
        const result = childProcess.spawnSync(
            process.execPath,
            [path.join(__dirname, 'bench-compiler.js'), '--json', file],
            { stdio: 'inherit' }
        );
        if (result.status !== 0) {
            throw new Error(`The bench failed (exit ${result.status ?? result.signal}).`);
        }
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } finally {
        fs.rmSync(into, { recursive: true, force: true });
    }
}

function main() {
    const [, , baselineFile, outFile] = process.argv;
    if (!baselineFile || !outFile) {
        throw new Error('Usage: node scripts/bench-regression.js <last nightly.json> <tonight.json>');
    }
    const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : undefined;
    const verdict = judge(baseline, runBench);
    fs.writeFileSync(outFile, `${JSON.stringify(verdict.numbers, null, 4)}\n`);
    const text = summary(baseline, verdict);
    console.log(`\n${text}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${text}\n`);
    }
    if (verdict.outcome === 'fail') process.exitCode = 1;
}

module.exports = { LIMIT, MEASURES, regressions, judge, summary };

if (require.main === module) {
    main();
}
