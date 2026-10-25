import {
    Connection,
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    QuerySpecification
} from '@liberation-data/drivine';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(120_000);

const GRAPH = 'drivine_long_parameter';

/**
 * Oracle crashed the session (ORA-07445 `ksmem_malloc`, then ORA-00600 `kghfrempty:ds`; NJS-500 here) where a compiled
 * write read a parameter past 32 KB once for each of two or more rows from a `JSON` variable holding all its parameters
 * (liberation-data/drivine#308). The parameters are now held as text, read as JSON where each is read.
 */
describeOnOracle('a parameter past 32 KB set on two nodes on Oracle', () => {
    let connection: Connection;
    const cypher = async (text: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        connection.query(new QuerySpecification({ text, language: 'CYPHER' }).bind(parameters));

    beforeAll(async () => {
        const registry = DatabaseRegistry.getInstance();
        registry
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: GRAPH })
            .register('ORACLE_LONG_PARAMETER');
        connection = await registry.connectionProvider('ORACLE_LONG_PARAMETER')!.connect();
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

    it('leaves the session open, alone and beside a float', async () => {
        // The crash could come after the rows did, so the session is asked again; and a block parsed before rarely
        // crashed, so each statement is new. The nodes are read back whole, as the Cypher spec's "A parameter past 32 KB
        // set on two nodes" (v0.6.1) reads them.
        await cypher('MATCH (n:CyWrite) DETACH DELETE n');
        await cypher('CREATE (:CyWrite {id: 1}), (:CyWrite {id: 2})');
        const text = 'x'.repeat(40_000);
        const written: Record<string, any> = {};
        for (let i = 0; i < 3; i++) {
            await cypher(`MATCH (n:CyWrite) SET n.a${i} = $a${i}`, { [`a${i}`]: text });
            await cypher(`MATCH (n:CyWrite) SET n.b${i} = $b${i}, n.f${i} = $f${i}`, {
                [`b${i}`]: text,
                [`f${i}`]: 2.5 + i
            });
            Object.assign(written, { [`a${i}`]: text, [`b${i}`]: text, [`f${i}`]: 2.5 + i });
            expect(await cypher('MATCH (n:CyWrite) RETURN properties(n) ORDER BY n.id')).toEqual(
                [1, 2].map((id) => ({ id, ...written }))
            );
        }
    });
});
