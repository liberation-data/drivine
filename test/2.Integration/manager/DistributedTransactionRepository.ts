import { Injectable } from '@nestjs/common';
import { InjectPersistenceManager } from '@/DrivineInjectionDecorators';
import { PersistenceManagerType } from '@/manager/PersistenceManagerType';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { Transactional } from '@/transaction/Transactional';
import { QuerySpecification } from '@/query/QuerySpecification';

@Injectable()
export class DistributedTransactionRepository {

    constructor(
        @InjectPersistenceManager(PersistenceManagerType.TRANSACTIONAL, 'TRAFFIC')
        readonly trafficManager: PersistenceManager,
        @InjectPersistenceManager(PersistenceManagerType.TRANSACTIONAL, 'NEO')
        readonly neoManager: PersistenceManager
    ) {
    }

    @Transactional()
    async createNodes(): Promise<void> {
        const date = new Date().valueOf();
        const spec = new QuerySpecification(
            `merge (:Person {firstName: 'Jasper', lastName:'Blues', lastUpdate: ${date}})`);
        await this.trafficManager.query(spec);
        await this.neoManager.query(spec);
    }
}
