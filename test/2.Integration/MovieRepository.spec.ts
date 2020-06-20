import { Test, TestingModule } from '@nestjs/testing';
import { DrivineModule, DrivineModuleOptions, DatabaseRegistry, RunWithDrivine } from '@liberation-data/drivine';
import { MovieRepository } from './MovieRepository';

RunWithDrivine({ rollback: false });
describe('MovieRepository', () => {
    let repo: MovieRepository;
    let app: TestingModule;

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv()]
                })
            ],
            providers: [MovieRepository],
            controllers: []
        }).compile();
        repo = app.get(MovieRepository);
    });

    afterAll(async () => {
        await app.close();
    });

    // it('should load test data', async () => {
    //     await repo.loadTestData();
    // })

    it('should load list the movies for an actor', async () => {
        const results = await repo.listMoviesForActor('Tom Hanks');
        console.log(JSON.stringify(results));
    });
});
