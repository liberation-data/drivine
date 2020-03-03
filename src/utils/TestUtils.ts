import { inDrivineContext } from '@/context/DrivineContext';
import { TransactionOptions } from '@/transaction/Transactional';

export interface DrivineRunnerOptions {
    transaction?: TransactionOptions;
}

export const RunWithDrivine = (options?: DrivineRunnerOptions): void => {
    if (!global['$$runWithDrivine$$']) {
        const testMethodsToOverride = ['it', 'test'];
        const lifecycleMethodsToOverride = ['beforeAll', 'beforeEach', 'afterAll', 'afterEach'];

        const drivineContext = inDrivineContext();
        if (options && options.transaction) {
            drivineContext.withTransaction(options.transaction);
        }

        [...testMethodsToOverride, ...lifecycleMethodsToOverride].forEach(methodName => {
            const original = global[methodName];
            global[methodName] = (name: string, fn?: any, timeout?: number) => {
                original(name, async () => drivineContext.run(fn), timeout);
            };
        });
        global['$$runWithDrivine$$'] = true;
    }
};
