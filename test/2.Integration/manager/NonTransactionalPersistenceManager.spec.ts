import { inTestContext } from '@/test/TestContext';
import { HealthRepository } from './HealthRepository';
import { Test, TestingModule } from '@nestjs/testing';
import { DrivineModule, DrivineModuleOptions } from '@/DrivineModule';
import { ConnectionProviderRegistry } from '@/connection/ConnectionProviderRegistry';

describe('HealthRepository', () => {
    let repo: HealthRepository;

    beforeAll(async () => {
        const app: TestingModule = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [ConnectionProviderRegistry.buildOrResolveFromEnv('MOVIES')]
                })
            ],
            providers: [HealthRepository],
            controllers: []
        }).compile();
        repo = app.get(HealthRepository);
    });

    it('should count all nodes', async () => {
        return inTestContext().run(async () => {
            const results = await repo.countAllVertices();
            expect(results).toBeGreaterThan(0);
            console.log(`Got results: ${results}`);
        });
    });
});
