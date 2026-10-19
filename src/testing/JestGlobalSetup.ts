import { DrivineTestContainers } from '@/testing/DrivineTestContainers';

const STARTED = Symbol.for('drivine.testContainers');

interface Holder {
    [STARTED]?: DrivineTestContainers;
}

/**
 * A Jest `globalSetup` that starts the test containers the environment's datasources want (see
 * {@link DrivineTestContainers}) before any test file runs. The workers Jest forks afterwards inherit the rewritten
 * environment. Load your test environment (a `.env.test`, say) before calling it.
 *
 * ```ts
 * // jest-global-setup.ts
 * import { drivineGlobalSetup } from '@liberation-data/drivine/testing';
 * require('dotenv').config({ path: '.env.test' });
 * export default drivineGlobalSetup;
 * ```
 */
export async function drivineGlobalSetup(): Promise<void> {
    (globalThis as Holder)[STARTED] = await DrivineTestContainers.start();
}

/** The Jest `globalTeardown` that goes with {@link drivineGlobalSetup}: stops the containers it started. */
export async function drivineGlobalTeardown(): Promise<void> {
    await (globalThis as Holder)[STARTED]?.stop();
    delete (globalThis as Holder)[STARTED];
}
