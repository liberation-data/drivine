import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseRegistry, RunWithDrivine } from '@liberation-data/drivine';
import { DrivineModule, DrivineModuleOptions } from '@liberation-data/drivine/nest';
import { MemgraphRepository } from './MemgraphRepository';

// Requires the MEMGRAPH_* connection in .env (see .env.example).
RunWithDrivine({ rollback: true });
describe('MemgraphRepository', () => {
    let repo: MemgraphRepository;
    let app: TestingModule;

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv('MEMGRAPH')]
                })
            ],
            providers: [MemgraphRepository]
        }).compile();
        repo = app.get(MemgraphRepository);
    });

    afterAll(async () => {
        await app.close();
    });

    it('should write and read a node back as its properties, inside a transaction', async () => {
        await repo.createHero('Moon Girl', ['genius']);
        expect(await repo.findHero('Moon Girl')).toEqual({ name: 'Moon Girl', powers: ['genius'] });
    });

    it('should have rolled back the previous test', async () => {
        expect(await repo.findHero('Moon Girl')).toBeUndefined();
    });

    it('should stream results through a cursor, in batches', async () => {
        expect(await repo.streamSeries(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
});
