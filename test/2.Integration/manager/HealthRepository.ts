import { Injectable } from '@nestjs/common';
import { QuerySpecification } from '@/query/QuerySpecification';
import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { InjectPersistenceManager } from '@/DrivineInjectionDecorators';
import { PersistenceManagerType } from '@/manager/PersistenceManagerType';

@Injectable()
export class HealthRepository {

    constructor(
        @InjectPersistenceManager(PersistenceManagerType.NON_TRANSACTIONAL, 'TRAFFIC')
        readonly persistenceManager: NonTransactionalPersistenceManager) {
    }

    async countAllVertices(): Promise<number> {
        const results = await this.persistenceManager.query<any>(
            new QuerySpecification(`match (n) return count(n) as count`)
        );
        return results[0].count;
    }
}
