import {
    CONTENDED_ATTEMPTS,
    Connection,
    ConnectionProvider,
    DatabaseType,
    SchemaExecutor,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { FirstConnection } from '@/connection/FirstConnection';
import { OracleGraph } from '@/backend/oracle';
import { OracleSchemaGrammar } from '@/backend/oracle/OracleSchemaGrammar';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { PostgresSchemaGrammar } from '@/backend/postgres/PostgresSchemaGrammar';
import { PostgresConnection } from '@/connection/postgres/PostgresConnection';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { DrivineLogger } from '@/logger';
import { rangeIndex, vectorIndex } from '@/schema/SchemaSpecs';
import { error, Neo4jError } from 'neo4j-driver';
import { PoolClient } from 'pg';

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

    // An Oracle index's block has waited thirty seconds on the busy lock before it gives up: run again, as other DDL is,
    // it would wait as long again each time, three minutes in all.
    it("should not run again an Oracle index's block that waited out a busy lock itself, but should for a deadlock", async () => {
        const block = new OracleSchemaGrammar(new OracleGraph('jvm'))
            .createUnique(uniquenessConstraint('DrivineStore', 'key'))
            .find((it) => it.includes('CREATE UNIQUE INDEX'))!;
        const busy = failing(['ORA-00054: resource busy and acquire with NOWAIT specified or timeout expired']);
        await expect(new SchemaExecutor(busy.provider).run(block)).rejects.toThrow(/ORA-00054/);
        expect(busy.runs()).toEqual(1);
        const deadlocked = failing(['ORA-04020: deadlock detected while trying to lock object JVM_NODE']);
        await expect(new SchemaExecutor(deadlocked.provider).run(block)).resolves.toEqual([]);
        expect(deadlocked.runs()).toEqual(2);
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
        const first = new FirstConnection(() => "graph 'tenant_a'");
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

    /**
     * A Postgres statement that builds an index runs on a session closed for good after, rather than pooled, whether it
     * passed or failed: the backend keeps the shared memory a parallel build had for as long as it lives (#641,
     * liberation-data/drivine4j#626). A drop builds nothing, and the session of any other statement goes back.
     */
    describe('on Postgres', () => {
        const grammar = new PostgresSchemaGrammar(new PostgresGraph('g'));
        const range = rangeIndex('Chunk', 'a');

        /** The arguments the session of each statement run was released with, by a Postgres provider over a fake pool. */
        const releasedWith = async (statements: string[], failing?: Error): Promise<unknown[][]> => {
            const release = jest.fn();
            const client = {
                query: async () => (failing ? Promise.reject(failing) : Promise.resolve({ rows: [] })),
                release
            } as unknown as PoolClient;
            const provider = {
                name: 'postgres',
                type: DatabaseType.POSTGRES,
                connect: async () => Promise.resolve(new PostgresConnection(client, new PostgresResultMapper(), 'g'))
            } as unknown as ConnectionProvider;
            for (const statement of statements) {
                await new SchemaExecutor(provider).run(statement).catch(() => undefined);
            }
            return release.mock.calls;
        };

        const creates = (statements: string[]): string[] =>
            statements.filter((it) => /^CREATE (UNIQUE )?INDEX/.test(it));

        it('should close the session a CREATE INDEX or a CREATE UNIQUE INDEX ran on', async () => {
            const builds = [
                ...creates(grammar.createRange(range)),
                ...creates(grammar.createUnique(uniquenessConstraint('Chunk', 'b'))),
                ...creates(grammar.createVector(vectorIndex('Chunk', 'embedding', 4))),
                'create unique index x on y (z)',
                '  CREATE\n  INDEX x ON y (z)'
            ];
            expect(builds.length).toEqual(5);
            expect(await releasedWith(builds)).toEqual(builds.map(() => [true]));
        });

        it('should close the session a CREATE INDEX failed on, released with its error', async () => {
            const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
            const failure = new Error('could not resize shared memory segment: No space left on device');
            expect(await releasedWith(creates(grammar.createRange(range)), failure)).toEqual([[failure]]);
            warn.mockRestore();
        });

        it('should give back to the pool the session of a DROP INDEX, or of any other statement', async () => {
            const others = [
                ...grammar.dropRange(range),
                'DROP INDEX IF EXISTS g_ix_chunk_a',
                'CREATE EXTENSION IF NOT EXISTS vector',
                grammar.createRange(range)[1],
                'CREATE TABLE created_index (x int)',
                'SELECT 1 AS "CREATE INDEX"'
            ];
            expect(await releasedWith(others)).toEqual(others.map(() => [undefined]));
        });
    });

    it('should mark no session for an index build on another store', async () => {
        const buildingIndex = jest.fn();
        const provider = {
            name: 'oracle',
            type: DatabaseType.ORACLE,
            connect: async () =>
                Promise.resolve({
                    query: async () => Promise.resolve([]),
                    release: async () => Promise.resolve(),
                    buildingIndex
                })
        } as unknown as ConnectionProvider;
        await new SchemaExecutor(provider).run('CREATE INDEX x ON y (z)');
        await new SchemaExecutor(provider).run('CREATE UNIQUE INDEX x ON y (z)');
        expect(buildingIndex).not.toHaveBeenCalled();
    });
});
