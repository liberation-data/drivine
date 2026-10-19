/**
 * Runs once before every test file. Loads the test environment, then starts a test container for each datasource in
 * it, unless USE_LOCAL_<TYPE>=true points that type at an instance of your own, and seeds it. See TEST_CONTAINERS.md.
 * When `npm test` has done all this already, for each of its stages, it leaves it be.
 */
// Jest's globalSetup is outside its module mapping, so the '@/' paths are resolved here.
require('tsconfig-paths/register');
import { drivineGlobalSetup } from '../src/testing';
import { CONTAINERS_STARTED, loadTestEnvironment, seedTestData } from './TestEnvironment';

module.exports = async (): Promise<void> => {
    if (process.env[CONTAINERS_STARTED] === 'true') {
        return;
    }
    loadTestEnvironment();
    await drivineGlobalSetup();
    await seedTestData();
};
