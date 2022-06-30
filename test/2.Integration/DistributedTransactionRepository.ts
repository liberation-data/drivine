import { Injectable } from '@nestjs/common';
import { InjectPersistenceManager } from '@/DrivineInjectionDecorators';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { Transactional } from '@/transaction/Transactional';
import { QuerySpecification } from '@/query/QuerySpecification';

@Injectable()
export class DistributedTransactionRepository {
    constructor(
        @InjectPersistenceManager() readonly database1: PersistenceManager,
        @InjectPersistenceManager('TRAFFIC') readonly database2: PersistenceManager
    ) {}

    @Transactional()
    async createNodes(): Promise<void> {
        const spec1 = new QuerySpecification()
            .withStatement(`merge (p:Person {firstName: $1, lastName: $2})`)
            .bind(['first 1', 'last 2']);

        const spec2 = new QuerySpecification()
            .withStatement(`merge (p:Person {firstName: $1, lastName: $2})`)
            .bind(['first 1', 'last 2']);

        await this.database1.query(spec1);
        await this.database2.query(spec2);
    }
}
