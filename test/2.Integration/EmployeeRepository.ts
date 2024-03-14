import { Injectable } from '@nestjs/common';
import {
    InjectPersistenceManager,
    ObjectUtils,
    PersistenceManager,
    QuerySpecification,
    Transactional
} from '@liberation-data/drivine';
import { Employee } from './models/Employee';

@Injectable()
export class EmployeeRepository {
    constructor(@InjectPersistenceManager() readonly persistenceManager: PersistenceManager) {}

    @Transactional()
    async findById(id: number): Promise<Employee> {
        const statement = `MATCH (u:Employee) WHERE u.id = $1 RETURN u`;
        return this.persistenceManager.getOne(new QuerySpecification<Employee>().withStatement(statement).bind([id]));
    }

    @Transactional()
    async save(user: Employee): Promise<Employee> {
        const statement = `MERGE (u:Employee {id: $1}) set u += $2 RETURN u`;
        return this.persistenceManager.getOne(
            new QuerySpecification<Employee>()
                .withStatement(statement)
                .bind([user.id, ObjectUtils.primitiveProps(user)])
        );
    }

    @Transactional()
    async update(user: Partial<Employee>): Promise<Employee> {
        const statement = `
            MATCH (u:Employee {id: $1})
            SET u += $2
            RETURN u
        `;
        const props = ObjectUtils.primitiveProps(user);
        return this.persistenceManager.getOne(
            new QuerySpecification<Employee>()
                .withStatement(statement)
                .bind([user.id, props])
        );
    }
}
