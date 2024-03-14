import { HealthRepository } from './HealthRepository';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseRegistry, DrivineModule, DrivineModuleOptions, RunWithDrivine } from '@liberation-data/drivine';

RunWithDrivine({ rollback: true });
describe('HealthRepository', () => {
    let repo: HealthRepository;
    let app: TestingModule;

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [
                        DatabaseRegistry.buildOrResolveFromEnv(),
                        DatabaseRegistry.buildOrResolveFromEnv('TRAFFIC'),
                        DatabaseRegistry.buildOrResolveFromEnv('POSTGRES')
                    ]
                })
            ],
            providers: [HealthRepository],
            controllers: []
        }).compile();
        repo = app.get(HealthRepository);
    });
    afterAll(async () => {
        await app.close();
    });

    it('should count all nodes', async () => {
        const results = await repo.countAllMetros();
        expect(results).toBeGreaterThanOrEqual(23);
    });


    it('should filter results', async () => {
        const results = await repo.filterTest();
        expect(results).toEqual([2, 4, 6, 8]);
    });

    // it('should return from pg_tables', async () => {
    //     const results = await repo.pgTables();
    //     expect(results.length).toBeGreaterThan(0);
    // });
});
