import { ensuredFirst } from '@/manager/EnsuredStore';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { QuerySpecification } from '@/query/QuerySpecification';

const ENSURING = 'CREATE TABLE IF NOT EXISTS store_node (nid bigint)';

/**
 * A persistence manager of a database no provider is registered under, so the store is made through it: it records
 * each statement it runs, and turns away the ensuring statement as many times as `failures` says.
 */
function recording(database: string, failures: number = 0): { pm: PersistenceManager; ran: string[] } {
    const ran: string[] = [];
    let refusals = failures;
    const run = async (spec: QuerySpecification<any>): Promise<any[]> => {
        ran.push(spec.statement.text);
        return spec.statement.text === ENSURING && refusals-- > 0
            ? Promise.reject(new Error('the store could not be made'))
            : [];
    };
    const pm = {
        database,
        query: run,
        execute: async (spec: QuerySpecification<void>) => {
            await run(spec);
        }
    } as unknown as PersistenceManager;
    return { pm, ran };
}

describe('ensuredFirst', () => {
    it('should make the store once, before the first statement, however many managers ask at once', async () => {
        const { pm, ran }: { pm: PersistenceManager; ran: string[] } = recording('ensured-once');
        const first = ensuredFirst(pm, ENSURING);
        const second = ensuredFirst(pm, ENSURING);
        await Promise.all([
            first.query(new QuerySpecification('SELECT 1')),
            second.query(new QuerySpecification('SELECT 2')),
            first.execute(new QuerySpecification('SELECT 3'))
        ]);
        expect(ran[0]).toEqual(ENSURING);
        expect(ran.filter((it) => it === ENSURING)).toHaveLength(1);
        expect(ran.slice(1).sort()).toEqual(['SELECT 1', 'SELECT 2', 'SELECT 3']);
    });

    it('should make the store again at the next statement when making it failed', async () => {
        const { pm, ran }: { pm: PersistenceManager; ran: string[] } = recording('ensured-retry', 1);
        const ensured = ensuredFirst(pm, ENSURING);
        await expect(ensured.query(new QuerySpecification('SELECT 1'))).rejects.toThrow('could not be made');
        await ensured.query(new QuerySpecification('SELECT 2'));
        expect(ran).toEqual([ENSURING, ENSURING, 'SELECT 2']);
    });

    it('should pass what runs no statement straight through', () => {
        const { pm, ran }: { pm: PersistenceManager; ran: string[] } = recording('ensured-through');
        expect(ensuredFirst(pm, ENSURING).database).toEqual('ensured-through');
        expect(ran).toEqual([]);
    });
});
