import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { Transactional } from '@/transaction/Transactional';
import { AgensGraphConnectionProvider } from '@/connection/AgensGraphConnectionProvider';
import * as assert from 'assert';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';

require('dotenv').config({
    path: process.env.DOTENV_CONFIG_PATH || require('find-config')('.env')
});

export function inTestContext(): TestContext {
    const context = new TestContext(true);
    DatabaseRegistry.getInstance().providers.forEach(provider => {
        if (provider instanceof AgensGraphConnectionProvider) {
            assert(
                provider.idleTimeoutMillis === 500,
                `DATABASE_IDLE_TIMEOUT must be set to 500 in test environments - so that jest can shut down cleanly`
            );
        }
    });
    return context;
}

export class TestContext {
    constructor(readonly rollback: boolean) {}

    withRollback(rollback: boolean): TestContext {
        return new TestContext(rollback);
    }

    async run(fn: (...args: any[]) => Promise<any>): Promise<any> {
        return TransactionContextHolder.getInstance().runPromise(async () => {
            TransactionContextHolder.getInstance().databaseRegistry = DatabaseRegistry.getInstance();
            return this.runInTransaction(fn);
        });
    }

    @Transactional()
    private async runInTransaction(fn: (...args: any[]) => Promise<any>): Promise<any> {
        const transaction = TransactionContextHolder.getInstance().currentTransaction!;
        if (this.rollback) {
            transaction.markAsRollback();
        }
        return fn();
    }
}
