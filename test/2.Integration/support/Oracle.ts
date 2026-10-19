import {
    DatabaseRegistry,
    PersistenceManager,
    PersistenceManagerFactory,
    TransactionContextHolder
} from '@liberation-data/drivine';

/** Whether ORACLE_DATABASE_* configures an Oracle connection: its suites run only then. */
export const oracleConfigured = process.env.ORACLE_DATABASE_TYPE === 'ORACLE';

/** `describe` when Oracle is configured, else `describe.skip`. */
export const describeOnOracle = oracleConfigured ? describe : describe.skip;

/** A non-transactional persistence manager for the ORACLE connection. */
export function oraclePersistenceManager(): PersistenceManager {
    DatabaseRegistry.buildOrResolveFromEnv('ORACLE');
    return new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
        'ORACLE',
        'NON_TRANSACTIONAL'
    );
}
