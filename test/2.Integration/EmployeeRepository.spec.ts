import { Test, TestingModule } from '@nestjs/testing';
import {
    DatabaseRegistry,
    DrivineError,
    DrivineModule,
    DrivineModuleOptions,
    RunWithDrivine
} from "@liberation-data/drivine";
import { EmployeeRepository } from './EmployeeRepository';
import { Employee } from "./models/Employee";
import { plainToInstance } from "class-transformer";

const moment = require('moment');

// NOTICE
// before running the tests, add new records from test/moon-town.cypher
// and manually run: MERGE (u:Employee {id: 1, name: 'Piotr'})

RunWithDrivine({ rollback: false });
describe('HealthRepository', () => {
    let repo: EmployeeRepository;
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
            providers: [EmployeeRepository],
            controllers: []
        }).compile();
        repo = app.get(EmployeeRepository);
    });

    afterAll(async () => {
        await app.close();
    });

    it('should find one User', async () => {
        const result = await repo.findById(1);
        expect(result).not.toBeNull();
        expect(result.name).toEqual('Piotr');
        expect(result.id).toEqual(1);
        expect(result.joined instanceof Date).toBeTruthy()
    });

    it('should reject for invalid user id', async () => {
        return expect(repo.findById(234234234)).rejects.toBeInstanceOf(DrivineError);
    });

    it('should save a user', async () => {
        const data = { id: 2, name: 'Jasper', joined: new Date() };
        // create user
        const user = await repo.save(data);
        expect(user).toMatchObject(data);
        // find created user
        const user2 = await repo.findById(data.id);
        expect(user2).toMatchObject(data);
    });

    it('should update user', async () => {
        const data = new Employee(7, 'Adam', new Date(0));
        const data2 = new Employee(7, 'Eve', new Date(0));

        // create user
        const user = await repo.save(data);
        expect(user).toMatchObject(data);

        const adamToEve = plainToInstance(Employee, {
            ...data,
            name: data2.name
        })

        const updated = await repo.update(adamToEve);
        expect(updated).toMatchObject(data2);
        // find updated user
        const updated2 = await repo.findById(data.id);
        expect(updated2).toMatchObject(data2);
    });
});
