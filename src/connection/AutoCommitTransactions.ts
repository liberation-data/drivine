import { TransactionMode } from '@/connection/TransactionMode';
import { DrivineError } from '@/DrivineError';
import { DrivineLogger } from '@/logger';

/**
 * Transaction handling for a connection to an engine that commits each statement as it runs. A connection delegates
 * its startTransaction, commitTransaction and rollbackTransaction here.
 */
export class AutoCommitTransactions {
    private readonly logger: DrivineLogger;

    constructor(
        readonly engine: string,
        readonly mode: TransactionMode = TransactionMode.WARN
    ) {
        this.logger = new DrivineLogger(`${engine}Connection`);
    }

    start(): void {
        if (this.mode === TransactionMode.STRICT) {
            throw new DrivineError(
                `${this.engine} does not support multi-statement transactions. Remove @Transactional, or set ` +
                    `transactionMode to WARN to allow each statement to commit as it runs.`
            );
        }
        this.logger.debug(
            `${this.engine} transaction started (passthrough: each statement commits as it runs, no atomicity).`
        );
    }

    commit(): void {
        this.logger.debug(`${this.engine} transaction committed (passthrough: writes already committed).`);
    }

    /**
     * Never throws, in either mode: it is called on the error path, and must not hide the error that caused it.
     */
    rollback(): void {
        this.logger.warn(
            `${this.engine} rollback requested, but each statement was committed as it ran. Nothing was rolled back.`
        );
    }
}
