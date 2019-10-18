import { Injectable } from '@nestjs/common';
import { QuerySpecification } from '@/query/QuerySpecification';
import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';

@Injectable()
export class HealthRepository {
    public constructor(public readonly persistenceManager: NonTransactionalPersistenceManager) {}

    public async countAllVertices(): Promise<number> {
        const results = await this.persistenceManager.query<any>(
            new QuerySpecification(`match (n) return count(n) as count`)
        );
        return results[0].count;
    }
}
