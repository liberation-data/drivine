import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { optionsWithDefaults, runInTransaction, TransactionOptions } from '@/transaction/Transactional';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';

export function inDrivineContext(): DrivineContext {
    return new DrivineContext(TransactionContextHolder.getInstance(), DatabaseRegistry.getInstance());
}

export class DrivineContext {
    private transactionOptions?: TransactionOptions;

    constructor(readonly contextHolder: TransactionContextHolder, readonly databaseRegistry: DatabaseRegistry) {}

    withTransaction(options?: TransactionOptions): DrivineContext {
        this.transactionOptions = optionsWithDefaults(options);
        return this;
    }

    async run(fn: () => Promise<any>): Promise<any> {
        if (this.contextHolder.inContext) {
            return this.transactionOptions ? runInTransaction(fn, this.transactionOptions) : fn();
        } else {
            return this.contextHolder.runPromise(async () => {
                this.contextHolder.inContext = true;
                this.contextHolder.databaseRegistry = this.databaseRegistry;
                return this.transactionOptions ? runInTransaction(fn, this.transactionOptions) : fn();
            });
        }
    }
}
