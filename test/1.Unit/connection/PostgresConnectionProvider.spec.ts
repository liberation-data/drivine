import { DatabaseType } from '@/connection/DatabaseType';
import { PostgresConnectionProvider } from '@/connection/postgres/PostgresConnectionProvider';
import { DrivineLogger } from '@/logger';

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
        const client = {
            query: async (sql: string) => {
                if (sql.includes('pg_backend_pid')) {
                    return Promise.resolve({ rows: [{ sid: 's.1' }] });
                }
                const code = codes[blocks++];
                return code
                    ? Promise.reject(Object.assign(new Error('deadlock detected'), { code }))
                    : Promise.resolve({ rows: [] });
            },
            release: jest.fn()
        };
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
});
