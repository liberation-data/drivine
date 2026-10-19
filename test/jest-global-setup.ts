/**
 * Runs once before every test file. Loads the test environment, then starts a test container for each datasource in
 * it, unless USE_LOCAL_<TYPE>=true points that type at an instance of your own. See TEST_CONTAINERS.md.
 */
// Jest's globalSetup is outside its module mapping, so the '@/' paths are resolved here.
require('tsconfig-paths/register');
import * as dotenv from 'dotenv';
import * as path from 'path';
import { drivineGlobalSetup } from '../src/testing';

module.exports = async (): Promise<void> => {
    const root = path.resolve(__dirname, '..');
    // The shell wins, then your .env.test.local, then .env.test: dotenv never overrides a variable that is set.
    dotenv.config({ path: path.join(root, '.env.test.local') });
    dotenv.config({ path: path.join(root, '.env.test') });
    // DrivineModule loads its .env from here, and not the .env you keep for running the app.
    process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH ?? path.join(root, '.env.test');
    // Oracle's image is large and the database wants two gigabytes: its suites run only when asked for.
    if (process.env.ORACLE_TESTS !== 'true') {
        Object.keys(process.env)
            .filter((key) => key.startsWith('ORACLE_DATABASE_'))
            .forEach((key) => delete process.env[key]);
    }
    await drivineGlobalSetup();
};
