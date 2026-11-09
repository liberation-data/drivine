/**
 * Measures the shared Cypher compiler (`@liberation-data/drivine-cypher-compiler`, the drivine-cypher-spec module built
 * for Wasm) as Drivine runs it, on Postgres, Oracle and SQLite: through the built `dist/cypher/SharedCypherCompiler.js`,
 * which writes each request and reads each answer as a connection's compile does. Only compiling: no store is started.
 * See #685.
 *
 *     npm run build
 *     npm run bench:compiler [-- --json <file>]
 *
 * Each cold number is timed in a fresh Node process that has loaded Drivine (`dist/index.js`) already, over several
 * such processes. Together they are what an application pays on its first SQL statements:
 * - Load: the package's require, resolved as SharedCypherCompiler resolves it, and its first `compile`, of a request
 *   that names no store (`{}`, which the compiler answers with an error). That is when the package reads and
 *   instantiates its Wasm module, with none of a store's compile work, so it is the same for every store.
 * - First compile: the store's first compile, of `RETURN 1`, through SharedCypherCompiler, the module started.
 * - Next compile: the compile after it, in the same process, of the spec's first statement that compiles on the store.
 * - Warm compile: each statement of the spec in `test/cypher` that compiles on the store, over several rounds after a
 *   warm-up, each timed from a new SharedCypherCompiler to the CompiledCypher, as a connection compiles. The parameters
 *   are the spec's, as its runner binds them on a SQL store (test/2.Integration/cypher/CypherSpec.spec.ts).
 * - Refused: the statements the compiler refuses, which the spec has refused or doesn't run on the store. A request
 *   error is a request the compiler can't read, so a fault in how Drivine writes it, not a refusal.
 *
 * It fails (exits 1) when the median load, in a store's cold processes, is over 150 ms: #685's budget, which is for the
 * load alone, as a store's first compile differs from store to store. Beside the warm medians it prints the pre-switch
 * numbers of #685, Drivine's own compiler (src/cypher/sql, since deleted) on an Apple M2 Max, for reference only:
 * they're of another machine and a compiler that is gone, so they are not enforced. Oracle's warm compile is over 1.5x
 * of them until liberation-data/drivine-cypher-spec#122. A regression of the warm compile or of a store's first compile
 * is caught by the nightly instead (scripts/bench-regression.js), against the previous night's numbers.
 *
 * The compiler is the installed dependency, unless DRIVINE_WASM_COMPILER names another: a candidate build, timed before
 * it is published. Given its `.tgz` (in drivine-cypher-spec's `compiler`, `./gradlew npmPackage`, then `npm pack` of
 * `build/npm`), the script installs it, and the `@js-joda/core` it needs, into a temporary directory (which takes the
 * npm registry), removed when it ends; a run cut short by a signal leaves it behind, as `drivine-wasm-compiler-*` in the
 * system's temporary directory. Given a directory, the package installed there, the script requires it as it is, so
 * `@js-joda/core` must resolve from there. Either way, Drivine's own require of the package is pointed at it.
 *
 * Options: `--json <file>` writes the numbers as JSON too, for scripts/bench-regression.js. On GitHub Actions the
 * tables are appended to $GITHUB_STEP_SUMMARY.
 *
 * Environment: DRIVINE_BENCH_COLD_RUNS (10), DRIVINE_BENCH_WARMUP_ROUNDS (3), DRIVINE_BENCH_ROUNDS (10),
 * DRIVINE_WASM_COMPILER (the installed dependency).
 */
const childProcess = require('child_process');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

// The compiler's warnings, as a RETURN of several items, logged at WARN, are left out: a log line in the timed compile
// would be timed with it, and one in a cold process's output would be read as its numbers. Its processes inherit it.
process.env.DRIVINE_LOG_LEVEL = 'ERROR';

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SPEC = path.join(ROOT, 'test', 'cypher');
const PACKAGE = '@liberation-data/drivine-cypher-compiler';
// schema.yaml's statements are schema DDL, which is read apart from the compiler (SchemaDdl), and so not compiled.
const FILES = ['queries.yaml', 'writes.yaml', 'temporal.yaml', 'refusals.yaml'];
// The graph as each connection first compiles for it: on Oracle, with its stored functions and no index named.
const GRAPH = { name: 'g' };
const STORES = ['postgres', 'oracle', 'sqlite'];
// #685's budget for the load, in ms: the package's require and the start of its Wasm module, before a store's compile.
const LOAD_BUDGET = 150;
// #685's pre-switch warm medians, in ms: Drivine's own compiler, on an Apple M2 Max with Node 24.7. For reference only.
const PRE_SWITCH = { postgres: 0.204, oracle: 0.218, sqlite: 0.214 };
// What SharedCypherCompiler says when the compiler can't read a request, as against a refusal.
const REQUEST_ERROR = "The Cypher compiler can't read the request";

