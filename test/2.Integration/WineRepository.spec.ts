import { Test, TestingModule } from '@nestjs/testing';
import { DrivineModule, DrivineModuleOptions, DatabaseRegistry, RunWithDrivine } from '@liberation-data/drivine';
import { WineRepository } from './WineRepository';

RunWithDrivine({ rollback: false });
describe('WineRepository', () => {
    let repo: WineRepository;
    let app: TestingModule;

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv('WINE')]
                })
            ],
            providers: [WineRepository],
            controllers: []
        }).compile();
        repo = app.get(WineRepository);
    });

    afterAll(async () => {
        await app.close();
    });

    it('should list prolific wine tasters', async () => {
        const results = await repo.listProlificWineTasters();
        console.log(JSON.stringify(results));
    });

    it('should list return a taster\'s profile', async () => {
        const results = await repo.getTasterProfile('Christina Pickard');
        console.log(JSON.stringify(results));
    });

});
