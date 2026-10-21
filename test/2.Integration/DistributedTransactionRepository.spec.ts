import { Test, TestingModule } from '@nestjs/testing';
import { DistributedTransactionRepository } from './DistributedTransactionRepository';
import { DatabaseRegistry, runInTransaction, RunWithDrivine } from '@liberation-data/drivine';
import { DrivineModule, DrivineModuleOptions } from '@liberation-data/drivine/nest';

RunWithDrivine();
describe('DistributedTransactionRepository', () => {
    let repo: DistributedTransactionRepository;
    let app: TestingModule;

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
            providers: [DistributedTransactionRepository],
            controllers: []
        }).compile();
        repo = app.get(DistributedTransactionRepository);
    });
    afterAll(async () => {
        await app.close();
    });

    it('should run transactions across multiple databases', async () => {
        await runInTransaction(async () => {
            await repo.createNodes();
        });
    });
});
