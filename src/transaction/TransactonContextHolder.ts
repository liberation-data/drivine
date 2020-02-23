import { Injectable } from '@nestjs/common';
import { TransactionContextKeys } from '@/transaction/TransactionContextKeys';
import { Transaction } from '@/transaction/Transaction';
import cls = require('cls-hooked');
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';

/**
 * Wrap local storage to make it injectable.
 */
@Injectable()
export class TransactionContextHolder {
    static instance = cls.createNamespace('__transaction_context_holder__');

    run(fn: (...args: any[]) => void): void {
        return TransactionContextHolder.instance.run(fn);
    }

    runAndReturn<T>(fn: (...args: any[]) => T): T {
        return TransactionContextHolder.instance.runAndReturn(fn);
    }

    async runPromise<T>(fn: (...args: any[]) => Promise<T>): Promise<T> {
        return TransactionContextHolder.instance.runPromise(fn);
    }

    get currentTransaction(): Transaction {
        return this.get<Transaction>(TransactionContextKeys.TRANSACTION);
    }

    set currentTransaction(context: Transaction) {
        this.set<Transaction>(TransactionContextKeys.TRANSACTION, context);
    }

    get databaseRegistry(): DatabaseRegistry {
        return this.get<DatabaseRegistry>(TransactionContextKeys.DATABASE_REGISTRY);
    }

    set databaseRegistry(registry: DatabaseRegistry) {
        this.set<DatabaseRegistry>(TransactionContextKeys.DATABASE_REGISTRY, registry);
    }

    private get<T>(key: string): T {
        return TransactionContextHolder.instance.get(key);
    }

    private set<T>(key: string, object: T): void {
        TransactionContextHolder.instance.set(key, object);
    }
}
