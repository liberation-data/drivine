import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';

export const inDrivineContext = async (fn: () => void | Promise<void>): Promise<void> => {
    return TransactionContextHolder.getInstance().runPromise(async () => {
        TransactionContextHolder.getInstance().databaseRegistry = DatabaseRegistry.getInstance();
        await fn();
    });
};
