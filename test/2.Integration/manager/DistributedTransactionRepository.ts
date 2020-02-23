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
    async createNodes(date: number): Promise<void> {
        const spec = new QuerySpecification()
            .withStatement(`merge (p:Person {firstName: 'Jasper', lastName:'Blues'}) 
                on create set p.lastUpdate = $1 on match set p.lastUpdate=$1`)
            .bind([date]);
        await this.trafficManager.query(spec);
        await this.neoManager.query(spec);
    }
}
