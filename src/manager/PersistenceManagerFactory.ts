import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { PersistenceManagerType } from '@/manager/PersistenceManagerType';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { DrivineError } from '@/DrivineError';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PersistenceManagerFactory {
    readonly managers: Map<string, PersistenceManager> = new Map<string, PersistenceManager>();

    constructor(readonly registry: DatabaseRegistry, readonly contextHolder: TransactionContextHolder) {}

    buildOrResolve(type: PersistenceManagerType, database: string = 'default'): PersistenceManager {
        const key = `${type}:${database}`;
        if (!this.managers.get(`${key}`)) {
            this.register(type, database);
        }
        return this.managers.get(key)!;
    }

    private register(type: PersistenceManagerType, database: string): void {
        const key = `${type}:${database}`;
        switch (type) {
            case PersistenceManagerType.TRANSACTIONAL:
            default:
                this.managers.set(key, new TransactionalPersistenceManager(this.contextHolder, database));
                break;
            case PersistenceManagerType.NON_TRANSACTIONAL:
                if (!this.registry.connectionProvider(database)) {
                    throw new DrivineError(`No database is registered under name: ${database}`);
                }
                this.managers.set(key, new NonTransactionalPersistenceManager(
                    this.registry.connectionProvider(database)!));
                break;
        }
    }
}
