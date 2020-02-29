import { Injectable } from '@nestjs/common';
import { QuerySpecification } from '@/query/QuerySpecification';
import { InjectPersistenceManager } from '@/DrivineInjectionDecorators';
import { PersistenceManager } from '@/manager/PersistenceManager';

@Injectable()
export class HealthRepository {
    constructor(@InjectPersistenceManager('TRAFFIC') readonly persistenceManager: PersistenceManager) {}

    async countAllVertices(): Promise<number> {
        const results = await this.persistenceManager.query<any>(
            new QuerySpecification(`match (n) return count(n) as count`)
        );
        return results[0].count;
    }
}
