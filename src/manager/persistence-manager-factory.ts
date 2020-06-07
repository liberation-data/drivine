import { NonTransactionalPersistenceManager } from '@/manager';
import { TransactionalPersistenceManager } from '@/manager';
import { PersistenceManager } from '@/manager';
import { DatabaseRegistry } from '@/connection';
import { TransactionContextHolder } from '@/transaction';
import { DrivineError } from '@/drivine-error';
import { Injectable } from '@nestjs/common';
import { PersistenceManagerType } from '@/manager';
import { DelegatingPersistenceManager } from '@/manager';

interface PersistenceManagerEntry {
    transactional: TransactionalPersistenceManager;
    nonTransactional: NonTransactionalPersistenceManager;
    delegating: DelegatingPersistenceManager;
}

@Injectable()
export class PersistenceManagerFactory {
    readonly managers: Map<string, PersistenceManagerEntry> = new Map<string, PersistenceManagerEntry>();

    constructor(readonly registry: DatabaseRegistry, readonly contextHolder: TransactionContextHolder) {}

    buildOrResolve(database: string = 'default', type: PersistenceManagerType = 'DELEGATING'): PersistenceManager {
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
