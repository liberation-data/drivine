import {
    Connection,
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    QuerySpecification
} from '@liberation-data/drivine';
import { OracleConnection } from '@/connection/oracle/OracleConnection';
import { oracleSessionSetUp } from '@/connection/oracle/OracleConnectionProvider';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(120_000);

const GRAPH = 'drivine_session_nls';

/**
 * Compiled Cypher compares text on Oracle as `VARCHAR2`, which follows the session's `NLS_COMP` and `NLS_SORT`: under
 * `NLS_COMP=LINGUISTIC NLS_SORT=BINARY_CI`, set by a database or a logon trigger, `'B' < 'a'` was false and `'a' = 'A'`
 * true, with no error. Each session the pool opens runs the shared module's `session` statements first, so text compares
 * by its code points, as Cypher compares it (drivine-cypher-spec#372).
 */
describeOnOracle('a session of Drivine on Oracle, whatever its NLS_COMP and NLS_SORT', () => {
    let connection: Connection;

    const cypher = async (text: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        connection.query(new QuerySpecification({ text, language: 'CYPHER' }).bind(parameters));

    const comparisons = async (): Promise<any[]> =>
        cypher('RETURN $upper < $lower AS less, $lower = $upperA AS equal, $lower <> $upperA AS unequal', {
            upper: 'B',
            lower: 'a',
            upperA: 'A'
        });

    const ordered = async (): Promise<string[]> =>
        (await cypher('UNWIND $items AS x RETURN x ORDER BY x', { items: ['b', 'a', 'B'] })).map((it) => it.x);

    const nls = async (): Promise<Record<string, string>> =>
        Object.fromEntries(
            (
                await connection.query(
                    new QuerySpecification(
                        'SELECT parameter AS "parameter", value AS "value" FROM nls_session_parameters WHERE parameter IN (\'NLS_COMP\', \'NLS_SORT\')'
                    )
                )
            ).map((it) => [it.parameter, it.value])
        );

    beforeAll(async () => {
        const registry = DatabaseRegistry.getInstance();
        registry
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: GRAPH })
            .register('ORACLE_SESSION_NLS');
        connection = await registry.connectionProvider('ORACLE_SESSION_NLS')!.connect();
    });

    afterAll(async () => {
        for (const statement of [
            `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
            `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_count2_delta PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_count2 PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_lock2 PURGE`
        ]) {
            await connection.query(new QuerySpecification(statement));
        }
        await connection.release();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('opens each session comparing text by its code points', async () => {
        expect(await nls()).toEqual({ NLS_COMP: 'BINARY', NLS_SORT: 'BINARY' });
        expect(await comparisons()).toEqual([{ less: true, equal: false, unequal: true }]);
        expect(await ordered()).toEqual(['B', 'a', 'b']);
    });

    it('compares text by its code points again once a linguistic session is set up as the pool sets one up', async () => {
        await connection.query(new QuerySpecification('ALTER SESSION SET NLS_COMP = LINGUISTIC NLS_SORT = BINARY_CI'));
        try {
            expect(await nls()).toEqual({ NLS_COMP: 'LINGUISTIC', NLS_SORT: 'BINARY_CI' });
            // The case the module's session statements are there for: a compiled comparison takes the session's sort.
            expect(await comparisons()).not.toEqual([{ less: true, equal: false, unequal: true }]);

            await new Promise<void>((resolve, reject) =>
                oracleSessionSetUp(GRAPH)((connection as OracleConnection).connection, '', (error) =>
                    error ? reject(error) : resolve()
                )
            );

            expect(await nls()).toEqual({ NLS_COMP: 'BINARY', NLS_SORT: 'BINARY' });
            expect(await comparisons()).toEqual([{ less: true, equal: false, unequal: true }]);
            expect(await ordered()).toEqual(['B', 'a', 'b']);
        } finally {
            // The session goes back to the pool as the pool set it up, whatever failed above.
            await connection.query(new QuerySpecification('ALTER SESSION SET NLS_COMP = BINARY NLS_SORT = BINARY'));
        }
    });
});
