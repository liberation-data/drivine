import { DatabaseType } from '@/connection/DatabaseType';
import { OracleConnectionProvider } from '@/connection/oracle/OracleConnectionProvider';

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
