import {
    DatabaseRegistry,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { CompiledCypher } from '@/cypher/sql/CompiledCypher';

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

/**
 * The plan Oracle makes for `compiled` on the connection registered as `connectionName`, its parameters written in as
 * literals so that the plan is the one for them, shown in the `format` `DBMS_XPLAN.DISPLAY` takes. Explained and read
 * on one session.
 */
export async function oraclePlan(connectionName: string, compiled: CompiledCypher, format: string): Promise<string> {
    const sql = Object.entries(compiled.parameters)
        .sort(([a], [b]) => b.length - a.length)
        .reduce(
            (text, [name, value]) =>
                text
                    .split(`$${name}`)
                    .join(value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`),
            compiled.sql
        );
    const id = `plan_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const connection = await DatabaseRegistry.getInstance().connectionProvider(connectionName)!.connect();
    try {
        await connection.query(new QuerySpecification(`EXPLAIN PLAN SET STATEMENT_ID = '${id}' FOR ${sql}`));
        const lines = await connection.query(
            new QuerySpecification(
                `SELECT plan_table_output AS "line" FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', '${id}', '${format}'))`
            )
        );
        return lines.map((it) => it.line ?? it.LINE ?? it).join('\n');
    } finally {
        await connection.release();
    }
}
