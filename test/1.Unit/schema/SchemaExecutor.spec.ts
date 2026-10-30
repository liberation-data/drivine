import {
    CONTENDED_ATTEMPTS,
    Connection,
    ConnectionProvider,
    DatabaseType,
    SchemaExecutor
} from '@liberation-data/drivine';
import { FirstConnection } from '@/connection/FirstConnection';
import { OracleGraph } from '@/backend/oracle';
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

    /** A provider whose connections fail each statement with the next of `failures`, then return no rows. */
    const failing = (failures: string[]): { provider: ConnectionProvider; runs: () => number } => {
        let runs = 0;
        const connection = {
            query: async () => {
                runs++;
                const failure = failures.shift();
                return failure ? Promise.reject(new Error(failure)) : Promise.resolve([]);
            },
            release: async () => Promise.resolve()
        };
        const provider = {
            name: 'oracle',
            type: DatabaseType.ORACLE,
            connect: async () => Promise.resolve(connection)
        } as any;
        return { provider, runs: () => runs };
    };

    it("should run DDL again that Oracle turned away while another session's DDL held the table", async () => {
        const { provider, runs }: { provider: ConnectionProvider; runs: () => number } = failing([
            'ORA-00054: resource busy and acquire with NOWAIT specified or timeout expired',
            'ORA-06512: at line 7\nORA-04020: deadlock detected while trying to lock object JVM_NODE'
        ]);
        await expect(new SchemaExecutor(provider).run('CREATE INDEX x ON y (z)')).resolves.toEqual([]);
        expect(runs()).toEqual(3);
    });

    it('should run DDL again that Postgres turned away for a deadlock, but not for a lock not had in time', async () => {
        for (const [code, expected] of [
            ['40P01', 2],
            ['55P03', 1]
        ] as const) {
            let runs = 0;
            const provider = {
                name: 'postgres',
                type: DatabaseType.POSTGRES,
                connect: async () =>
                    Promise.resolve({
                        query: async () =>
                            ++runs === 1
                                ? Promise.reject(Object.assign(new Error('deadlock detected'), { code }))
                                : Promise.resolve([]),
                        release: async () => Promise.resolve()
                    })
            } as any;
            const run = new SchemaExecutor(provider).run('CREATE INDEX x ON y (z)');
            await (expected === 2 ? expect(run).resolves.toEqual([]) : expect(run).rejects.toMatchObject({ rootCause: { code } }));
            expect(runs).toEqual(expected);
        }
    });

    /** A provider whose first connection runs a graph's first-use block that fails with `message` each time. */
    const firstUseFailing = (message: string): { provider: ConnectionProvider; runs: () => number } => {
        let runs = 0;
        const first = new FirstConnection();
        const graph = new OracleGraph('tenant_a');
        const connection = {
            execute: async () => {
                runs++;
                return Promise.reject(new Error(message));
            },
            release: async () => Promise.resolve()
        };
        const provider = {
            name: 'oracle',
            type: DatabaseType.ORACLE,
            connect: async () =>
                first.ensured(
                    connection,
                    async (it) => graph.ensure(it),
                    async () => Promise.resolve()
                )
        } as any;
        return { provider, runs: () => runs };
    };

    it("should not run the graph's first-use block again once its first connection gave up on it", async () => {
        const { provider, runs }: { provider: ConnectionProvider; runs: () => number } = firstUseFailing(
            'ORA-04020: deadlock detected while trying to lock object X'
        );
        await expect(new SchemaExecutor(provider).run('CREATE INDEX x ON y (z)')).rejects.toThrow(/ORA-04020/);
        expect(runs()).toEqual(CONTENDED_ATTEMPTS);
    });

    it("should not run the graph's first-use block again when its lock stayed busy, though a schema statement's would be", async () => {
        const { provider, runs }: { provider: ConnectionProvider; runs: () => number } = firstUseFailing(
            'ORA-00054: resource busy and acquire with NOWAIT specified'
        );
        await expect(new SchemaExecutor(provider).run('CREATE INDEX x ON y (z)')).rejects.toThrow(/ORA-00054/);
        expect(runs()).toEqual(1);
    });

    it('should not run again a statement Oracle refused for another reason', async () => {
        const { provider, runs }: { provider: ConnectionProvider; runs: () => number } = failing([
            'ORA-01408: such column list already indexed'
        ]);
        await expect(new SchemaExecutor(provider).run('CREATE INDEX x ON y (z)')).rejects.toThrow(/ORA-01408/);
        expect(runs()).toEqual(1);
    });
});
