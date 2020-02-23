import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { PersistenceManagerType } from '@/manager/PersistenceManagerType';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { DrivineError } from '@/DrivineError';

export class PersistenceManagerFactory {

    readonly nonTransactionalManagers: Map<string, NonTransactionalPersistenceManager> = new Map();
    readonly transactionalManagers: Map<string, TransactionalPersistenceManager> = new Map();

    constructor(readonly registry: DatabaseRegistry,
                readonly localStorage: TransactionContextHolder) {
    }

    buildOrResolve(type: PersistenceManagerType, database: string = 'default'): PersistenceManager {
        switch (type) {
            case PersistenceManagerType.TRANSACTIONAL:
            default:
                return this.transactional(database);
            case PersistenceManagerType.NON_TRANSACTIONAL:
                return this.nonTransactional(database);
        }
    }

    private transactional(name: string = 'default'): TransactionalPersistenceManager {
        if (!this.transactionalManagers.get(name)) {
            this.transactionalManagers.set(name, new TransactionalPersistenceManager(this.localStorage));
        }
        return this.transactionalManagers.get(name)!;
    }

    private nonTransactional(name: string = 'default'): NonTransactionalPersistenceManager {
        if (!this.nonTransactionalManagers.get(name)) {
            const connectionProvider = this.registry.connectionProvider(name);
            if (!connectionProvider) {
                throw new DrivineError(`No database is registered under name: ${name}`);
            }
            this.nonTransactionalManagers.set(name, new NonTransactionalPersistenceManager(connectionProvider));
        }
        return this.nonTransactionalManagers.get(name)!;
    }

}
