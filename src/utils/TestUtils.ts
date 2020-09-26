import { DrivineContext, inDrivineContext } from '@/context/DrivineContext';
import { TransactionOptions } from '@/transaction/Transactional';

export const RunWithDrivine = (options?: TransactionOptions): void => {
    if (!global['$$runWithDrivine$$']) {
        const drivineContext = inDrivineContext();
        if (options) {
            drivineContext.withTransaction(options);
        }
        hookLifecycleMethods(drivineContext);
        hookTestMethods(drivineContext);

        global['$$runWithDrivine$$'] = true;
    }
};

function hookLifecycleMethods(drivineContext: DrivineContext): void {
    const lifecycleMethodsToOverride = ['beforeAll', 'beforeEach', 'afterAll', 'afterEach'];
    lifecycleMethodsToOverride.forEach((methodName) => {
        const original = global[methodName];
        global[methodName] = (fn?: any, timeout?: number) => {
            original(async () => drivineContext.run(fn), timeout);
        };
    });
}

function hookTestMethods(drivineContext: DrivineContext): void {
    const testMethodsToOverride = ['it', 'test'];
    testMethodsToOverride.forEach((methodName) => {
        const original = global[methodName];
        global[methodName] = (name: string, fn?: any, timeout?: number) => {
            original(name, async () => drivineContext.run(fn), timeout);
        };
    });
}
