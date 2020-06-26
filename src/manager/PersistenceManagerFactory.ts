import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { DrivineError } from '@/DrivineError';
import { Injectable } from '@nestjs/common';
import { PersistenceManagerType } from '@/manager/PersistenceManagerType';
import { DelegatingPersistenceManager } from '@/manager/DelegatingPersistenceManager';

interface PersistenceManagerEntry {
    transactional: TransactionalPersistenceManager;
    nonTransactional: NonTransactionalPersistenceManager;
    delegating: DelegatingPersistenceManager;
}

@Injectable()
export class PersistenceManagerFactory {
    readonly managers: Map<string, PersistenceManagerEntry> = new Map<string, PersistenceManagerEntry>();

    constructor(readonly registry: DatabaseRegistry, readonly contextHolder: TransactionContextHolder) {}

    /**
     * Returns a PersistenceManager for the database registered under the specified name.
     * @param database Unique name for the registered database.
     * @param type Either TRANSACTIONAL, NON_TRANSACTION or (default) delegating persistence manager. The latter
     * will decide at runtime, depending whether a transaction is in flight, ie whether the current context of execution
     * is @Transactional().
     */
    get(database: string = 'default', type: PersistenceManagerType = 'DELEGATING'): PersistenceManager {
        if (!this.managers.get(database)) {
            this.register(database);
        }
        switch (type) {
            case 'TRANSACTIONAL':
                return this.managers.get(database)!.transactional;
            case 'NON_TRANSACTIONAL':
                return this.managers.get(database)!.nonTransactional;
            case 'DELEGATING':
                return this.managers.get(database)!.delegating;
            default:
                throw new DrivineError(`Invalid PersistenceManagerType: ${type}`);
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
