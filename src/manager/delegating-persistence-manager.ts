import { PersistenceManager } from '@/manager';
import { TransactionContextHolder } from '@/transaction';
import { PersistenceManagerFactory } from '@/manager';
import { QuerySpecification } from '@/query';
import { Cursor } from '@/cursor/Cursor';
import { CursorSpecification } from '@/cursor';
import { DrivineLogger } from '@/logger';

/**
 * Delegates to NonTransactional or TransactionalPersistenceManger, depending on whether there is a transaction in
 * flight.
 */
export class DelegatingPersistenceManager implements PersistenceManager {
    private logger = new DrivineLogger(DelegatingPersistenceManager.name);

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

    async execute(spec: QuerySpecification<void>): Promise<void> {
        return this.persistenceManager().execute(spec);
    }

    private persistenceManager(): PersistenceManager {
        const type = this.contextHolder.currentTransaction ? 'TRANSACTIONAL' : 'NON_TRANSACTIONAL';
        this.logger.verbose(`Using persistence manager: ${type}`);
        return this.factory.buildOrResolve(this.database, type);
    }
}
