import { Injectable } from '@nestjs/common';
import { TransactionContextKeys } from '@/transaction/TransactionContextKeys';
import { Transaction } from '@/transaction/Transaction';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { DrivineContext } from '@/context/DrivineContext';
import { MakeLocalStorage } from '@/utils/LocalStorageFactory';

/**
 * Wrap local storage to make it injectable.
 */
@Injectable()
export class TransactionContextHolder {
    static instance: TransactionContextHolder;

    readonly localStorage = MakeLocalStorage()

    static getInstance(): TransactionContextHolder {
        if (!TransactionContextHolder.instance) {
            TransactionContextHolder.instance = new TransactionContextHolder();
        }
        return TransactionContextHolder.instance;
    }

    static tearDown(): void {
        TransactionContextHolder.instance.tearDown();
        delete TransactionContextHolder.instance;
    }

    run(fn: (...args: any[]) => void): void {
        return this.localStorage.run(fn);
    }

    runAndReturn<T>(fn: (...args: any[]) => T): T {
        return this.localStorage.runAndReturn(fn);
    }

    async runPromise<T>(fn: (...args: any[]) => Promise<T>): Promise<T> {
        return this.localStorage.runPromise(fn);
    }

    get drivineContext(): DrivineContext | undefined {
        return this.localStorage.get<DrivineContext | undefined>(TransactionContextKeys.DRIVINE_CONTEXT);
    }

    set drivineContext(context: DrivineContext | undefined) {
        this.localStorage.set<DrivineContext | undefined>(TransactionContextKeys.DRIVINE_CONTEXT, context);
    }

    get currentTransaction(): Transaction | undefined {
        return this.localStorage.get<Transaction>(TransactionContextKeys.TRANSACTION);
    }

    set currentTransaction(transaction: Transaction | undefined) {
        this.localStorage.set<Transaction | undefined>(TransactionContextKeys.TRANSACTION, transaction);
    }

    get databaseRegistry(): DatabaseRegistry {
        return this.localStorage.get<DatabaseRegistry>(TransactionContextKeys.DATABASE_REGISTRY);
    }

    set databaseRegistry(registry: DatabaseRegistry) {
        this.localStorage.set<DatabaseRegistry>(TransactionContextKeys.DATABASE_REGISTRY, registry);
    }

   
    private tearDown(): void {
        this.localStorage.tearDown();
    }
}
