import { Injectable } from '@nestjs/common';
import { TransactionContextKeys } from '@/transaction/TransactionContextKeys';
import { Transaction } from '@/transaction/Transaction';
import { AgensGraphConnectionProvider } from '@/connection/AgensGraphConnectionProvider';
import cls = require('cls-hooked');
import { ConnectionProvider } from '@/connection/ConnectionProvider';

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

    get connectionProvider(): ConnectionProvider {
        return this.get<AgensGraphConnectionProvider>(TransactionContextKeys.CONNECTION_PROVIDER);
    }

    set connectionProvider(provider: ConnectionProvider) {
        this.set<ConnectionProvider>(TransactionContextKeys.CONNECTION_PROVIDER, provider);
    }

    private get<T>(key: string): T {
        return TransactionContextHolder.instance.get(key);
    }

    private set<T>(key: string, object: T): void {
        TransactionContextHolder.instance.set(key, object);
    }
}
