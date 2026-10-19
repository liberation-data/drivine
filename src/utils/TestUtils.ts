import { DrivineContext, inDrivineContext } from '@/context/DrivineContext';
import { TransactionOptions } from '@/transaction/Transactional';

/** Marks, across test files run in one process, that the hooks are installed. */
const installed = globalThis as typeof globalThis & { $$runWithDrivine$$?: boolean };
/** The test framework's globals, which RunWithDrivine wraps. */
const framework = globalThis as unknown as Record<string, any>;

export const RunWithDrivine = (options?: TransactionOptions): void => {
    if (!installed.$$runWithDrivine$$) {
        const drivineContext = inDrivineContext();
        drivineContext.withTransaction(options);

        hookLifecycleMethods(drivineContext);
        hookTestMethods(drivineContext);

        installed.$$runWithDrivine$$ = true;
    }
};

function hookLifecycleMethods(drivineContext: DrivineContext): void {
    const lifecycleMethodsToOverride = ['beforeAll', 'beforeEach', 'afterAll', 'afterEach'];
    lifecycleMethodsToOverride.forEach((methodName) => {
        const original = framework[methodName];
        framework[methodName] = (fn?: any, timeout?: number) => {
            original(async () => drivineContext.run(fn), timeout);
        };
    });
}

function hookTestMethods(drivineContext: DrivineContext): void {
    const testMethodsToOverride = ['it', 'test'];
    testMethodsToOverride.forEach((methodName) => {
        const original = framework[methodName];
        framework[methodName] = (name: string, fn?: any, timeout?: number) => {
            original(name, async () => drivineContext.run(fn), timeout);
        };
    });
}
