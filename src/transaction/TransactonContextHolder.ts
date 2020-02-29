import { Injectable } from '@nestjs/common';
import { TransactionContextKeys } from '@/transaction/TransactionContextKeys';
import { Transaction } from '@/transaction/Transaction';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { Namespace } from 'cls-hooked';
const cls = require('cls-hooked');

/**
 * Wrap local storage to make it injectable.
 */
@Injectable()
export class TransactionContextHolder {
    static instance: TransactionContextHolder;

    readonly namespace: Namespace;

    static getInstance(): TransactionContextHolder {
        if (!TransactionContextHolder.instance) {
            TransactionContextHolder.instance = new TransactionContextHolder();
        }
        return TransactionContextHolder.instance;
    }

    constructor() {
        const namespaceName = '__transaction_context_holder__';
        this.namespace = cls.getNamespace(namespaceName) || cls.createNamespace(namespaceName);
    }

    run(fn: (...args: any[]) => void): void {
        return this.namespace.run(fn);
    }

    runAndReturn<T>(fn: (...args: any[]) => T): T {
        return this.namespace.runAndReturn(fn);
    }

    async runPromise<T>(fn: (...args: any[]) => Promise<T>): Promise<T> {
        return this.namespace.runPromise(fn);
    }

    get inContext(): boolean {
        return this.get<boolean>(TransactionContextKeys.DRIVINE);
    }

    set inContext(context: boolean) {
        this.set<boolean>(TransactionContextKeys.DRIVINE, context);
    }

    get currentTransaction(): Transaction | undefined {
        return this.get<Transaction>(TransactionContextKeys.TRANSACTION);
    }

    set currentTransaction(transaction: Transaction | undefined) {
        this.set<Transaction | undefined>(TransactionContextKeys.TRANSACTION, transaction);
    }

    get databaseRegistry(): DatabaseRegistry {
        return this.get<DatabaseRegistry>(TransactionContextKeys.DATABASE_REGISTRY);
    }

    set databaseRegistry(registry: DatabaseRegistry) {
        this.set<DatabaseRegistry>(TransactionContextKeys.DATABASE_REGISTRY, registry);
    }

    private get<T>(key: string): T {
        return this.namespace.get(key);
    }

    private set<T>(key: string, object: T): void {
        this.namespace.set(key, object);
    }
}
