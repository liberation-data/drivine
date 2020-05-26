import { PersistenceManager } from '@/manager/PersistenceManager';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { QuerySpecification } from '@/query/QuerySpecification';
import { Cursor } from '@/cursor/Cursor';
import { Logger } from '@nestjs/common';
import { CursorSpecification } from '@/cursor/CursorSpecification';

/**
 * Delegates to NonTransactional or TransactionalPersistenceManger, depending on whether there is a transaction in
 * flight.
 */
export class DelegatingPersistenceManager implements PersistenceManager {
    private logger = new Logger(DelegatingPersistenceManager.name);

    constructor(
        readonly database: string,
        readonly contextHolder: TransactionContextHolder,
        readonly factory: PersistenceManagerFactory
    ) {}

    async getOne<T>(spec: QuerySpecification<T>): Promise<T> {
        return this.persistenceManager().getOne<T>(spec);
    }

    async maybeGetOne<T>(spec: QuerySpecification<T>): Promise<T | undefined> {
        return this.persistenceManager().maybeGetOne<T>(spec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<Cursor<T>> {
        return this.persistenceManager().openCursor(spec);
    }

    async query<T>(spec: QuerySpecification<T>): Promise<T[]> {
        return this.persistenceManager().query(spec);
    }

    private persistenceManager(): PersistenceManager {
        const type = this.contextHolder.currentTransaction ? 'TRANSACTIONAL' : 'NON_TRANSACTIONAL';
        this.logger.verbose(`Using persistence manager: ${type}`);
        return this.factory.buildOrResolve(this.database, type);
    }
}
