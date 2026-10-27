import { DatabaseType } from '@/connection/DatabaseType';
import { OracleConnectionProvider } from '@/connection/oracle/OracleConnectionProvider';
import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleStoredFunctions } from '@/backend/oracle/OracleStoredFunctions';
import { QuerySpecification } from '@/query/QuerySpecification';

const oracledb = require('oracledb');

/**
 * Each session the pool opens is set to make no adaptive plan (liberation-data/drivine#331), and a session that can't
 * be set is handed back to the pool as an error, which drops it, rather than given out unset.
 */
describe('OracleConnectionProvider', () => {
    let sessionCallback: (connection: unknown, tag: string, done: (error?: Error) => void) => void;

    beforeAll(async () => {
        const createPool = jest
            .spyOn(oracledb, 'createPool')
            .mockResolvedValue({ getConnection: async () => Promise.reject(new Error('no database')) });
        await new OracleConnectionProvider('ORACLE', DatabaseType.ORACLE, { connectString: 'x' })
            .connect()
            .catch(() => undefined);
        sessionCallback = (createPool.mock.calls[0][0] as any).sessionCallback;
        createPool.mockRestore();
    });

    const settle = async (execute: (sql: string) => Promise<unknown>): Promise<Error | undefined> =>
        new Promise((resolve) => sessionCallback({ execute }, '', resolve));

    it('should set a new session to make no adaptive plan', async () => {
        const statements: string[] = [];
        const error = await settle(async (sql) => Promise.resolve(statements.push(sql)));
        expect(error).toBeUndefined();
        expect(statements).toEqual(['ALTER SESSION SET OPTIMIZER_ADAPTIVE_PLANS = FALSE']);
    });

    it('should hand back the error of a session that cannot be set, so the pool drops it', async () => {
        const failure = new Error('ORA-02248: invalid option for ALTER SESSION');
        expect(await settle(async () => Promise.reject(failure))).toBe(failure);
    });
});

/**
 * The first connection ensures the graph, its function among what it makes, and has every session asked again whether
 * it may call it; each connection is asked that for its database and user (#367).
 */
describe('OracleConnectionProvider and the graph function', () => {
    afterEach(() => jest.restoreAllMocks());

    it('should ensure the graph on its first connection, and ask whether a session may call the function for its database and user', async () => {
        const graph = `provider_${Date.now()}`;
        const execute = jest.fn(async (sql: string) =>
            Promise.resolve(sql.includes("SYS_CONTEXT('USERENV', 'SID')") ? { rows: [{ SID: '7' }] } : { rows: [] })
        );
        jest.spyOn(oracledb, 'createPool').mockResolvedValue({
            getConnection: async () => Promise.resolve({ execute, close: jest.fn() })
        });
        const ensured = jest.spyOn(OracleStoredFunctions, 'ensured');
        const asked = jest.spyOn(OracleStoredFunctions, 'nullsEqual').mockResolvedValue(true);
        const provider = new OracleConnectionProvider('ORACLE', DatabaseType.ORACLE, {
            connectString: 'host:1521/svc',
            user: 'me',
            graph
        });
        const connection = await provider.connect();
        await provider.connect();
        expect(execute.mock.calls.filter(([sql]) => sql === new OracleGraph(graph).ensuring)).toHaveLength(1);
        expect(ensured).toHaveBeenCalledTimes(1);
        expect(ensured).toHaveBeenCalledWith(graph);
        await connection.query(
            new QuerySpecification({ text: 'WITH [null] AS a, [1] AS b RETURN a = b', language: 'CYPHER' })
        );
        expect(asked).toHaveBeenCalledWith(expect.anything(), 'host:1521/svc|me', graph);
    });
});
