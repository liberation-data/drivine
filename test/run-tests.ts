/**
 * `npm test`: starts the test containers once, then runs the suites in stages, since they share each store.
 *
 * 1. Everything else, in parallel.
 * 2. The suites that make indexes and constraints, one at a time: on Neo4j, schema changes in parallel queue on its
 *    schema lock behind other suites, and on Oracle they wait on the tables other suites write. And the one that times
 *    Oracle's planning, which another suite's planning would slow, and the one that times write loops.
 * 3. The sample app, alone: it clears generic labels (Person, Organization, ...) other suites write.
 *
 * `npm test -- <jest arguments>` runs Jest on them alone, in one stage, as `npx jest` does.
 *
 * CI splits the run over jobs, each with containers of its own (.github/workflows/ci.yml), and leaves the suites
 * NIGHTLY names out of a pull request's run. DRIVINE_TEST_PART names a job's part:
 * - `parallel i/n`: shard i of n of stage 1 (Jest's `--shard`), without the Cypher spec and the nightly suites;
 * - `cypher spec`: the Cypher spec, on each store, or `cypher spec on oracle` and `cypher spec on the rest` (CI's
 *   longest suite, split over two jobs with Oracle);
 * - `serial`: stage 2 without the nightly suites, then stage 3;
 * - `nightly`: the nightly suites, in their stages, but the write loops' timing, which is `write loop`.
 * The parallel shards, a cypher spec part or two, and serial run every suite but the nightly ones exactly once; with
 * nightly and write loop, every suite.
 */
require('./register-paths');
import { spawnSync } from 'child_process';
import { DrivineTestContainers } from '../src/testing';
import { CONTAINERS_STARTED, loadTestEnvironment, seedTestData } from './TestEnvironment';

const SERIAL = [
    'test/2.Integration/schema',
    'test/2.Integration/manager/StatelessGraphObjectManager.nearest',
    'test/2.Integration/manager/StatelessGraphObjectManager.vectorScore',
    'test/2.Integration/manager/StatelessGraphObjectManager.matching',
    // How long Oracle takes to plan a statement, which a parallel suite's own planning on the same database would add to.
    'test/2.Integration/oracle/OracleEraParse',
    // How a write's time grows with its rows, over two runs that a parallel suite's load would slow unevenly.
    'test/2.Integration/cypher/CypherWriteLoopTime'
];
/**
 * The sample app's suites, as a pattern of their paths: anchored, as Jest matches a path pattern without regard to
 * case, and a bare `sample` would take test/2.Integration/website/LandingPageSample too, which stage 1 runs.
 */
const SAMPLE = `^${process.cwd()}/sample/`;

const CYPHER_SPEC = 'test/2.Integration/cypher/CypherSpec';
const WRITE_LOOP = 'test/2.Integration/cypher/CypherWriteLoopTime';

/**
 * The suites CI runs each night, on a push to master, before a release and on a pull request labelled `full-ci`, but
 * not on every pull request: each is slow, or rests on a timing or a plan that a busy runner can upset.
 */
const NIGHTLY = [
    // How a write's time grows with its rows, and how long Oracle takes to plan: timings. The write loops also make
    // the largest tables, and vacuum them on Postgres.
    WRITE_LOOP,
    'test/2.Integration/oracle/OracleEraParse',
    // The plans Oracle makes.
    'test/2.Integration/oracle/OracleKeyedLabelPlan',
    'test/2.Integration/oracle/OracleNodeEqualityPlan',
    'test/2.Integration/oracle/OracleAdaptivePlans',
    // Texts past 4,000 bytes and 32 KB.
    'test/2.Integration/oracle/OracleLongTextMemory',
    'test/2.Integration/oracle/OracleLongParameter',
    'test/2.Integration/oracle/OracleLongProperty',
    'test/2.Integration/manager/StatelessGraphObjectManager.longText'
];

interface Stage {
    name: string;
    args: string[];
    env?: Record<string, string>;
}

const parallel = (ignored: string[] = [], args: string[] = []): Stage => ({
    name: 'parallel',
    args: ['--testPathIgnorePatterns', [...SERIAL, ...ignored, SAMPLE].join('|'), ...args]
});
const schema = (paths: string[]): Stage => ({ name: 'schema', args: ['--runInBand', ...paths] });
const sample: Stage = { name: 'sample', args: ['--runInBand', SAMPLE] };
const cypherSpec = (stores?: string): Stage => ({
    name: stores ? `cypher spec on ${stores}` : 'cypher spec',
    args: [CYPHER_SPEC],
    env: stores ? { CYPHER_SPEC_STORES: stores } : {}
});

/** The stages of the part DRIVINE_TEST_PART names, or of the whole run when it names none. */
function stages(part: string | undefined): Stage[] {
    if (!part) {
        return [parallel(), schema(SERIAL), sample];
    }
    const shard = /^parallel (\d+\/\d+)$/.exec(part);
    if (shard) {
        return [parallel([CYPHER_SPEC, ...NIGHTLY], [`--shard=${shard[1]}`])];
    }
    const parts: Record<string, Stage[]> = {
        'cypher spec': [cypherSpec()],
        'cypher spec on oracle': [cypherSpec('oracle')],
        'cypher spec on the rest': [cypherSpec('neo4j,postgres,sqlite')],
        serial: [schema(SERIAL.filter((it) => !NIGHTLY.includes(it))), sample],
        nightly: [
            { name: 'nightly', args: NIGHTLY.filter((it) => !SERIAL.includes(it)) },
            schema(NIGHTLY.filter((it) => SERIAL.includes(it) && it !== WRITE_LOOP))
        ],
        'write loop': [schema([WRITE_LOOP])]
    };
    if (!parts[part]) {
        throw new Error(`DRIVINE_TEST_PART is "${part}": not parallel i/n, or ${Object.keys(parts).join(', ')}`);
    }
    return parts[part];
}

function jest(args: string[], env: Record<string, string> = {}): number {
    return spawnSync('npx', ['jest', ...args], { stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;
}

async function main(): Promise<number> {
    const passed = process.argv.slice(2);
    if (passed.length > 0) {
        return jest(passed);
    }
    const run = stages(process.env.DRIVINE_TEST_PART);
    loadTestEnvironment();
    const containers = await DrivineTestContainers.start();
    try {
        await seedTestData();
        process.env[CONTAINERS_STARTED] = 'true';
        const failed = run.filter((stage) => {
            process.stdout.write(`\n== ${stage.name}\n`);
            return jest(stage.args, stage.env) !== 0;
        });
        if (failed.length > 0) {
            process.stdout.write(`\nFailed: ${failed.map((it) => it.name).join(', ')}\n`);
        }
        return failed.length > 0 ? 1 : 0;
    } finally {
        await containers.stop();
    }
}

main().then(
    (code) => process.exit(code),
    (e) => {
        process.stderr.write(`${e.stack ?? e}\n`);
        process.exit(1);
    }
);
