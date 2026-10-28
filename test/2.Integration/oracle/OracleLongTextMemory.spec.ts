import * as oracledb from 'oracledb';
import {
    Connection,
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    QuerySpecification
} from '@liberation-data/drivine';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(300_000);

const GRAPH = 'drivine_long_text_memory';

/**
 * Compiled Cypher statements that read a text past 32 KB, many of them on one session, as an application runs them:
 * each statement's memory goes back to the instance when it ends. Each held 2 to 24 MB of the instance's memory for as
 * long as the driver kept its statement in its cache, 30 statements a session, and a few dozen ran the instance out of
 * PGA (ORA-04036, liberation-data/drivine4j#313).
 */
describeOnOracle('compiled statements that read a long text on one Oracle session', () => {
    let connection: Connection;
    const cypher = async (text: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        connection.query(new QuerySpecification({ text, language: 'CYPHER' }).bind(parameters));

    /** The memory, in bytes, the session `sid` holds now, as the container's administrator sees it. */
    const sessionMemory = async (sid: string): Promise<number> => {
        const properties = ConnectionPropertiesFromEnv('ORACLE');
        const admin = await oracledb.getConnection({
            user: 'system',
            password: properties.password,
            connectString: `${properties.host}:${properties.port ?? 1521}/${properties.databaseName}`
        });
        try {
            const result = await admin.execute<[number]>(
                "SELECT st.value FROM v$sesstat st JOIN v$statname sn ON sn.statistic# = st.statistic# WHERE sn.name = 'session pga memory' AND st.sid = :sid",
                { sid }
            );
            return result.rows![0][0];
        } finally {
            await admin.close();
        }
    };

    beforeAll(async () => {
        const registry = DatabaseRegistry.getInstance();
        registry
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: GRAPH })
            .register('ORACLE_LONG_TEXT_MEMORY');
        connection = await registry.connectionProvider('ORACLE_LONG_TEXT_MEMORY')!.connect();
    });

    afterAll(async () => {
        for (const statement of [
            `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
            `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`
        ]) {
            await connection.query(new QuerySpecification(statement));
        }
        await connection.release();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
    });

    it('give back their memory, however many run on one session', async () => {
        // Given, stored and made by the statement, each a statement of its own.
        const t = 'aB'.repeat(20_000);
        await cypher('MATCH (n:LongText) DETACH DELETE n');
        await cypher('CREATE (n:LongText {t: $t})', { t });
        const sid = String(
            (await connection.query(new QuerySpecification("SELECT SYS_CONTEXT('USERENV', 'SID') FROM dual")))[0]
        );
        const before = await sessionMemory(sid);
        const parts = { a: t.substring(0, 20_000), b: t.substring(20_000) };
        for (let i = 1; i <= 30; i++) {
            const fn = `left(t, size(t) - ${i})`;
            const expected = [t.slice(0, -i)];
            expect([fn, 'given', await cypher(`WITH $t AS t RETURN ${fn}`, { t })]).toEqual([fn, 'given', expected]);
            expect([fn, 'stored', await cypher(`MATCH (n:LongText) WITH n.t AS t RETURN ${fn}`)]).toEqual([
                fn,
                'stored',
                expected
            ]);
            expect([fn, 'made', await cypher(`WITH $a + $b AS t RETURN ${fn}`, parts)]).toEqual([fn, 'made', expected]);
        }
        // The megabytes more the session holds after the 90 statements: kept, 539 MB (30 a session, where drivine4j keeps
        // 64 and held 1,134 MB); closed, 35 MB.
        const grown = Math.round(((await sessionMemory(sid)) - before) / 1_000_000);
        expect(grown).toBeLessThan(200);
        await cypher('MATCH (n:LongText) DETACH DELETE n');
    });
});
