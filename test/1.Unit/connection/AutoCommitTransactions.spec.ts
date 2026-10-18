import { AutoCommitTransactions, TransactionMode } from '@/connection';
import { DrivineError } from '@/DrivineError';

describe('AutoCommitTransactions', () => {
    it('should default to WARN', () => {
        expect(new AutoCommitTransactions('FalkorDB').mode).toEqual(TransactionMode.WARN);
    });

    describe('in WARN mode', () => {
        const transactions = new AutoCommitTransactions('FalkorDB', TransactionMode.WARN);

        it('should start, commit and roll back without throwing', () => {
            expect(() => transactions.start()).not.toThrow();
            expect(() => transactions.commit()).not.toThrow();
            expect(() => transactions.rollback()).not.toThrow();
        });
    });

    describe('in STRICT mode', () => {
        const transactions = new AutoCommitTransactions('FalkorDB', TransactionMode.STRICT);

        it('should refuse to start a transaction', () => {
            expect(() => transactions.start()).toThrow(DrivineError);
            expect(() => transactions.start()).toThrow(/FalkorDB does not support multi-statement transactions/);
        });

        it('should not throw on rollback, so the error that caused it is not hidden', () => {
            expect(() => transactions.rollback()).not.toThrow();
        });
    });
});
