import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import neo4j from 'neo4j-driver';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';

const ROOT = path.resolve(__dirname, '..');

/** Set by the test runner once it has started the containers, so Jest's global setup leaves them be. */
export const CONTAINERS_STARTED = 'DRIVINE_TEST_CONTAINERS_STARTED';

/**
 * Loads the tests' datasources: the shell wins, then your .env.test.local, then .env.test, since dotenv never
 * overrides a variable that is set. Oracle's are dropped unless ORACLE_TESTS=true: its image is large and the
 * database wants two gigabytes.
 */
export function loadTestEnvironment(): void {
    dotenv.config({ path: path.join(ROOT, '.env.test.local') });
    dotenv.config({ path: path.join(ROOT, '.env.test') });
    // DrivineModule loads its .env from here, and not the .env you keep for running the app.
    process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH ?? path.join(ROOT, '.env.test');
    if (process.env.ORACLE_TESTS !== 'true') {
        Object.keys(process.env)
            .filter((key) => key.startsWith('ORACLE_DATABASE_'))
            .forEach((key) => delete process.env[key]);
    }
}

/**
 * Seeds the stores before any suite runs: moon town into Neo4j, and Oracle's graph tables made.
 */
export async function seedTestData(): Promise<void> {
    await seedMoonTown();
    await makeOracleGraph();
}

/**
 * Seeds the default Neo4j datasource with moon town: the metros, routes and employee the repository and end-to-end
 * tests read. Each statement merges, so seeding twice changes nothing.
 */
async function seedMoonTown(): Promise<void> {
    if (process.env.DATABASE_TYPE !== 'NEO4J') {
        return;
    }
    const driver = neo4j.driver(
        `bolt://${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT ?? 7687}`,
        neo4j.auth.basic(process.env.DATABASE_USER ?? 'neo4j', process.env.DATABASE_PASSWORD ?? '')
    );
    try {
        const cypher = fs.readFileSync(path.join(ROOT, 'test', 'moon-town.cypher'), 'utf8');
        await driver.executeQuery(cypher, {}, { database: process.env.DATABASE_NAME });
    } finally {
        await driver.close();
    }
}

/**
 * Makes the Oracle graph's tables, as the first connection to a database does. Suites in parallel would each try on a
 * new database, and their DDL would queue past their hooks' timeouts.
 */
async function makeOracleGraph(): Promise<void> {
    if (process.env.ORACLE_DATABASE_TYPE !== 'ORACLE') {
        return;
    }
    const provider = DatabaseRegistry.buildOrResolveFromEnv('ORACLE');
    try {
        const connection = await provider.connect();
        await connection.release();
    } finally {
        await provider.end();
        DatabaseRegistry.tearDown();
    }
}
