/**
 * Measures the shared Cypher compiler, built as Wasm (`@drivine/cypher-compiler`), against Drivine's own compiler in
 * src/cypher/sql, on Postgres, Oracle and SQLite: the cold load and first compile, each in a fresh Node process, and the
 * warm compile over the statements of the Cypher spec in test/cypher. Only compiling: no store is started. See #685.
 *
 *     npm run build
 *     DRIVINE_WASM_COMPILER=<the package's .tgz, or a directory it is installed in> node scripts/bench-compiler.js
 *
 * The package isn't on npm yet, so it is no dependency here: given its `.tgz`, the script installs it, and the
 * `@js-joda/core` it needs, into a temporary directory (which takes the npm registry). Given a directory, the script
 * requires it as it is, so `@js-joda/core` must resolve from there: `npm install <tgz>` into a directory of its own, and
 * give `<that directory>/node_modules/@drivine/cypher-compiler`. With neither, the script says so and is skipped.
 *
 * - Cold load: `require` of the compiler and its first compile, of `RETURN 1`, which for the Wasm compiler is when it
 *   reads and instantiates the module (its entry loads on first compile). Drivine's own is its module, from `dist`.
 * - First compile: the next compile, of the spec's first statement both compilers compile on the store.
 * - Warm compile: each statement both compilers compile on the store, over several rounds after a warm-up, the two
 *   compilers in turn, alternating which goes first. Drivine's own is timed from a new compiler to the SQL, as a
 *   connection compiles; the Wasm compiler from the request's text to the answer read with `JSON.parse`.
 *
 * Environment: DRIVINE_BENCH_COLD_RUNS (10), DRIVINE_BENCH_WARMUP_ROUNDS (3), DRIVINE_BENCH_ROUNDS (10).
 */
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

const ROOT = path.join(__dirname, '..');
const SPEC = path.join(ROOT, 'test', 'cypher');
// schema.yaml's statements are schema DDL, which is read apart from the compiler (SchemaDdl), and so not compiled.
const FILES = ['queries.yaml', 'writes.yaml', 'temporal.yaml', 'refusals.yaml'];
const GRAPH = 'g';
const COMPILERS = {
    postgres: ['PostgresCypherCompiler', () => []],
    // Oracle's graph as a connection compiles for it: with the stored functions, and no index named.
    oracle: ['OracleCypherCompiler', () => [true, true, []]],
    sqlite: ['SqliteCypherCompiler', () => []]
};
const STORES = Object.keys(COMPILERS);
const WASM_GRAPH = {
    postgres: { name: GRAPH },
    oracle: { name: GRAPH, nullsEqualStored: true, eraStored: true, indexedProperties: [] },
    sqlite: { name: GRAPH }
};

