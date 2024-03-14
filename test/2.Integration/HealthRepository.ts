import { Injectable } from '@nestjs/common';
import { InjectPersistenceManager, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';

@Injectable()
export class HealthRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectPersistenceManager('POSTGRES') readonly pgManager: PersistenceManager
    ) {}

    async countAllMetros(): Promise<number> {
        return this.persistenceManager.getOne<any>(new QuerySpecification(`match (n:Metro) return count(n) as count`));
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
