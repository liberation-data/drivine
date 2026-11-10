import { PoolClient } from 'pg';
import { PostgresConnection } from '@/connection/postgres/PostgresConnection';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { DrivineLogger } from '@/logger';

type Released = { connection: PostgresConnection; release: jest.Mock };

/** A connection over a client of no pool, whose `release` is recorded. */
const connection = (): Released => {
    const release = jest.fn();
    const client = { query: async () => Promise.resolve({ rows: [] }), release } as unknown as PoolClient;
    return { connection: new PostgresConnection(client, new PostgresResultMapper()), release };
};

/**
 * A session an index build ran on is closed for good when released, rather than pooled, whether the build passed or
 * failed: node-postgres closes a client released with `true` or an error (#641, liberation-data/drivine4j#626).
 */
describe('PostgresConnection release', () => {
    it('should close the session, released with true, once an index build ran on it', async () => {
        const { connection: built, release }: Released = connection();
        built.buildingIndex();
        await built.release();
        expect(release.mock.calls).toEqual([[true]]);
    });

    it('should pass the error it was released with, whether an index build ran on it or not', async () => {
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        const failure = new Error('could not resize shared memory segment');
        for (const building of [true, false]) {
            const { connection: failed, release }: Released = connection();
            if (building) {
                failed.buildingIndex();
            }
            await failed.release(failure);
            expect(release.mock.calls).toEqual([[failure]]);
        }
        warn.mockRestore();
    });

    it('should give the session back to the pool, released with nothing, where no index build ran on it', async () => {
        const { connection: plain, release }: Released = connection();
        await plain.release();
        expect(release.mock.calls).toEqual([[undefined]]);
    });
});
