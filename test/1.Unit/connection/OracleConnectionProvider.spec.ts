import { DatabaseType } from '@/connection/DatabaseType';
import { OracleConnectionProvider, oracleRefusal } from '@/connection/oracle/OracleConnectionProvider';
import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleStoredFunctions } from '@/backend/oracle/OracleStoredFunctions';
import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineLogger } from '@/logger';

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

/** What node-oracledb gives for a server of version `full`, `23.26.3.0.0`: its number and its text. */
function server(full: string): { oracleServerVersion: number; oracleServerVersionString: string } {
    const [version, release, update, portRelease, portUpdate] = full.split('.').map(Number);
    return {
        oracleServerVersion:
            version * 100_000_000 + release * 1_000_000 + update * 10_000 + portRelease * 100 + portUpdate,
        oracleServerVersionString: full
    };
}

/**
 * Drivine needs Oracle 23.9 or later, whose `UUID()` compiled Cypher's `randomUUID()` is: on an older one plain SQL runs,
 * and Cypher is refused with the version found (#428, as liberation-data/drivine4j#401).
 */
describe('The Oracle version, read on the first connection', () => {
    afterEach(() => jest.restoreAllMocks());

    it('should refuse an Oracle older than 23.9 with the version it is and why, and not 23.9 or later', () => {
        expect(oracleRefusal(server('23.8.0.25.4'))).toEqual(
            'Drivine needs Oracle 23.9 or later (it uses UUID()); this database is 23.8.0.25.4. ' +
                'Upgrade, or use an Oracle Free image 23.9 or newer. Plain SQL over this provider still runs; Cypher does not.'
        );
        expect(oracleRefusal(server('19.3.0.0.0'))).toContain('this database is 19.3.0.0.0');
        expect(oracleRefusal(server('23.9.0.25.7'))).toBeUndefined();
        expect(oracleRefusal(server('23.26.3.0.0'))).toBeUndefined();
        expect(oracleRefusal(server('26.1.0.0.0'))).toBeUndefined();
        // With no text, the version is named by its number's version and release.
        expect(oracleRefusal({ oracleServerVersion: server('21.3.0.0.0').oracleServerVersion })).toContain(
            'this database is 21.3.'
        );
        // A version that can't be read refuses nothing.
        expect(oracleRefusal({})).toBeUndefined();
        expect(oracleRefusal({ oracleServerVersion: Number.NaN })).toBeUndefined();
    });

    /** A session of `version`, whose every statement gives no rows, counting how often its version is read. */
    const session = (version: () => number, text = ''): { execute: jest.Mock; close: jest.Mock; reads: number } => {
        const it = {
            execute: jest.fn(async (sql: string) =>
                Promise.resolve(sql.includes("SYS_CONTEXT('USERENV', 'SID')") ? { rows: [{ SID: '7' }] } : { rows: [] })
            ),
            close: jest.fn(),
            reads: 0
        };
        Object.defineProperty(it, 'oracleServerVersion', {
            get: () => {
                it.reads++;
                return version();
            }
        });
        Object.defineProperty(it, 'oracleServerVersionString', { get: () => text });
        return it;
    };

    const provider = (...sessions: object[]): OracleConnectionProvider => {
        const handed = [...sessions];
        jest.spyOn(oracledb, 'createPool').mockResolvedValue({
            getConnection: async () => Promise.resolve(handed.length > 1 ? handed.shift() : handed[0])
        });
        jest.spyOn(OracleStoredFunctions, 'nullsEqual').mockResolvedValue(true);
        return new OracleConnectionProvider('ORACLE', DatabaseType.ORACLE, {
            connectString: 'host:1521/svc',
            graph: `version_${Date.now()}`
        });
    };

    it('should hand out a connection that runs SQL on an Oracle older than 23.9, and refuse Cypher with why, the version read once', async () => {
        // The first connection ensures the graph and is then handed out; the second is only handed out.
        const old = server('23.8.0.25.4');
        const first = session(() => old.oracleServerVersion, old.oracleServerVersionString);
        const second = session(() => old.oracleServerVersion, old.oracleServerVersionString);
        const it = provider(first, second);

        const connection = await it.connect();
        expect(await connection.query(new QuerySpecification('SELECT 1 FROM dual'))).toEqual([]);
        await expect(
            connection.query(new QuerySpecification({ text: 'RETURN randomUUID()', language: 'CYPHER' }))
        ).rejects.toThrow('Drivine needs Oracle 23.9 or later (it uses UUID()); this database is 23.8.0.25.4.');
        await expect(
            (await it.connect()).query(new QuerySpecification({ text: 'RETURN 1', language: 'CYPHER' }))
        ).rejects.toThrow('Drivine needs Oracle 23.9 or later');

        expect(first.reads).toBe(1);
        expect(second.reads).toBe(0);
    });

    it('should run Cypher on Oracle 23.9 or later', async () => {
        const recent = server('23.26.3.0.0');
        const it = session(() => recent.oracleServerVersion, recent.oracleServerVersionString);
        const connection = await provider(it).connect();
        const before = it.execute.mock.calls.length;
        await connection.query(new QuerySpecification({ text: 'RETURN 1', language: 'CYPHER' }));
        expect(it.execute.mock.calls).toHaveLength(before + 1);
    });

    it('should not refuse Cypher on an Oracle whose version cannot be read', async () => {
        const unread = session(() => {
            throw new Error('closed');
        });
        const connection = await provider(unread).connect();
        const before = unread.execute.mock.calls.length;
        await connection.query(new QuerySpecification({ text: 'RETURN 1', language: 'CYPHER' }));
        expect(unread.execute.mock.calls).toHaveLength(before + 1);
    });
});

