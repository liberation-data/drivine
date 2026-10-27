import { DatabaseType } from '@liberation-data/drivine';
import { DrivineTestContainers, Environment } from '@/testing';

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
            expect(DrivineTestContainers.datasources({ DATABASE_TYPE: undefined, ORACLE_DATABASE_TYPE: '' })).toEqual([]);
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
    });
});
