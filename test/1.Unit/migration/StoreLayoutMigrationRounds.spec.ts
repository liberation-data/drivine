import { StoreLayoutMigration } from '@/migration/StoreLayoutMigration';

/**
 * The rounds the shared module asks for, run on connections of the provider's own: the lock taken once, on a connection
 * of its own, in a transaction held open to the end and then rolled back and given back; each transaction committed, or
 * rolled back where a statement fails; a round stopped at the first action that fails, whose message the module is
 * given (liberation-data/drivine#765).
 */
describe('StoreLayoutMigration rounds', () => {
    const setUp = (failing?: string): { migration: StoreLayoutMigration; calls: string[]; asked: any[] } => {
        const calls: string[] = [];
        let opened = 0;
        const connection = (name: string) => ({
            query: jest.fn(async (spec: any) => {
                calls.push(`${name}: ${spec.statement.text}`);
                return spec.statement.text === failing
                    ? Promise.reject(new Error(`${failing} failed`))
                    : Promise.resolve([]);
            }),
            startTransaction: jest.fn(async () => Promise.resolve(void calls.push(`${name}: begin`))),
            commitTransaction: jest.fn(async () => Promise.resolve(void calls.push(`${name}: commit`))),
            rollbackTransaction: jest.fn(async () => Promise.resolve(void calls.push(`${name}: rollback`))),
            release: jest.fn(async () => Promise.resolve(void calls.push(`${name}: release`)))
        });
        const provider = {
            type: 'POSTGRES',
            graphName: 'drivine',
            connectUnjudged: jest.fn(async () => Promise.resolve(connection(opened++ === 0 ? 'work' : 'lock') as any)),
            prepareUnjudged: jest.fn()
        };
        const migration = new StoreLayoutMigration(provider);
        const asked: any[] = [];
        const done = { status: 'migrated', message: 'done', notes: [] };
        const answers: any[] = [
            {
                run: [
                    { type: 'lock', statement: 'LOCK' },
                    {
                        type: 'transaction',
                        statements: [
                            { statement: 'W1', parameters: {} },
                            { statement: 'W2', parameters: {} }
                        ]
                    },
                    { type: 'execute', statement: 'X', parameters: {}, purpose: 'x' }
                ],
                state: 'one'
            },
            {
                run: [
                    { type: 'lock', statement: 'LOCK' },
                    { type: 'query', statement: 'Q', parameters: {}, purpose: 'q' }
                ],
                state: 'two'
            },
            { done }
        ];
        jest.spyOn(migration as any, 'ask').mockImplementation((request: any) => {
            asked.push(request);
            return answers.shift();
        });
        return { migration, calls, asked };
    };

    it('should take the lock once on a connection of its own, commit each transaction, and give both connections back', async () => {
        const { migration, calls, asked }: ReturnType<typeof setUp> = setUp();
        await expect(migration.migrate([], { unproven: true })).resolves.toMatchObject({ status: 'migrated' });
        expect(calls).toEqual([
            'lock: begin',
            'lock: LOCK',
            'work: begin',
            'work: W1',
            'work: W2',
            'work: commit',
            'work: X',
            'work: Q',
            'lock: rollback',
            'lock: release',
            'work: release'
        ]);
        expect(asked[1].outcomes).toEqual([{ type: 'ran' }, { type: 'ran' }, { type: 'ran' }]);
        expect(asked[2].outcomes).toEqual([{ type: 'ran' }, { type: 'rows', rows: [] }]);
    });

    it("should roll back a transaction whose statement fails, stop the round there, and give the module the store's message", async () => {
        const { migration, calls, asked }: ReturnType<typeof setUp> = setUp('W1');
        await migration.migrate([], { unproven: true });
        expect(calls.slice(2, 5)).toEqual(['work: begin', 'work: W1', 'work: rollback']);
        expect(calls).not.toContain('work: X');
        expect(asked[1].outcomes).toEqual([{ type: 'ran' }, { type: 'failed', message: 'W1 failed' }]);
        expect(calls.slice(-3)).toEqual(['lock: rollback', 'lock: release', 'work: release']);
    });

    it('should give the lock back where its statement fails', async () => {
        const { migration, calls, asked }: ReturnType<typeof setUp> = setUp('LOCK');
        await migration.migrate([], { unproven: true });
        expect(asked[1].outcomes).toEqual([{ type: 'failed', message: 'LOCK failed' }]);
        expect(calls).not.toContain('work: begin');
        expect(calls.slice(-3)).toEqual(['lock: rollback', 'lock: release', 'work: release']);
    });
});
