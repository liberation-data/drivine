import { DatabaseType } from '@liberation-data/drivine';
import { getContainerRuntimeClient, ImageName, PullPolicy, StartedTestContainer } from 'testcontainers';
import { DrivineLogger } from '@/logger';
import { DrivineTestContainers, Environment, TEST_CONTAINER_SPECS, TestContainerSpec } from '@/testing';

jest.mock('testcontainers', () => ({
    ...jest.requireActual('testcontainers'),
    getContainerRuntimeClient: jest.fn()
}));

describe('DrivineTestContainers', () => {
    describe('datasources', () => {
        it('finds the default datasource and each named one, by its prefix', () => {
            const env: Environment = {
                DATABASE_TYPE: 'NEO4J',
                MEMGRAPH_DATABASE_TYPE: 'MEMGRAPH',
                MY_GRAPH_DATABASE_TYPE: 'FALKORDB',
                DATABASE_HOST: 'localhost'
            };
            expect(DrivineTestContainers.datasources(env)).toEqual([
                { prefix: '', type: DatabaseType.NEO4J },
                { prefix: 'MEMGRAPH_', type: DatabaseType.MEMGRAPH },
                { prefix: 'MY_GRAPH_', type: DatabaseType.FALKORDB }
            ]);
        });

        it('passes over a type that is declared but unset, or blank', () => {
            expect(DrivineTestContainers.datasources({ DATABASE_TYPE: undefined, ORACLE_DATABASE_TYPE: '' })).toEqual(
                []
            );
        });
    });

    describe('useLocal', () => {
        it('is true only for USE_LOCAL_<TYPE>=true, in any case', () => {
            expect(DrivineTestContainers.useLocal(DatabaseType.NEO4J, { USE_LOCAL_NEO4J: 'TRUE' })).toBe(true);
            expect(DrivineTestContainers.useLocal(DatabaseType.NEO4J, { USE_LOCAL_NEO4J: 'false' })).toBe(false);
            expect(DrivineTestContainers.useLocal(DatabaseType.NEO4J, { USE_LOCAL_MEMGRAPH: 'true' })).toBe(false);
            expect(DrivineTestContainers.useLocal(DatabaseType.NEO4J, {})).toBe(false);
        });
    });

    describe('image', () => {
        it('is the latest Neo4j, Memgraph and FalkorDB by default, and pins Postgres and Oracle', () => {
            expect(DrivineTestContainers.image(DatabaseType.NEO4J, {})).toBe('neo4j:latest');
            expect(DrivineTestContainers.image(DatabaseType.MEMGRAPH, {})).toBe('memgraph/memgraph:latest');
            expect(DrivineTestContainers.image(DatabaseType.FALKORDB, {})).toBe('falkordb/falkordb:latest');
            expect(DrivineTestContainers.image(DatabaseType.POSTGRES, {})).toBe('pgvector/pgvector:pg16');
            expect(DrivineTestContainers.image(DatabaseType.ORACLE, {})).toBe('gvenzl/oracle-free:23-faststart');
        });

        it('is <TYPE>_TEST_IMAGE where it is set, for that type only', () => {
            const env: Environment = {
                NEO4J_TEST_IMAGE: 'neo4j:5.26-community',
                MEMGRAPH_TEST_IMAGE: 'memgraph/memgraph:3.14.0',
                FALKORDB_TEST_IMAGE: 'falkordb/falkordb:6.0.3'
            };
            expect(DrivineTestContainers.image(DatabaseType.NEO4J, env)).toBe('neo4j:5.26-community');
            expect(DrivineTestContainers.image(DatabaseType.MEMGRAPH, env)).toBe('memgraph/memgraph:3.14.0');
            expect(DrivineTestContainers.image(DatabaseType.FALKORDB, env)).toBe('falkordb/falkordb:6.0.3');
            expect(DrivineTestContainers.image(DatabaseType.POSTGRES, env)).toBe('pgvector/pgvector:pg16');
        });

        it('is the default where <TYPE>_TEST_IMAGE is blank, as in drivine-python', () => {
            expect(DrivineTestContainers.image(DatabaseType.NEO4J, { NEO4J_TEST_IMAGE: '' })).toBe('neo4j:latest');
        });

        it('is undefined for a type without a container', () => {
            expect(DrivineTestContainers.image('NEPTUNE' as DatabaseType, {})).toBeUndefined();
        });
    });

    describe('movingTag', () => {
        it('is true for latest, for no tag (a registry port is no tag), and for a tag with no version in it', () => {
            for (const image of [
                'falkordb/falkordb:latest',
                'ghcr.io/falkordb/falkordb:latest',
                'neo4j',
                'localhost:5000/falkordb',
                'memgraph/memgraph:edge'
            ]) {
                expect([image, DrivineTestContainers.movingTag(image)]).toEqual([image, true]);
            }
        });

        it('is false for a version, a digest and an image id, which are pulled only where they are missing', () => {
            for (const image of [
                'falkordb/falkordb:6.0.3',
                'pgvector/pgvector:pg16',
                'gvenzl/oracle-free:23-faststart',
                'neo4j:5.26-community',
                `falkordb/falkordb@sha256:${'a'.repeat(64)}`,
                // An image's local id, which ImageName reads as a name with no tag, and which no registry has to pull.
                '0123456789abcdef'.repeat(4)
            ]) {
                expect([image, DrivineTestContainers.movingTag(image)]).toEqual([image, false]);
            }
        });
    });

    describe('start', () => {
        it('starts nothing, and changes nothing, for local datasources and types without a container', async () => {
            const env: Environment = {
                DATABASE_TYPE: 'NEO4J',
                DATABASE_HOST: 'localhost',
                DATABASE_PORT: '17687',
                USE_LOCAL_NEO4J: 'true',
                TRAFFIC_DATABASE_TYPE: 'NEPTUNE',
                TRAFFIC_DATABASE_HOST: 'neptune.example.com'
            };
            const before = { ...env };
            const containers = await DrivineTestContainers.start(env);
            expect(containers.started.size).toBe(0);
            expect(env).toEqual(before);
            await containers.stop();
        });

        describe('a container, without a container runtime', () => {
            const falkordb = TEST_CONTAINER_SPECS[DatabaseType.FALKORDB]!;
            const inspect = jest.fn();
            const withPullPolicy = jest.fn();
            let ran: string[];

            beforeEach(() => {
                ran = [];
                const started = {
                    getHost: () => 'localhost',
                    getMappedPort: () => 16379,
                    stop: async () => Promise.resolve()
                } as unknown as StartedTestContainer;
                const container = { withPullPolicy, start: async () => Promise.resolve(started) };
                withPullPolicy.mockReset().mockReturnValue(container);
                inspect
                    .mockReset()
                    .mockResolvedValue({ Id: 'sha256:local', RepoDigests: ['falkordb/falkordb@sha256:abc'] });
                jest.mocked(getContainerRuntimeClient).mockResolvedValue({ image: { inspect } } as never);
                TEST_CONTAINER_SPECS[DatabaseType.FALKORDB] = {
                    ...falkordb,
                    container: (image: string) => {
                        ran.push(image);
                        return container;
                    }
                } as unknown as TestContainerSpec;
            });

            afterEach(() => {
                TEST_CONTAINER_SPECS[DatabaseType.FALKORDB] = falkordb;
            });

            it('pulls an image of a moving tag afresh, and inspects that image, its registry and all', async () => {
                const env: Environment = {
                    DATABASE_TYPE: 'FALKORDB',
                    FALKORDB_TEST_IMAGE: 'ghcr.io/falkordb/falkordb:latest'
                };
                const containers = await DrivineTestContainers.start(env);
                expect(ran).toEqual(['ghcr.io/falkordb/falkordb:latest']);
                expect(withPullPolicy).toHaveBeenCalledWith(PullPolicy.alwaysPull());
                expect(inspect).toHaveBeenCalledWith(ImageName.fromString('ghcr.io/falkordb/falkordb:latest'));
                expect(env.DATABASE_PORT).toBe('16379');
                await containers.stop();
            });

            it('runs the default image where FALKORDB_TEST_IMAGE is blank, as CI leaves it, pulled afresh', async () => {
                const containers = await DrivineTestContainers.start({
                    DATABASE_TYPE: 'FALKORDB',
                    FALKORDB_TEST_IMAGE: ''
                });
                expect(ran).toEqual(['falkordb/falkordb:latest']);
                expect(withPullPolicy).toHaveBeenCalledWith(PullPolicy.alwaysPull());
                await containers.stop();
            });

            it('leaves a pinned image to the default pull policy', async () => {
                const env: Environment = { DATABASE_TYPE: 'FALKORDB', FALKORDB_TEST_IMAGE: 'falkordb/falkordb:6.0.4' };
                const containers = await DrivineTestContainers.start(env);
                expect(ran).toEqual(['falkordb/falkordb:6.0.4']);
                expect(withPullPolicy).not.toHaveBeenCalled();
                await containers.stop();
            });

            it("logs the image's digest, and its local id where it has none, as an image built and not pushed", async () => {
                const log = jest.spyOn(DrivineLogger.prototype, 'log').mockImplementation(() => undefined);
                try {
                    let containers = await DrivineTestContainers.start({ DATABASE_TYPE: 'FALKORDB' });
                    await containers.stop();
                    inspect.mockResolvedValue({ Id: 'sha256:local', RepoDigests: [] });
                    containers = await DrivineTestContainers.start({
                        DATABASE_TYPE: 'FALKORDB',
                        FALKORDB_TEST_IMAGE: 'mine/falkordb:6.0.4'
                    });
                    await containers.stop();
                    expect(log.mock.calls.map(([message]) => message as string)).toEqual([
                        'FALKORDB (default): starting falkordb/falkordb:latest, pulled afresh',
                        'FALKORDB (default): falkordb/falkordb:latest is falkordb/falkordb@sha256:abc',
                        'FALKORDB (default): starting mine/falkordb:6.0.4',
                        'FALKORDB (default): mine/falkordb:6.0.4 is sha256:local'
                    ]);
                } finally {
                    log.mockRestore();
                }
            });

            it('starts the container all the same where the runtime cannot say what the image is', async () => {
                inspect.mockRejectedValue(new Error('no such image'));
                const env: Environment = { DATABASE_TYPE: 'FALKORDB' };
                const containers = await DrivineTestContainers.start(env);
                expect(containers.started.size).toBe(1);
                expect(env.DATABASE_PORT).toBe('16379');
                await containers.stop();
            });
        });
    });
});
