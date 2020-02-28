import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { DrivineError } from '@/DrivineError';
import { Injectable } from '@nestjs/common';
import { PersistenceManagerOptions } from '@/manager/PersistenceManagerOptions';
import { DelegatingPersistenceManager } from '@/manager/DelegatingPersistenceManager';

interface PersistenceManagerEntry {
    transactional: TransactionalPersistenceManager;
    nonTransactional: NonTransactionalPersistenceManager;
    delegating: DelegatingPersistenceManager;
}

@Injectable()
export class PersistenceManagerFactory {
    readonly managers: Map<string, PersistenceManagerEntry> = new Map<string, PersistenceManagerEntry>();

    constructor(readonly registry: DatabaseRegistry, readonly contextHolder: TransactionContextHolder) {
    }

    buildOrResolve(options?: PersistenceManagerOptions): PersistenceManager {
        const database = options && options.database ? options.database : 'default';
        if (!this.managers.get(database)) {
            this.register(database);
        }
        switch (options && options.type ? options.type : undefined) {
            case 'TRANSACTIONAL':
                return this.managers.get(database)!.transactional;
            case 'NON_TRANSACTIONAL':
                return this.managers.get(database)!.nonTransactional;
            default:
                return this.managers.get(database)!.delegating;
        }
    }

    private register(name: string): void {
        const connectionProvider = this.registry.connectionProvider(name);
        if (!connectionProvider) {
            throw new DrivineError(`No database is registered under name: ${name}`);
        }

        this.managers.set(name, <PersistenceManagerEntry>{
            transactional: new TransactionalPersistenceManager(this.contextHolder, name),
            nonTransactional: new NonTransactionalPersistenceManager(connectionProvider),
            delegating: new DelegatingPersistenceManager(name, this.contextHolder, this)
        });
    }
}
