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

        it('passes over a type that is declared but unset', () => {
            expect(DrivineTestContainers.datasources({ DATABASE_TYPE: undefined })).toEqual([]);
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
