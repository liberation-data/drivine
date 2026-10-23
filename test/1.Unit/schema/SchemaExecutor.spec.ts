import { Connection, ConnectionProvider, DatabaseType, SchemaExecutor } from '@liberation-data/drivine';
import { error, Neo4jError } from 'neo4j-driver';

describe('SchemaExecutor', () => {
    /** A provider whose first statement fails with the code given and whose later ones succeed. */
    const failingOnce = (code: string, calls: { count: number }): ConnectionProvider => ({
        name: 'schema',
        type: DatabaseType.NEO4J,
        connect: async () =>
            Promise.resolve({
                query: async () =>
                    ++calls.count === 1 ? Promise.reject(new Neo4jError(code, code)) : Promise.resolve([]),
                release: async () => Promise.resolve()
            } as unknown as Connection),
        end: async () => Promise.resolve()
    });

    it('should run a schema statement turned away by a deadlock again', async () => {
        const calls = { count: 0 };
        const executor = new SchemaExecutor(failingOnce('Neo.TransientError.Transaction.DeadlockDetected', calls));
        await expect(executor.run('CREATE INDEX')).resolves.toEqual([]);
        expect(calls.count).toEqual(2);
    });

    it('should not run again a schema statement that lost its connection, though the driver calls it retriable', async () => {
        for (const code of [error.SERVICE_UNAVAILABLE, error.SESSION_EXPIRED]) {
            const calls = { count: 0 };
            await expect(new SchemaExecutor(failingOnce(code, calls)).run('CREATE INDEX')).rejects.toMatchObject({
                rootCause: { code }
            });
            expect(calls.count).toEqual(1);
        }
    });
});