/**
 * A first-use block the store refuses for good, as a user who may not make tables (ORA-01031) or a database open for
 * reading only (ORA-16000) does, is warned of once and not run again by the provider: the connection is handed out, so
 * plain SQL works. Another failure, a busy lock among them, is thrown and run again on the next connection
 * (liberation-data/drivine4j#453, liberation-data/drivine-python#290).
 */
describe('OracleConnectionProvider, over a store it may not make', () => {
    afterEach(() => jest.restoreAllMocks());

    /** A provider whose sessions fail the block with `message` each time, counting the block's runs and the closes. */
    const providerFailing = (
        message: string
    ): { provider: OracleConnectionProvider; blocks: () => number; close: jest.Mock } => {
        const graph = `wont_make_${Date.now()}`;
        let blocks = 0;
        const close = jest.fn();
        const execute = jest.fn(async (sql: string) => {
            if (sql === new OracleGraph(graph).ensuring) {
                blocks++;
                return Promise.reject(Object.assign(new Error(message), { code: message.slice(0, 9) }));
            }
            return Promise.resolve(
                sql.includes("SYS_CONTEXT('USERENV', 'SID')") ? { rows: [{ SID: '7' }] } : { rows: [] }
            );
        });
        jest.spyOn(oracledb, 'createPool').mockResolvedValue({
            getConnection: async () => Promise.resolve({ execute, close })
        });
        const provider = new OracleConnectionProvider('ORACLE', DatabaseType.ORACLE, {
            connectString: 'host:1521/svc',
            graph
        });
        return { provider, blocks: () => blocks, close };
    };

    it('should hand out each connection, warn once, and not run the block again, where the user or the database may not make the tables', async () => {
        for (const message of [
            'ORA-01031: insufficient privileges\nORA-06512: at line 40',
            'ORA-16000: database or pluggable database open for read-only access\nORA-06512: at line 40'
        ]) {
            const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
            const { provider, blocks, close }: ReturnType<typeof providerFailing> = providerFailing(message);
            await expect(provider.connect()).resolves.toBeDefined();
            await expect(provider.connect()).resolves.toBeDefined();
            expect(blocks()).toEqual(1);
            expect(close).not.toHaveBeenCalled();
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain(message.slice(0, 9));
            jest.restoreAllMocks();
        }
    });

    it('should check again on a new provider over the same store', async () => {
        jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        const message = 'ORA-01031: insufficient privileges';
        const first = providerFailing(message);
        await first.provider.connect();
        const second = providerFailing(message);
        await second.provider.connect();
        expect(second.blocks()).toEqual(1);
    });

    it('should throw a busy lock, hand the connection back, and run the block again on the next connection', async () => {
        const { provider, blocks, close }: ReturnType<typeof providerFailing> = providerFailing(
            'ORA-00054: resource busy and acquire with NOWAIT specified or timeout expired'
        );
        await expect(provider.connect()).rejects.toThrow(/ORA-00054/);
        await expect(provider.connect()).rejects.toThrow(/ORA-00054/);
        expect(blocks()).toEqual(2);
        expect(close).toHaveBeenCalledTimes(2);
    });
});
