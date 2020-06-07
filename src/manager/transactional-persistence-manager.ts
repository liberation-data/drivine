import { TransactionContextHolder } from '@/transaction';
import { DrivineError } from '@/drivine-error';
import { PersistenceManager } from '@/manager';
import { Transaction } from '@/transaction';
import { CursorSpecification } from '@/cursor';
import { QuerySpecification } from '@/query';
import { Cursor } from '@/cursor';
import { FinderOperations } from '@/manager';

export class TransactionalPersistenceManager implements PersistenceManager {
    private finderOperations: FinderOperations;

    constructor(readonly contextHolder: TransactionContextHolder, readonly database: string) {
        this.finderOperations = new FinderOperations(this);
    }

    async query<T>(spec: QuerySpecification<T>): Promise<T[]> {
        const transaction = this.currentTransactionOrThrow();
        return transaction.query(spec, this.database);
    }

    async execute(spec: QuerySpecification<void>): Promise<void> {
        await this.query(spec);
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
