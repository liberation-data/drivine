import { TransactionContextHolder } from '@/transaction';
import { optionsWithDefaults, runInTransaction, TransactionOptions } from '@/transaction';
import { DatabaseRegistry } from '@/connection';

export function inDrivineContext(): DrivineContext {
    const contextHolder = TransactionContextHolder.getInstance();
    if (contextHolder.drivineContext) {
        return contextHolder.drivineContext;
    } else {
        return new DrivineContext(contextHolder, DatabaseRegistry.getInstance());
    }
}

export class DrivineContext {
    private transactionOptions?: TransactionOptions;

    constructor(readonly contextHolder: TransactionContextHolder, readonly databaseRegistry: DatabaseRegistry) {}

    withTransaction(options?: TransactionOptions): DrivineContext {
        this.transactionOptions = optionsWithDefaults(options);
        return this;
    }

    async run(fn: () => Promise<any>): Promise<any> {
        if (this.contextHolder.drivineContext) {
            return this.transactionOptions ? runInTransaction(fn, this.transactionOptions) : fn();
        } else {
            return this.contextHolder.runPromise(async () => {
                this.contextHolder.drivineContext = this;
                this.contextHolder.databaseRegistry = this.databaseRegistry;
                return this.transactionOptions ? runInTransaction(fn, this.transactionOptions) : fn();
            });
        }
    }
}