function count(name, fallback) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} is a whole number from 1, not ${process.env[name]}.`);
    }
    return value;
}

/** Points every require of the compiler's package, Drivine's among them, at the package in `packageDir`. */
function useCompiler(packageDir) {
    const main = require.resolve(packageDir);
    const resolve = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
        return request === PACKAGE ? main : resolve.call(this, request, ...rest);
    };
}

const fromDist = (file) => require(path.join(DIST, file));

/** A compile of `statement` on `store`, as a connection compiles it: a new compiler, to the CompiledCypher. */
function compile(store, statement) {
    const { SharedCypherCompiler } = fromDist('cypher/SharedCypherCompiler.js');
    return new SharedCypherCompiler(store, GRAPH).compile(statement.cypher, statement.parameters);
}

// Run in a fresh process: `--cold <store> <statement index> [<package directory>]` prints the load, the store's first
// compile and the next, in milliseconds. It ends by itself, not with `process.exit`, which on macOS can cut off what it
// wrote to a pipe.
function cold() {
    const [, , , store, index, packageDir] = process.argv;
    if (packageDir) useCompiler(packageDir);
    const statement = statements(store)[Number(index)];
    fromDist('index.js');
    const { sharedCompilerLoaded } = fromDist('cypher/SharedCypherCompiler.js');
    if (sharedCompilerLoaded()) {
        throw new Error('Loading Drivine loaded the compiler, so its load would not be timed.');
    }
    // Required from SharedCypherCompiler's own file, so it resolves to the module Drivine's require then finds cached.
    const requireAsDrivine = Module.createRequire(path.join(DIST, 'cypher', 'SharedCypherCompiler.js'));
    const started = performance.now();
    // A request that names no store: the compiler answers it with an error, which doesn't matter here, after starting
    // its Wasm module.
    requireAsDrivine(PACKAGE).compile('{}');
    const loaded = performance.now();
    compile(store, { cypher: 'RETURN 1', parameters: {} });
    const first = performance.now();
    compile(store, statement);
    const next = performance.now();
    if (!sharedCompilerLoaded()) {
        throw new Error("Drivine's compile didn't load the compiler, so its first compile would not be timed.");
    }
    console.log(JSON.stringify({ load: loaded - started, first: first - loaded, next: next - first }));
}

// As test/cypher/CypherSpec.ts reads the spec, which a script run from `dist` can't import: the groups of stores, and
// whether a step runs on a store; a statement's indent taken off; and a parameter's values, written out.
const GROUPS = { graph: ['neo4j', 'memgraph', 'falkordb', 'neptune'], sql: ['postgres', 'oracle', 'sqlite'] };
const named = (names, store) => names.some((it) => it === store || GROUPS[it]?.includes(store));
const runsOn = (step, store) =>
    (step.only === undefined || named(step.only, store)) && !named(step.except ?? [], store);

function trimIndent(text) {
    const lines = text.split('\n');
    while (lines.length > 0 && lines[0].trim() === '') lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    const indent = Math.min(...lines.filter((it) => it.trim() !== '').map((it) => it.length - it.trimStart().length));
    return lines.map((it) => it.substring(Math.min(indent, it.length))).join('\n');
}

/** A parameter's value as the spec's runner binds it on a SQL store: CypherSpec's `valuesFor(value, Number)`. */
function valueFor(value) {
    if (typeof value === 'bigint') return Number(value);
    if (Array.isArray(value)) return value.map(valueFor);
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 2 && keys.includes('$repeat') && keys.includes('times')) {
            return String(value.$repeat).repeat(Number(value.times));
        }
        if (keys.length === 1 && keys[0] === '$float') return Number(value.$float);
        return Object.fromEntries(keys.map((key) => [key, valueFor(value[key])]));
    }
    return value;
}

/** Every statement of the spec that runs on `store`, with its parameters. */
function statements(store) {
    const { parse } = require('yaml');
    return FILES.flatMap((file) =>
        parse(fs.readFileSync(path.join(SPEC, file), 'utf8'), { intAsBigInt: true }).cases.flatMap((cypherCase) =>
            cypherCase.steps
                .filter((step) => runsOn(step, store))
                .map((step) => ({ cypher: trimIndent(step.cypher), parameters: valueFor(step.parameters ?? {}) }))
        )
    );
}

/** The package's directory: DRIVINE_WASM_COMPILER's directory, or its `.tgz` installed into a temporary one. */
function packageDirectory(given) {
    const resolved = path.resolve(given.replace(/^~(?=$|\/)/, os.homedir()));
    if (fs.statSync(resolved).isDirectory()) {
        return resolved;
    }
    const into = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-wasm-compiler-'));
    process.on('exit', () => fs.rmSync(into, { recursive: true, force: true }));
    fs.writeFileSync(path.join(into, 'package.json'), '{"private": true}');
    childProcess.execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent', resolved], {
        cwd: into,
        stdio: 'inherit'
    });
    // The package's name, from its own package.json in the .tgz: so where npm's config puts the dependency (none,
    // devDependencies ...) doesn't matter.
    const { name } = JSON.parse(
        childProcess.execFileSync('tar', ['-xOzf', resolved, 'package/package.json'], { encoding: 'utf8' })
    );
    return path.join(into, 'node_modules', name);
}

function quantile(sorted, q) {
    return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

// The middle value, or the mean of the two middle ones: with an even count, the nearest-rank median is the lower one.
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const ms = (value) => value.toFixed(value < 1 ? 3 : 1);

/** The value of option `name`, given as `--name <value>`, if it is. */
function option(name) {
    const at = process.argv.indexOf(`--${name}`);
    if (at === -1) return undefined;
    const value = process.argv[at + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${name} takes a value.`);
    return value;
}

