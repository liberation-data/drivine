import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { DrivineError } from '@/DrivineError';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { Transaction } from '@/transaction/Transaction';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { QuerySpecification } from '@/query/QuerySpecification';
import { Cursor } from '@/cursor/Cursor';
import { FinderOperations } from '@/manager/FinderOperations';

export class TransactionalPersistenceManager implements PersistenceManager {
    private finderOperations: FinderOperations;

    constructor(readonly contextHolder: TransactionContextHolder, readonly database: string) {
        this.finderOperations = new FinderOperations(this);
    }

    async query<T>(spec: QuerySpecification<T>): Promise<T[]> {
        const transaction = this.currentTransactionOrThrow();
        return transaction.query(spec, this.database);
    }

    async getOne<T>(spec: QuerySpecification<T>): Promise<T> {
        return await this.finderOperations.getOne(spec);
    }

    async maybeGetOne<T>(spec: QuerySpecification<T>): Promise<T | undefined> {
        return await this.finderOperations.maybeGetOne(spec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<Cursor<T>> {
        const transaction = this.currentTransactionOrThrow();
        return transaction.openCursor(spec, this.database);
    }

    private currentTransactionOrThrow(): Transaction {
        const transaction = this.contextHolder.currentTransaction;
        if (!transaction) {
            throw new DrivineError(
                'TransactionalPersistenceManager ' +
                    'requires a transaction. Mark the transactional method with the @Transactional() decorator, or use ' +
                    'NonTransactionalPersistenceManager'
            );
        }
        return transaction;
    }
}
