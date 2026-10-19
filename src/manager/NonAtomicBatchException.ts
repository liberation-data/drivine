import { DrivineError } from '@/DrivineError';

/**
 * A batch of more than one statement was refused before any of it ran, because the engine can't apply it whole (it
 * has no multi-statement transactions) and the connection's TransactionMode is STRICT. Nothing was written.
 */
export class NonAtomicBatchException extends DrivineError {
    constructor(engine: string, statements: number) {
        super(
            `A batch of ${statements} statements can't be applied whole on ${engine}, which has no multi-statement ` +
                `transactions, and transactionMode is STRICT. Nothing was written. Save fewer objects at a time, or ` +
                `set transactionMode to WARN to run the batch statement by statement.`
        );
        this.name = 'NonAtomicBatchException';
    }
}