/** The statements of the spec on `store`, which of them compile, how many are refused, and the request errors. */
function tally(store) {
    const { DrivineError } = fromDist('DrivineError.js');
    const all = statements(store);
    const result = { all, compiled: [], refused: 0, errors: [] };
    all.forEach((statement, index) => {
        try {
            compile(store, statement);
            result.compiled.push({ ...statement, index });
        } catch (e) {
            if (e instanceof DrivineError && !e.message.startsWith(REQUEST_ERROR)) {
                result.refused++;
            } else {
                result.errors.push(`${e?.message ?? e}: \`${statement.cypher.replace(/\s+/g, ' ').slice(0, 80)}\``);
            }
        }
    });
    return result;
}

function main() {
    const json = option('json');
    if (!fs.existsSync(path.join(DIST, 'cypher', 'SharedCypherCompiler.js'))) {
        throw new Error('Drivine is not built: run `npm run build` first.');
    }
    const coldRuns = count('DRIVINE_BENCH_COLD_RUNS', 10);
    const warmupRounds = count('DRIVINE_BENCH_WARMUP_ROUNDS', 3);
    const rounds = count('DRIVINE_BENCH_ROUNDS', 10);
    const given = process.env.DRIVINE_WASM_COMPILER;
    const packageDir = given ? packageDirectory(given) : path.dirname(require.resolve(PACKAGE));
    if (given) useCompiler(packageDir);
    const { name, version } = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    const spec = fs.readFileSync(path.join(SPEC, 'VERSION'), 'utf8').trim();
    const cpus = os.cpus();
    const machine =
        `Node ${process.version}, ${os.platform()} ${os.release()} ${os.arch()}, ${cpus[0]?.model} x${cpus.length},` +
        ` ${Math.round(os.totalmem() / 2 ** 30)} GiB`;
    const out = [];
    const say = (line = '') => {
        console.log(line);
        out.push(line);
    };
    say('### The shared Cypher compiler, as Drivine runs it');
    say();
    say(`${machine}; ${name} ${version}${given ? ', from DRIVINE_WASM_COMPILER' : ''}; spec ${spec}.`);
    say(
        `Cold: ${coldRuns} fresh processes each, median (min-max). Warm: ${rounds} rounds after ${warmupRounds} of warm-up.`
    );
    say();

    const results = {};
    const rows = [];
    const counts = [];
    const errors = [];
    for (const store of STORES) {
        const { all, compiled, refused, errors: failed } = tally(store);
        counts.push([store, all.length, compiled.length, refused, failed.length]);
        errors.push(...failed.map((it) => `${store}: ${it}`));
        if (compiled.length === 0) {
            throw new Error(`No statement of the spec compiles on ${store}, so there is nothing to time.`);
        }

        const runs = [];
        for (let run = 0; run < coldRuns; run++) {
            const args = [__filename, '--cold', store, String(compiled[0].index), ...(given ? [packageDir] : [])];
            runs.push(JSON.parse(childProcess.execFileSync(process.execPath, args, { encoding: 'utf8' })));
        }

        const warm = [];
        for (let round = 0; round < warmupRounds + rounds; round++) {
            for (const statement of compiled) {
                const started = performance.now();
                compile(store, statement);
                const took = performance.now() - started;
                if (round >= warmupRounds) warm.push(took);
            }
        }
        const sorted = warm.sort((a, b) => a - b);
        const load = runs.map((it) => it.load);
        const first = runs.map((it) => it.first);
        const next = runs.map((it) => it.next);
        const spread = (values) => `${ms(median(values))} (${ms(Math.min(...values))}-${ms(Math.max(...values))})`;
        const numbers = {
            loadMs: median(load),
            firstCompileMs: median(first),
            nextCompileMs: median(next),
            warmMedianMs: median(sorted),
            warmP99Ms: quantile(sorted, 0.99),
            statements: all.length,
            compiled: compiled.length,
            refused,
            requestErrors: failed.length
        };
        results[store] = numbers;
        rows.push([
            store,
            spread(load),
            spread(first),
            spread(next),
            ms(numbers.warmMedianMs),
            ms(numbers.warmP99Ms),
            ms(PRE_SWITCH[store]),
            `${(numbers.warmMedianMs / PRE_SWITCH[store]).toFixed(2)}x`
        ]);
    }

    const table = (header, body) =>
        [header, header.map(() => '---'), ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
    say(
        table(
            [
                'Store',
                'Load, ms',
                'First compile, ms',
                'Next compile, ms',
                'Warm median, ms',
                'Warm p99, ms',
                'Pre-switch warm median, ms',
                'Against pre-switch'
            ],
            rows
        )
    );
    say();
    say(table(['Store', 'Statements', 'Compiled', 'Refused', 'Request errors'], counts));
    say();
    say(
        "The pre-switch warm medians are #685's, of Drivine's own compiler (since deleted) on an Apple M2 Max: for" +
            ' reference only, not enforced, as they are of another machine and a compiler that is gone. Oracle compiles' +
            " over 1.5x of them warm until liberation-data/drivine-cypher-spec#122. The load is the package's require" +
            " and the start of its Wasm module, the same work on every store; the first compile is the store's first" +
            " (`RETURN 1`), and the next the spec's first statement that compiles on it. Only the load has a budget" +
            ` here, ${LOAD_BUDGET} ms; the nightly catches a regression of the warm compile and of the first compile.`
    );
    if (errors.length > 0) {
        say();
        say("Request errors, requests the compiler couldn't read: a fault in how Drivine writes them.");
        errors.forEach((it) => say(`- ${it}`));
    }
    const over = STORES.filter((store) => results[store].loadMs > LOAD_BUDGET);
    say();
    say(
        over.length === 0
            ? `The load is within its budget of ${LOAD_BUDGET} ms in every store's processes.`
            : `**Over budget:** the median load, in the processes of ${over.join(', ')}, is over ${LOAD_BUDGET} ms.`
    );

    if (json) {
        const numbers = { machine, compiler: { name, version }, spec, coldRuns, warmupRounds, rounds, stores: results };
        fs.writeFileSync(json, `${JSON.stringify(numbers, null, 4)}\n`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.join('\n')}\n`);
    }
    if (over.length > 0) process.exitCode = 1;
}

if (process.argv[2] === '--cold') {
    cold();
} else {
    main();
}
