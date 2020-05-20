import { HealthRepository } from './HealthRepository';
import { Test, TestingModule } from '@nestjs/testing';
import { DrivineModule, DrivineModuleOptions, DatabaseRegistry, RunWithDrivine} from '@liberation-data/drivine';

RunWithDrivine()
describe('HealthRepository', () => {
    let repo: HealthRepository;
    let app: TestingModule

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [
                        DatabaseRegistry.buildOrResolveFromEnv(),
                        DatabaseRegistry.buildOrResolveFromEnv('TRAFFIC')
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
        const results = await repo.countAllVertices();
        expect(results).toBe(23);
    });
});
