import { Connection } from '@/connection/Connection';
import { DrivineContext } from '@/context/DrivineContext';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { runInTransaction } from '@/transaction/Transactional';

/** A provider of connections, each named in turn, that log what is asked of them to `log`. */
function provider(log: string[]): { connect: () => Promise<Connection> } {
    let made = 0;
    return {
        connect: async (): Promise<Connection> => {
            const name = `c${++made}`;
            const step = (what: string) => async (): Promise<void> => {
                log.push(`${name}.${what}`);
                return Promise.resolve();
            };
            return Promise.resolve({
                sessionId: () => name,
                query: async () => {
                    log.push(`${name}.query`);
                    return Promise.resolve([]);
                },
                openCursor: async () => Promise.reject(new Error('no cursors')),
                startTransaction: step('start'),
                commitTransaction: step('commit'),
                rollbackTransaction: step('rollback'),
                release: step('release')
            });
        }
    };
}

const pause = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `fn` in a Drivine context of its own over connections that log to `log`. */
async function inContext<T>(log: string[], fn: (holder: TransactionContextHolder) => Promise<T>): Promise<T> {
    const holder = TransactionContextHolder.getInstance();
    const connections = provider(log);
    const registry = { connectionProvider: () => connections } as unknown as DatabaseRegistry;
    return new DrivineContext(holder, registry).run(async () => fn(holder));
}

// Transactional calls run side by side in one context each have a transaction of their own (liberation-data/drivine#707).
describe('Transactional calls in one Drivine context', () => {
    it('run side by side each have a transaction of their own: the first to end commits only its own writes', async () => {
        const log: string[] = [];
        const failure = new Error('the second call failed');
        const outcome = await inContext(log, async (holder) =>
            Promise.allSettled([
                runInTransaction(async () => {
                    await holder.currentTransaction!.query({} as any, 'default');
                    log.push('first wrote');
                }),
                runInTransaction(async () => {
                    await holder.currentTransaction!.query({} as any, 'default');
                    log.push('second wrote');
                    await pause(20);
                    log.push(`second sees a transaction: ${holder.currentTransaction !== undefined}`);
                    return Promise.reject(failure);
                })
            ])
        );
        expect(outcome[1]).toEqual({ status: 'rejected', reason: failure });
        expect(log).toContain('second sees a transaction: true');
        // Two connections, one each: the first commits its own, and the second's is rolled back, not committed.
        expect(log.filter((it) => it.endsWith('.start')).sort()).toEqual(['c1.start', 'c2.start']);
        expect(log.filter((it) => it.endsWith('.commit'))).toHaveLength(1);
        expect(log.filter((it) => it.endsWith('.rollback'))).toHaveLength(1);
        const committed = log.find((it) => it.endsWith('.commit'))!.split('.')[0];
        expect(log.find((it) => it.endsWith('.rollback'))!.split('.')[0]).not.toEqual(committed);
        expect(log.filter((it) => it.endsWith('.release'))).toHaveLength(2);
    });

    it('called by a transactional call join its transaction, and are committed with it', async () => {
        const log: string[] = [];
        await inContext(log, async (holder) =>
            runInTransaction(async () => {
                const outer = holder.currentTransaction;
                await holder.currentTransaction!.query({} as any, 'default');
                await runInTransaction(async () => {
                    expect(holder.currentTransaction).toBe(outer);
                    await holder.currentTransaction!.query({} as any, 'default');
                });
                // Two run side by side inside it join it too.
                await Promise.all([
                    runInTransaction(async () => {
                        expect(holder.currentTransaction).toBe(outer);
                        return Promise.resolve();
                    }),
                    runInTransaction(async () => {
                        expect(holder.currentTransaction).toBe(outer);
                        return Promise.resolve();
                    })
                ]);
            })
        );
        expect(log).toEqual(['c1.start', 'c1.query', 'c1.query', 'c1.commit', 'c1.release']);
    });

    it('called by one that then fails are rolled back with it, and the context has no transaction after', async () => {
        const log: string[] = [];
        const failure = new Error('outer failed');
        await inContext(log, async (holder) => {
            await expect(
                runInTransaction(async () => {
                    await runInTransaction(async () => holder.currentTransaction!.query({} as any, 'default'));
                    return Promise.reject(failure);
                })
            ).rejects.toBe(failure);
            expect(holder.currentTransaction).toBeUndefined();
        });
        expect(log).toEqual(['c1.start', 'c1.query', 'c1.rollback', 'c1.release']);
    });

    it('made outside any Drivine context still fail, as they did before calls ran in a copy of it', async () => {
        await expect(runInTransaction(async () => Promise.resolve('done'))).rejects.toThrow(/outside "run" method/);
    });
});
