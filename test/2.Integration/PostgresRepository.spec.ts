import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseRegistry, DrivineModule, DrivineModuleOptions, RunWithDrivine } from '@liberation-data/drivine';
import { PostgresRepository } from './PostgresRepository';

// Requires the POSTGRES_* connection in .env (see .env.example).
RunWithDrivine({ rollback: true });
describe('PostgresRepository', () => {
    let repo: PostgresRepository;
    let app: TestingModule;

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv('POSTGRES')]
                })
            ],
            providers: [PostgresRepository]
        }).compile();
        repo = app.get(PostgresRepository);
    });

    afterAll(async () => {
        await app.close();
    });

    it('should write and read with named parameters, inside a transaction', async () => {
        await repo.createPeople(['Moon Girl', 'Devil Dinosaur']);
        const names = await repo.findByNames(['Moon Girl', 'Devil Dinosaur', 'Nobody']);
        expect(names).toEqual(['Devil Dinosaur', 'Moon Girl']);
    });

    it('should have rolled back the previous test', async () => {
        expect(await repo.personTableExists()).toBe(false);
    });

    it('should stream results through a cursor, in batches', async () => {
        expect(await repo.streamSeries(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
});
