import { Injectable } from '@nestjs/common';
import {
    InjectPersistenceManager,
    PersistenceManager,
    QuerySpecification,
    Transactional
} from '@liberation-data/drivine';
import { User } from './models/User';

@Injectable()
export class HealthRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectPersistenceManager('POSTGRES') readonly pgManager: PersistenceManager
    ) {}

    async countAllMetros(): Promise<number> {
        return this.persistenceManager.getOne<any>(new QuerySpecification(`match (n:Metro) return count(n) as count`));
    }

    @Transactional()
    async findById(id: number): Promise<User> {
        const statement = `MATCH (u:Employee) WHERE u.id = $1 RETURN u`;
        return this.persistenceManager
            .query(new QuerySpecification<User>().withStatement(statement).bind([id]))
            .then((rows) => (rows[0] ? rows[0] : Promise.reject(new Error('404 Not Found'))));
    }

    @Transactional()
    async save(user: User): Promise<User> {
        const statement = `MERGE (u:Employee {id: $1}) set u += $2 RETURN u`;
        return this.persistenceManager.getOne(
            new QuerySpecification<User>().withStatement(statement).bind([user.id, user])
        );
    }

    @Transactional()
    async update(user: Partial<User>): Promise<User> {
        const statement = `
            MATCH (u:Employee {id: $1})
            SET u += $2
            RETURN u
        `;
        return this.persistenceManager.getOne(
            new QuerySpecification<User>().withStatement(statement).bind([user.id, user])
        );
    }

    async filterTest(): Promise<number[]> {
        return this.persistenceManager.query(
            new QuerySpecification<number>(`unwind [1, 2, 3, 4, 5, 6, 7, 8, 9] as num return num`).filter(
                (it: number) => it % 2 == 0
            )
        );
    }

    async pgTables(): Promise<any[]> {
        return this.pgManager.query(new QuerySpecification(`select * from pg_catalog.pg_tables`));
    }
}
