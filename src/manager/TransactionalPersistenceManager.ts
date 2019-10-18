import {Injectable} from '@nestjs/common';
import {TransactionContextHolder} from '@/transaction/TransactonContextHolder';
import {DrivineError} from '@/DrivineError';
import {PersistenceManager} from '@/manager/PersistenceManager';
import {Transaction} from '@/transaction/Transaction';
import {CursorSpecification} from '@/cursor/CursorSpecification';
import {QuerySpecification} from '@/query/QuerySpecification';
import {Cursor} from "@/cursor/Cursor";

@Injectable()
export class TransactionalPersistenceManager implements PersistenceManager {
    public constructor(public readonly localStorage: TransactionContextHolder) {}

    public async query<T>(spec: QuerySpecification<T>): Promise<T[]> {
        const transaction = this.currentTransactionOrThrow();
        return transaction.query(spec);
    }

    public async openCursor<T>(spec: CursorSpecification<T>): Promise<Cursor<T>> {
        const transaction = this.currentTransactionOrThrow();
        return transaction.openCursor(spec);
    }

    private currentTransactionOrThrow(): Transaction {
        const transaction = this.localStorage.currentTransaction;
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
