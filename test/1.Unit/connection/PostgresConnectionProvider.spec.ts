import { DatabaseType } from '@/connection/DatabaseType';
import { PostgresConnection } from '@/connection/postgres/PostgresConnection';
import { PostgresConnectionProvider } from '@/connection/postgres/PostgresConnectionProvider';
import { DrivineLogger } from '@/logger';
import { EventEmitter } from 'events';

/** A pooled client as node-postgres gives one: it says, as an 'error', that the server ended its session. */
const pooledClient = <T extends object>(client: T): T & EventEmitter => Object.assign(new EventEmitter(), client);

/**
 * The first connection makes the graph's tables, and runs the block again when a deadlock turned it away
 * (liberation-data/drivine#454). The block is one statement, so `pg` runs it in a transaction of its own each time: one
 * that failed leaves no transaction behind.
 */
describe('PostgresConnectionProvider', () => {
    /** A provider over a pool whose client fails the block with each of `codes` in turn, then makes it. */
    type Failing = { provider: PostgresConnectionProvider; blocks: () => number; release: jest.Mock };
    const providerFailing = (...codes: string[]): Failing => {
        let blocks = 0;
        const client = pooledClient({
            query: async (sql: string | { text: string }) => {
                const text = typeof sql === 'string' ? sql : sql.text;
                if (text.includes('pg_backend_pid')) {
                    return Promise.resolve({ rows: [{ sid: 's.1' }] });
                }
                // The look for the graph's table of nodes, before its layout is judged: none, so the graph is new.
                if (text.startsWith('SELECT count(*) AS "made"')) {
                    return Promise.resolve({ rows: [{ made: '0' }] });
                }
                const code = codes[blocks++];
                return code
                    ? Promise.reject(Object.assign(new Error('deadlock detected'), { code }))
                    : Promise.resolve({ rows: [] });
            },
            release: jest.fn()
        });
        const provider = new PostgresConnectionProvider('PG', DatabaseType.POSTGRES, {}, 'pg_first');
        Object.assign(provider, { pool: { connect: async () => Promise.resolve(client) } });
        return { provider, blocks: () => blocks, release: client.release };
    };

    it('should run the block again when a deadlock turned it away', async () => {
        const { provider, blocks }: Failing = providerFailing('40P01', '40P01');
        await expect(provider.connect()).resolves.toBeDefined();
        expect(blocks()).toEqual(3);
    });

    it('should run the block once when it failed for another reason, a lock not had in time too, hand the connection back, and run it again on the next', async () => {
        for (const code of ['55P03', '40001']) {
            const { provider, blocks, release }: Failing = providerFailing(code, code);
            await expect(provider.connect()).rejects.toMatchObject({ code });
            expect(blocks()).toEqual(1);
            expect(release).toHaveBeenCalledTimes(1);
            await expect(provider.connect()).rejects.toMatchObject({ code });
            expect(blocks()).toEqual(2);
            expect(release).toHaveBeenCalledTimes(2);
        }
    });

    /**
     * A block the store refuses for good, as a user who may not make tables (42501) or a database that may only be
     * read, a hot standby's (25006), is warned of once and not run again by the provider: the connection is handed out,
     * so plain SQL works (liberation-data/drivine4j#453, liberation-data/drivine-python#290).
     */
    it('should hand out each connection, warn once, and not run the block again, where the user or the database may not make the tables', async () => {
        for (const code of ['42501', '25006']) {
            const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
            const { provider, blocks, release }: Failing = providerFailing(code, code);
            await expect(provider.connect()).resolves.toBeDefined();
            await expect(provider.connect()).resolves.toBeDefined();
            expect(blocks()).toEqual(1);
            expect(release).not.toHaveBeenCalled();
            expect(warn).toHaveBeenCalledTimes(1);
            warn.mockRestore();
        }
    });

    it('should check again on a new provider over the same store', async () => {
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        const first = providerFailing('42501');
        await expect(first.provider.connect()).resolves.toBeDefined();
        const second = providerFailing('42501');
        await expect(second.provider.connect()).resolves.toBeDefined();
        expect(second.blocks()).toEqual(1);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    /** A session whose id can't be read is handed back to the pool, closed, not kept from it (liberation-data/drivine#765). */
    it('should hand a connection back to the pool where its session id could not be read, judged or not', async () => {
        for (const connect of ['connect', 'connectUnjudged'] as const) {
            const failure = new Error('connection terminated');
            const client = pooledClient({
                query: async (sql: string | { text: string }) => {
                    const text = typeof sql === 'string' ? sql : sql.text;
                    if (text.includes('pg_backend_pid')) {
                        return Promise.reject(failure);
                    }
                    return Promise.resolve({
                        rows: text.startsWith('SELECT count(*) AS "made"') ? [{ made: '0' }] : []
                    });
                },
                release: jest.fn()
            });
            const provider = new PostgresConnectionProvider('PG', DatabaseType.POSTGRES, {}, 'pg_session');
            Object.assign(provider, { pool: { connect: async () => Promise.resolve(client) } });
            // The pool's own release, which the provider's checkout wraps.
            const release = client.release;
            await expect(provider[connect]()).rejects.toBe(failure);
            expect(release).toHaveBeenCalledWith(failure);
        }
    });

    /**
     * The server may end a session in use, as on a restart, a failover or a session killed: node-postgres rejects the
     * statement running and says so as an 'error' too, which, unheard, would end the process. Heard while the session is
     * out of the pool, warned of, and the session closed for good when it is released.
     */
    describe('a session the server ends', () => {
        type Ending = { provider: PostgresConnectionProvider; client: EventEmitter & { release: jest.Mock } };
        const ending = (): Ending => {
            const client = pooledClient({
                query: async (sql: string | { text: string }) => {
                    const text = typeof sql === 'string' ? sql : sql.text;
                    if (text.includes('pg_backend_pid')) {
                        return Promise.resolve({ rows: [{ sid: 's.1' }] });
                    }
                    return Promise.resolve({
                        rows: text.startsWith('SELECT count(*) AS "made"') ? [{ made: '0' }] : []
                    });
                },
                release: jest.fn()
            });
            const provider = new PostgresConnectionProvider('PG', DatabaseType.POSTGRES, {}, 'pg_ended');
            Object.assign(provider, { pool: { connect: async () => Promise.resolve(client) } });
            return { provider, client };
        };

        it('should hear it while the session is in use, judged or not, and close the session for good on release', async () => {
            for (const connect of ['connect', 'connectUnjudged'] as const) {
                const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
                const { provider, client }: Ending = ending();
                const release = client.release;
                const connection = await provider[connect]();
                const ended = new Error('Connection terminated unexpectedly');
                expect(() => client.emit('error', ended)).not.toThrow();
                expect(warn).toHaveBeenCalledWith(expect.stringContaining('Connection terminated unexpectedly'));
                await connection.release();
                expect(release).toHaveBeenCalledWith(ended);
                expect(client.listenerCount('error')).toEqual(0);
                warn.mockRestore();
            }
        });

        it('should give a session back to the pool as before where the server ended none', async () => {
            const { provider, client }: Ending = ending();
            const release = client.release;
            const connection = await provider.connect();
            await connection.release();
            expect(release).toHaveBeenCalledWith(undefined);
            expect(client.listenerCount('error')).toEqual(0);
        });

        it('should still close for good a session an index build ran on, where the server ended none', async () => {
            const { provider, client }: Ending = ending();
            const release = client.release;
            const connection = (await provider.connect()) as PostgresConnection;
            connection.buildingIndex();
            await connection.release();
            expect(release).toHaveBeenCalledWith(true);
            expect(client.listenerCount('error')).toEqual(0);
        });

        it("should hear an idle session's end, which the pool says of it", () => {
            const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
            const provider = new PostgresConnectionProvider('PG', DatabaseType.POSTGRES, {}, 'pg_idle');
            const pool = (provider as any).pool as EventEmitter;
            expect(() =>
                pool.emit('error', new Error('terminating connection due to administrator command'))
            ).not.toThrow();
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('administrator command'));
            warn.mockRestore();
        });
    });
});
