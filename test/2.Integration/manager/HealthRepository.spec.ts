import { HealthRepository } from './HealthRepository';
import { Test, TestingModule } from '@nestjs/testing';
import { DrivineModule, DrivineModuleOptions, DatabaseRegistry, RunWithDrivine} from '@liberation-data/drivine';

// NOTICE
// before running the tests, add new records from test/moon-town.cypher
// or manually run: MERGE (u:User {id: 1, name: 'Piotr'})
// TODO later we should add it inside of tests in beforeAll hook

RunWithDrivine({
    // transaction:{rollback: true}
})
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
        const results = await repo.countAllMetros();
        expect(results).toBe(23);
    });


    it('should find one User', () => {
        return expect(repo.findById(1)).resolves.toMatchObject({id: 1, name: 'Piotr'})
    });

    it('should not find any user & reject', () => {
        return expect(repo.findById(234234234)).rejects.toBeInstanceOf(Error)
    });
    
    it('should create new user', async () => {
        const data = {id: 2, name: 'Jasper'};
        // create user
        const user = await repo.create(data);
        expect(user).toMatchObject(data)
        // find created user
        const user2 = await repo.findById(data.id);
        expect(user2).toMatchObject(data)
  
      });
    
    it('should update user', async () => {
        const data = {id: 3, name: 'Adam'};
        const data2 = {id: 3, name: 'Eve'};
        // create user
        const user = await repo.create(data);
        expect(user).toMatchObject(data)
        // update user
        const user2 = await repo.update(data2);
        expect(user2).toMatchObject(data2)
        // find updated user
        const user3 = await repo.findById(data.id);
        expect(user3).toMatchObject(data2)
  
      });

});