function count(name, fallback) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} is a whole number from 1, not ${process.env[name]}.`);
    }
    return value;
}

/** Drivine's own compiler for `store`, from the built `dist`. */
function ownCompiler(store) {
    const [name, args] = COMPILERS[store];
    const Compiler = require(path.join(ROOT, 'dist', 'cypher', 'sql', name))[name];
    return (cypher, parameters) => new Compiler(GRAPH, ...args()).compile(cypher, parameters).sql;
}

/** The Wasm compiler's `compile`, of `request` (JSON text) to the answer, read. */
function wasmCompiler(packageDir) {
    const { compile } = require(packageDir);
    return (request) => JSON.parse(compile(request));
}

/** The request of `cypher` for the Wasm compiler on `store`, its parameters given as JSON text. */
function request(store, cypher, parametersJson) {
    const text = JSON.stringify({ store, graph: WASM_GRAPH[store], cypher, parameters: {} });
    return text.replace(/"parameters":\{\}\}$/, () => `"parameters":${parametersJson}}`);
}

// Run in a fresh process: `--cold <own|wasm> <store> <statement JSON> [<package directory>]` prints the cold load and
// first compile, in milliseconds.
if (process.argv[2] === '--cold') {
    const [, , , which, store, statementJson, packageDir] = process.argv;
    const statement = JSON.parse(statementJson);
    const started = performance.now();
    let compiled;
    if (which === 'own') {
        const compile = ownCompiler(store);
        compile('RETURN 1', {});
        compiled = () => compile(statement.cypher, statement.ownParameters);
    } else {
        const compile = wasmCompiler(packageDir);
        compile(request(store, 'RETURN 1', '{}'));
        compiled = () => compile(request(store, statement.cypher, statement.wasmParameters));
    }
    const loaded = performance.now();
    compiled();
    console.log(JSON.stringify({ load: loaded - started, first: performance.now() - loaded }));
    process.exit(0);
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

const repeated = (value) => {
    const keys = value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
    return keys.length === 2 && keys.includes('$repeat') && keys.includes('times');
};
const floatTagged = (value) => {
    const keys = value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
    return keys.length === 1 && keys[0] === '$float';
};

/** A parameter's value for Drivine's own compiler, as CypherSpec's `valuesFor(value, Number)` gives it. */
function ownValue(value) {
    if (typeof value === 'bigint') return Number(value);
    if (Array.isArray(value)) return value.map(ownValue);
    if (repeated(value)) return String(value.$repeat).repeat(Number(value.times));
    if (floatTagged(value)) return Number(value.$float);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, it]) => [key, ownValue(it)]));
    }
    return value;
}

/**
 * A parameter's value as JSON text for the Wasm compiler, tagged as its README says: a whole number (a `bigint`, as the
 * spec is read) as a JSON integer, a float as `{"$float": …}`, and a map with a key that starts with `$` in `{"$map": …}`.
 */
function wasmValue(value) {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') return JSON.stringify({ $float: String(value) });
    if (Array.isArray(value)) return `[${value.map(wasmValue).join(',')}]`;
    if (repeated(value)) return JSON.stringify(String(value.$repeat).repeat(Number(value.times)));
    if (floatTagged(value)) return JSON.stringify({ $float: String(value.$float) });
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value);
        const map = `{${entries.map(([key, it]) => `${JSON.stringify(key)}:${wasmValue(it)}`).join(',')}}`;
        return entries.some(([key]) => key.startsWith('$')) ? `{"$map":${map}}` : map;
    }
    return JSON.stringify(value);
}

/** Every statement of the spec that runs on `store`, with its parameters for each compiler. */
function statements(store) {
    const { parse } = require('yaml');
    return FILES.flatMap((file) =>
        parse(fs.readFileSync(path.join(SPEC, file), 'utf8'), { intAsBigInt: true }).cases.flatMap((cypherCase) =>
            cypherCase.steps
                .filter((step) => runsOn(step, store))
                .map((step) => ({
                    cypher: trimIndent(step.cypher),
                    ownParameters: ownValue(step.parameters ?? {}),
                    wasmParameters: wasmValue(step.parameters ?? {})
                }))
        )
    );
}

/** The Wasm package's directory: the directory given, or the `.tgz` given installed into a temporary one. */
function packageDirectory(given) {
    const resolved = path.resolve(given.replace(/^~(?=$|\/)/, os.homedir()));
    if (fs.statSync(resolved).isDirectory()) {
        return resolved;
    }
    const into = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-wasm-compiler-'));
    fs.writeFileSync(path.join(into, 'package.json'), '{"private": true}');
    childProcess.execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent', resolved], {
        cwd: into,
        stdio: 'inherit'
    });
    return path.join(into, 'node_modules', '@drivine', 'cypher-compiler');
}

function quantile(sorted, q) {
    return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

const median = (values) =>
    quantile(
        [...values].sort((a, b) => a - b),
        0.5
    );
const ms = (value) => value.toFixed(value < 1 ? 3 : 1);

function main() {
    const given = process.argv[2] ?? process.env.DRIVINE_WASM_COMPILER;
    if (!given) {
        console.log(
            'Skipped: give the Wasm compiler as DRIVINE_WASM_COMPILER (or the first argument), its .tgz or the directory' +
                ' it is installed in. See the top of scripts/bench-compiler.js.'
        );
        return;
    }
    if (!fs.existsSync(path.join(ROOT, 'dist', 'cypher', 'sql', 'PostgresCypherCompiler.js'))) {
        throw new Error('Drivine is not built: run `npm run build` first.');
    }
    const coldRuns = count('DRIVINE_BENCH_COLD_RUNS', 10);
    const warmupRounds = count('DRIVINE_BENCH_WARMUP_ROUNDS', 3);
    const rounds = count('DRIVINE_BENCH_ROUNDS', 10);
    const packageDir = packageDirectory(given);
    const version = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
    const cpus = os.cpus();
    console.log(
        `Node ${process.version}, ${os.platform()} ${os.release()} ${os.arch()}, ${cpus[0]?.model} x${cpus.length},` +
            ` ${Math.round(os.totalmem() / 2 ** 30)} GiB; @drivine/cypher-compiler ${version}; spec ${fs
                .readFileSync(path.join(SPEC, 'VERSION'), 'utf8')
                .trim()}`
    );
    console.log(
        `Cold: ${coldRuns} fresh processes each, median (min-max). Warm: ${rounds} rounds after ${warmupRounds} of warm-up.\n`
    );

    const own = Object.fromEntries(STORES.map((store) => [store, ownCompiler(store)]));
    const wasm = wasmCompiler(packageDir);
    const rows = [];
    const refused = [];
    const slowest = [];
    for (const store of STORES) {
        const all = statements(store);
        const both = [];
        const tally = { ownRefused: 0, wasmRefused: 0, ownOnly: 0, wasmOnly: 0, wasmErrors: 0, sameSql: 0 };
        for (const statement of all) {
            statement.request = request(store, statement.cypher, statement.wasmParameters);
            let ownSql;
            try {
                ownSql = own[store](statement.cypher, statement.ownParameters);
            } catch (e) {
                // A refusal, or a statement the spec has fail as Cypher: either way, no SQL to time.
            }
            const answer = wasm(statement.request);
            // An error is a request the compiler can't read, so a fault here, not a refusal.
            if (answer.error !== undefined) tally.wasmErrors++;
            if (ownSql === undefined) tally.ownRefused++;
            if (answer.sql === undefined) tally.wasmRefused++;
            if (ownSql === undefined && answer.sql !== undefined) tally.ownOnly++;
            if (ownSql !== undefined && answer.sql === undefined) tally.wasmOnly++;
            if (ownSql !== undefined && answer.sql !== undefined) {
                both.push(statement);
                if (ownSql === answer.sql) tally.sameSql++;
            }
        }
        refused.push({ store, all: all.length, both: both.length, ...tally });

        const cold = { own: [], wasm: [] };
        for (let run = 0; run < coldRuns; run++) {
            for (const which of ['own', 'wasm']) {
                const output = childProcess.execFileSync(
                    process.execPath,
                    [__filename, '--cold', which, store, JSON.stringify(both[0]), packageDir],
                    { encoding: 'utf8' }
                );
                cold[which].push(JSON.parse(output));
            }
        }

        const warm = { own: [], wasm: [] };
        const time = {
            own: (it) => {
                const started = performance.now();
                own[store](it.cypher, it.ownParameters);
                return performance.now() - started;
            },
            wasm: (it) => {
                const started = performance.now();
                wasm(it.request);
                return performance.now() - started;
            }
        };
        for (let round = 0; round < warmupRounds + rounds; round++) {
            const order = round % 2 === 0 ? ['own', 'wasm'] : ['wasm', 'own'];
            for (const statement of both) {
                for (const which of order) {
                    const took = time[which](statement);
                    if (round >= warmupRounds) {
                        warm[which].push(took);
                        (statement[which] ??= []).push(took);
                    }
                }
            }
        }
        for (const [which, label] of [
            ['own', 'TS (src/cypher/sql)'],
            ['wasm', 'Wasm']
        ]) {
            const spread = (key) => {
                const values = cold[which].map((it) => it[key]);
                return `${ms(median(values))} (${ms(Math.min(...values))}-${ms(Math.max(...values))})`;
            };
            const sorted = warm[which].sort((a, b) => a - b);
            rows.push([
                store,
                label,
                spread('load'),
                spread('first'),
                ms(quantile(sorted, 0.5)),
                ms(quantile(sorted, 0.99))
            ]);
        }
        const ratio = quantile(warm.wasm, 0.5) / quantile(warm.own, 0.5);
        rows.push([store, 'Wasm / TS, warm median', '', '', `${ratio.toFixed(2)}x`, '']);
        // The statements the Wasm compiler is slowest at beside Drivine's own, by each one's median.
        both.forEach((it) => (it.ratio = median(it.wasm) / median(it.own)));
        slowest.push(
            ...[...both]
                .sort((a, b) => b.ratio - a.ratio)
                .slice(0, 3)
                .map((it) => [
                    store,
                    `${it.ratio.toFixed(1)}x`,
                    ms(median(it.own)),
                    ms(median(it.wasm)),
                    `\`${it.cypher.replace(/\s+/g, ' ').slice(0, 80)}\``
                ])
        );
    }

    const table = (header, body) =>
        [header, header.map(() => '---'), ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
    console.log(
        table(['Store', 'Compiler', 'Cold load, ms', 'First compile, ms', 'Warm median, ms', 'Warm p99, ms'], rows)
    );
    console.log();
    console.log(
        table(
            [
                'Store',
                'Statements',
                'TS refused',
                'Wasm refused',
                'Only TS refused',
                'Only Wasm refused',
                'Wasm request errors',
                'Both compile',
                'Same SQL'
            ],
            refused.map((it) => [
                it.store,
                it.all,
                it.ownRefused,
                it.wasmRefused,
                it.ownOnly,
                it.wasmOnly,
                it.wasmErrors,
                it.both,
                it.sameSql
            ])
        )
    );
    console.log();
    console.log(table(['Store', 'Wasm / TS', 'TS median, ms', 'Wasm median, ms', 'Slowest beside TS'], slowest));
}

main();
