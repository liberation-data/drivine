import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { Propagation } from '@/transaction/Propagation';
import { DrivineError } from '@/DrivineError';
import { Transaction } from '@/transaction/Transaction';

export interface TransactionOptions {
    rollback?: boolean;
    propagation?: Propagation;
}

export function Transactional(options?: TransactionOptions): MethodDecorator {
    return (target: any, methodName: string | symbol, descriptor: TypedPropertyDescriptor<any>) => {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args: any[]) {
            if (TransactionContextHolder.getInstance().drivineContext) {
                return runInTransaction(originalMethod.bind(this), options, args);
            } else {
                return originalMethod.bind(this)(...args);
            }
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

    try {
        await transaction.pushContext(fn.name || `[anonymous function]`);
        const result = await fn(...args);
        await transaction.popContext();
        return result;
    } catch (e) {
        await transaction.popContextWithError(e as Error);
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
