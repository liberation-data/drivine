import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { TransactionContextKeys } from '@/transaction/TransactionContextKeys';
import { Propagation } from '@/transaction/Propagation';
import { DrivineError } from '@/DrivineError';
import { Transaction } from '@/transaction/Transaction';

export interface TransactionOptions {
    rollback?: boolean;
    propagation?: Propagation;
}

export function Transactional(transactionOptions?: TransactionOptions): MethodDecorator {
    return (target: any, methodName: string | symbol, descriptor: TypedPropertyDescriptor<any>) => {
        const localStorage = TransactionContextHolder.instance;
        const options = optionsWithDefaults(transactionOptions);
        const originalMethod = descriptor.value;
        descriptor.value = async function(...args: any[]) {
            const connectionProvider = localStorage.get(TransactionContextKeys.CONNECTION_PROVIDER);
            const transaction =
                localStorage.get(TransactionContextKeys.TRANSACTION) ||
                new Transaction(connectionProvider, options.rollback!, localStorage);

            try {
                await transaction.pushContext(methodName);
                const result = await originalMethod.apply(this, [...args]);
                await transaction.popContext();
                return result;
            } catch (e) {
                await transaction.popContextWithError(e);
                throw e;
            }
        };
    };
}

/**
 * Replaces null values on transaction options with defaults.
 * @param options
 */
function optionsWithDefaults(options: TransactionOptions | undefined): TransactionOptions {
    if (options && options.propagation && options.propagation !== Propagation.REQUIRED) {
        throw new DrivineError(`Only REQUIRED level of propagation is currently supported`);
    }

    return <TransactionOptions>{
        rollback: (options && options.rollback) || false,
        propagation: options && options.propagation && options.propagation
    };
}
