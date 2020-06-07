import { Injectable } from '@nestjs/common';
import {
    Transactional,
    PersistenceManager,
    InjectPersistenceManager,
    QuerySpecification
} from '@liberation-data/drivine';
import { User } from './models/User';

@Injectable()
export class HealthRepository {
    constructor(@InjectPersistenceManager() readonly persistenceManager: PersistenceManager) {}

    async countAllMetros(): Promise<number> {
        const results = await this.persistenceManager.query<any>(
            new QuerySpecification(`match (n:Metro) with count(n) as count return {count: count}`)
        );
        return results[0].count;
    }

    @Transactional()
    async findById(id: number): Promise<User> {
        const statement = `MATCH (u:Employee) WHERE u.id = $1 RETURN u`;
        return this.persistenceManager
            .query(
                new QuerySpecification<User>()
                    .withStatement(statement)
                    .bind([id])
            )
            .then((rows) => (rows[0] ? rows[0] : Promise.reject(new Error('404 Not Found'))));
    }

    @Transactional()
    async save(user: User): Promise<User> {
        const statement = `MERGE (u:Employee {id: $1}) set u += $2 RETURN u`;
        return this.persistenceManager.getOne(
            new QuerySpecification<User>()
                .withStatement(statement)
                .bind([user.id, user])
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
            new QuerySpecification<User>()
                .withStatement(statement)
                .bind([user.id, user])
        );
    }
}
