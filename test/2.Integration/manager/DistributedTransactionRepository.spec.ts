import { Test, TestingModule } from '@nestjs/testing';
import { DistributedTransactionRepository } from './DistributedTransactionRepository';
import { DrivineModule, DrivineModuleOptions, DatabaseRegistry, runInTransaction, RunWithDrivine } from '@liberation-data/drivine';

RunWithDrivine();
describe('DistributedTransactionRepository', () => {
    let repo: DistributedTransactionRepository;

    beforeAll(async () => {
        const app: TestingModule = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [
                        DatabaseRegistry.buildOrResolveFromEnv('TRAFFIC'),
                        DatabaseRegistry.buildOrResolveFromEnv('NEO')
                    ]
                })
            ],
            providers: [DistributedTransactionRepository],
            controllers: []
        }).compile();
        repo = app.get(DistributedTransactionRepository);
    });

    it('should run transactions across multiple databases', async () => {
        await runInTransaction(async() => {
            await repo.createNodes(new Date().valueOf());
        });
    });
});
