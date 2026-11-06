import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { DrivineError } from '@/DrivineError';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { Transaction } from '@/transaction/Transaction';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { QuerySpecification } from '@/query/QuerySpecification';
import { Cursor } from '@/cursor/Cursor';
import { FinderOperations } from '@/manager/FinderOperations';
import { DatabaseType } from '@/connection';
import { refusedInTransaction } from '@/schema/ddl/SchemaDdl';

export class TransactionalPersistenceManager implements PersistenceManager {
    private finderOperations: FinderOperations;

    constructor(
        readonly contextHolder: TransactionContextHolder,
        readonly database: string,
        readonly type: DatabaseType
    ) {
        this.finderOperations = new FinderOperations(this);
    }

    /**
     * Runs a statement in the transaction. Neo4j schema DDL given as Cypher to Postgres, Oracle or SQLite is refused
     * here, as Drivine applies it outside any transaction (see SchemaCommands), save `db.awaitIndexes`, which does
     * nothing there.
     */
    async query<T>(spec: QuerySpecification<T>): Promise<T[]> {
        if (refusedInTransaction(this.type, spec)) {
            return [];
        }
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
