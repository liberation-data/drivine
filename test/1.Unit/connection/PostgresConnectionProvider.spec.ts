import { DatabaseType } from '@/connection/DatabaseType';
import { PostgresConnectionProvider } from '@/connection/postgres/PostgresConnectionProvider';

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

    it('should run the block once when it failed for another reason, a lock not had in time too, and hand the connection back', async () => {
        for (const code of ['42501', '55P03']) {
            const { provider, blocks, release }: Failing = providerFailing(code);
            await expect(provider.connect()).rejects.toMatchObject({ code });
            expect(blocks()).toEqual(1);
            expect(release).toHaveBeenCalledTimes(1);
        }
    });
});
