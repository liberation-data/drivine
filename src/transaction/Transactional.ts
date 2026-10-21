import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { Propagation } from '@/transaction/Propagation';
import { DrivineError } from '@/DrivineError';
import { Transaction } from '@/transaction/Transaction';
import { inDrivineContext } from '@/context/DrivineContext';

export interface TransactionOptions {
    rollback?: boolean;
    propagation?: Propagation;
}

/**
 * Runs the method in a transaction: the caller's, or a new one. Outside a Drivine context (Nest's middleware opens one
 * per request) it opens one, so a job, a CLI command or a test is transactional too.
 */
export function Transactional(options?: TransactionOptions): MethodDecorator {
    return (target: any, methodName: string | symbol, descriptor: TypedPropertyDescriptor<any>) => {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args: any[]) {
            if (TransactionContextHolder.getInstance().drivineContext) {
                return runInTransaction(originalMethod.bind(this), options, args);
            }
            return inDrivineContext()
                .withTransaction(options)
                .run(() => originalMethod.apply(this, args));
        };
    };
}

export type AsyncFunction = (...args: any[]) => Promise<any>;

export async function runInTransaction(
    fn: AsyncFunction,
    transactionOptions?: TransactionOptions,
    args: any[] = []
): Promise<any> {
    const options = optionsWithDefaults(transactionOptions);
    const contextHolder = TransactionContextHolder.getInstance();
    const transaction = contextHolder.currentTransaction || new Transaction(options, contextHolder);
    const isRoot = transaction.callStack.isEmpty();
    try {
        await transaction.pushContext(fn.name || `[anonymous function]`);
        const result = await fn(...args);
        await transaction.popContext(isRoot);
        return result;
    } catch (e) {
        await transaction.popContextWithError(e as Error, isRoot);
        throw e;
    }
}

/**
 * Replaces null values on transaction options with defaults.
 * @param options
 */
export function optionsWithDefaults(options: TransactionOptions | undefined): TransactionOptions {
    if (options && options.propagation && options.propagation !== Propagation.REQUIRED) {
        throw new DrivineError(`Only REQUIRED level of propagation is currently supported`);
    }

    return <TransactionOptions>{
        rollback: (options && options.rollback) || false,
        propagation: options && options.propagation && options.propagation
    };
}
