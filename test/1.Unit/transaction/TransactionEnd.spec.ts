import { Connection } from '@/connection/Connection';
import { Transaction } from '@/transaction/Transaction';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { runInTransaction } from '@/transaction/Transactional';

/** A connection that records what is asked of it, and fails what `failing` names. */
function connection(name: string, calls: string[], failing: string[] = []): Connection {
    const step = (what: string) => async (): Promise<void> => {
        calls.push(`${name}.${what}`);
        return failing.includes(what) ? Promise.reject(new Error(`${name} ${what} failed`)) : Promise.resolve();
    };
    return {
        sessionId: () => name,
        query: async () => Promise.resolve([]),
        openCursor: async () => Promise.reject(new Error('no cursors')),
        startTransaction: step('start'),
        commitTransaction: step('commit'),
        rollbackTransaction: step('rollback'),
        release: step('release')
    };
}

/** A transaction in `holder`'s context over `connections`, which runInTransaction then runs in as its root. */
function transaction(
    holder: TransactionContextHolder,
    connections: Connection[],
    rollback: boolean = false
): Transaction {
    const it = new Transaction({ rollback } as any, holder);
    connections.forEach((c) => it.connectionRegistry.set(c.sessionId(), c));
    return it;
}

// A transaction ends with every connection released, and the error that ended it thrown (liberation-data/drivine#561).
describe('A transaction ending', () => {
    let holder: TransactionContextHolder;

    beforeEach(() => {
        holder = TransactionContextHolder.getInstance();
    });

    it('that failed, with a connection whose rollback fails, rolls back the others, releases each, and throws its own error', async () => {
        await holder.runPromise(async () => {
            const calls: string[] = [];
            const cause = new Error('the statement failed');
            const tx = transaction(holder, [connection('a', calls, ['rollback']), connection('b', calls)]);
            const thrown = await runInTransaction(async () => Promise.reject(cause)).catch((e) => e);
            expect(thrown).toBe(cause);
            expect(calls.filter((it) => it.endsWith('rollback')).sort()).toEqual(['a.rollback', 'b.rollback']);
            expect(calls.filter((it) => it.endsWith('release')).sort()).toEqual(['a.release', 'b.release']);
            expect(holder.currentTransaction).toBeUndefined();
            expect(tx.callStack.isEmpty()).toBe(true);
        });
    });

    it('whose second commit fails rolls back only the connection that did not commit, and releases each once', async () => {
        await holder.runPromise(async () => {
            const calls: string[] = [];
            transaction(holder, [connection('a', calls), connection('b', calls, ['commit'])]);
            const thrown = await runInTransaction(async () => Promise.resolve('done')).catch((e) => e);
            expect((thrown as Error).message).toEqual('b commit failed');
            expect(calls).not.toContain('a.rollback');
            expect(calls).toContain('b.rollback');
            expect(calls.filter((it) => it.endsWith('release')).sort()).toEqual(['a.release', 'b.release']);
            expect(holder.currentTransaction).toBeUndefined();
        });
    });

    it('marked to roll back, whose rollback fails, rolls back no connection twice and releases each once', async () => {
        await holder.runPromise(async () => {
            const calls: string[] = [];
            transaction(holder, [connection('a', calls, ['rollback']), connection('b', calls)], true);
            const thrown = await runInTransaction(async () => Promise.resolve('done')).catch((e) => e);
            expect((thrown as Error).message).toEqual('a rollback failed');
            expect(calls.filter((it) => it === 'b.rollback')).toHaveLength(1);
            expect(calls.filter((it) => it.endsWith('release')).sort()).toEqual(['a.release', 'b.release']);
            expect(holder.currentTransaction).toBeUndefined();
        });
    });

    it('that committed, with a connection whose release fails, releases the others and ends the transaction', async () => {
        await holder.runPromise(async () => {
            const calls: string[] = [];
            transaction(holder, [connection('a', calls, ['release']), connection('b', calls)]);
            await expect(runInTransaction(async () => Promise.resolve('done'))).resolves.toEqual('done');
            expect(calls.filter((it) => it.endsWith('commit')).sort()).toEqual(['a.commit', 'b.commit']);
            expect(calls.filter((it) => it.endsWith('release')).sort()).toEqual(['a.release', 'b.release']);
            expect(calls.filter((it) => it.endsWith('rollback'))).toEqual([]);
            expect(holder.currentTransaction).toBeUndefined();
        });
    });
});
