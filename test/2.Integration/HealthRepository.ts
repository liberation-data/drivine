import { Injectable } from '@nestjs/common';
import { PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { InjectPersistenceManager } from '@liberation-data/drivine/nest';

@Injectable()
export class HealthRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager
    ) {}

    async countAllMetros(): Promise<number> {
        return this.persistenceManager.getOne<any>(new QuerySpecification(`match (n) return count(n) as count`));
    }

    async filterTest(): Promise<number[]> {
        return this.persistenceManager.query(
            new QuerySpecification<number>(`unwind [1, 2, 3, 4, 5, 6, 7, 8, 9] as num return num`).filter(
                (it: number) => it % 2 == 0
            )
        );
    }
}
