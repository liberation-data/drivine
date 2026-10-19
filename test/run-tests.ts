/**
 * `npm test`: starts the test containers once, then runs the suites in stages, since they share each store.
 *
 * 1. Everything else, in parallel.
 * 2. The suites that make indexes and constraints, one at a time: on Neo4j, schema changes in parallel queue on its
 *    schema lock behind other suites, and on Oracle they wait on the tables other suites write.
 * 3. The sample app, alone: it clears generic labels (Person, Organization, ...) other suites write.
 *
 * `npm test -- <jest arguments>` runs Jest on them alone, in one stage, as `npx jest` does.
 */
require('./register-paths');
import { spawnSync } from 'child_process';
import { DrivineTestContainers } from '../src/testing';
import { CONTAINERS_STARTED, loadTestEnvironment, seedTestData } from './TestEnvironment';

const SERIAL = [
    'test/2.Integration/schema',
    'test/2.Integration/manager/StatelessGraphObjectManager.nearest',
    'test/2.Integration/manager/StatelessGraphObjectManager.matching'
];
const SAMPLE = 'sample';

const STAGES: { name: string; args: string[] }[] = [
    { name: 'parallel', args: ['--testPathIgnorePatterns', [...SERIAL, `^${process.cwd()}/${SAMPLE}/`].join('|')] },
    { name: 'schema', args: ['--runInBand', ...SERIAL] },
    { name: 'sample', args: ['--runInBand', SAMPLE] }
];

function jest(args: string[]): number {
    return spawnSync('npx', ['jest', ...args], { stdio: 'inherit' }).status ?? 1;
}

async function main(): Promise<number> {
    const passed = process.argv.slice(2);
    if (passed.length > 0) {
        return jest(passed);
    }
    loadTestEnvironment();
    const containers = await DrivineTestContainers.start();
    try {
        await seedTestData();
        process.env[CONTAINERS_STARTED] = 'true';
        const failed = STAGES.filter((stage) => {
            process.stdout.write(`\n== ${stage.name}\n`);
            return jest(stage.args) !== 0;
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
