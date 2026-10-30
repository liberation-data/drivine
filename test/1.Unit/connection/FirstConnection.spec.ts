import { FirstConnection } from '@/connection/FirstConnection';
import { OracleGraph } from '@/backend/oracle';

/** A SQL store's graph is made once per provider, on its first connection (liberation-data/drivine#343). */
describe('FirstConnection', () => {
    it('should run the block once, on the first connection, however many connections ask together', async () => {
        const first = new FirstConnection();
        const ran: string[] = [];
        let finish!: () => void;
        const ensure = async (connection: string): Promise<void> => {
            ran.push(connection);
            return new Promise<void>((resolve) => (finish = resolve));
        };
        const close = jest.fn();
        const waiting = Promise.all(['a', 'b', 'c'].map(async (it) => first.ensured(it, ensure, close)));
        await Promise.resolve();
        finish();
        expect(await waiting).toEqual(['a', 'b', 'c']);
        expect(await first.ensured('d', ensure, close)).toEqual('d');
        expect(ran).toEqual(['a']);
        expect(close).not.toHaveBeenCalled();
    });

    it('should close each connection that waited on a block that failed, and run it again on the next', async () => {
        const first = new FirstConnection();
        const failure = new Error('permission denied for schema public');
        const ensure = jest.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
        const closed: [string, Error][] = [];
        const close = (connection: string, error: Error): void => {
            closed.push([connection, error]);
        };
        const results = await Promise.allSettled(['a', 'b'].map(async (it) => first.ensured(it, ensure, close)));
        expect(results.map((it) => it.status)).toEqual(['rejected', 'rejected']);
        expect(closed).toEqual([
            ['a', failure],
            ['b', failure]
        ]);
        expect(await first.ensured('c', ensure, close)).toEqual('c');
        expect(ensure.mock.calls.map((it) => it[0])).toEqual(['a', 'c']);
    });

    it("should hand out every connection that waited while Oracle's block ran again after a deadlock", async () => {
        const first = new FirstConnection();
        const ran: string[] = [];
        const deadlock = 'ORA-04020: deadlock detected while trying to lock object DRIVINE.FC_RACE_X_NODE';
        const connection = (name: string): { name: string; execute: () => Promise<void> } => ({
            name,
            execute: async () => {
                ran.push(name);
                return ran.length === 1 ? Promise.reject(new Error(deadlock)) : Promise.resolve();
            }
        });
        const close = jest.fn();
        const graph = new OracleGraph('fc_race_x');
        const handed = await Promise.all(
            ['a', 'b', 'c'].map(async (it) => first.ensured(connection(it), async (c) => graph.ensure(c), close))
        );
        expect(handed.map((it) => it.name)).toEqual(['a', 'b', 'c']);
        expect(ran).toEqual(['a', 'a']);
        expect(close).not.toHaveBeenCalled();
    });
});
