import { NonTransactionalPersistenceManager } from '@/manager/NonTransactionalPersistenceManager';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { DrivineError } from '@/DrivineError';
import { Injectable } from '@nestjs/common';
import {
    optionsWithDefaults,
    PersistenceManagerOptions,
    PersistenceManagerOptionsWithDefaults
} from '@/manager/PersistenceManagerOptions';

@Injectable()
export class PersistenceManagerFactory {
    readonly managers: Map<string, PersistenceManager> = new Map<string, PersistenceManager>();

    constructor(readonly registry: DatabaseRegistry, readonly contextHolder: TransactionContextHolder) {}

    buildOrResolve(options?: PersistenceManagerOptions): PersistenceManager {
        const defaults = optionsWithDefaults(options);
        if (!this.managers.get(defaults.key)) {
            this.register(defaults);
        }
        return this.managers.get(defaults.key)!;
    }

    private register(options: PersistenceManagerOptionsWithDefaults): void {
        switch (options.type) {
            case 'TRANSACTIONAL':
            default:
                this.managers.set(
                    options.key,
                    new TransactionalPersistenceManager(this.contextHolder, options.database)
                );
                break;
            case 'NON_TRANSACTIONAL':
                if (!this.registry.connectionProvider(options.database)) {
                    throw new DrivineError(`No database is registered under name: ${options.database}`);
                }
                this.managers.set(
                    options.key,
                    new NonTransactionalPersistenceManager(this.registry.connectionProvider(options.database)!)
                );
                break;
        }
    }
}
