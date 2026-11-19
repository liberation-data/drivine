import {
    backendFor,
    count,
    DatabaseRegistry,
    key,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { SqlSeed, sqlPersistenceManager, sqlStores } from '../support/SqlStores';

// Oracle parses each save's PL/SQL block the first time it sees it, and a suite's first test saves first.
jest.setTimeout(30_000);

@NodeFragment({ labels: ['SqlRawFlagged'] })
class Flagged {
    @NodeId() id: string;
    flag: boolean;
    note?: string;
}

const WHERE = 'n.flag = $flag';

/**
 * A raw where in Cypher's shorthand that compares a property with a parameter bound to a boolean, on each SQL store
 * (#802, drivine-python#542). The shorthand reads a property as text, `'true'` for a JSON true, and a driver binds a
 * boolean as no such text: SQLite's as 1, so `n.flag = $flag` found nothing in a load, a count, a delete, a patch or a
 * grouped read. It is compared with the boolean's text, as `n.flag = true` is. As drivine-python's
 * test_raw_where_booleans; SqliteRawWhereBooleansRun.spec checks SQL of the caller's own over the row on SQLite.
 */
describe.each(sqlStores())('a raw where comparing a property with a bound boolean on $name', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: SqlSeed;

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        seed = new SqlSeed(pm, store, 'SqlRawFlagged');
        await seed.prepare();
    });

    beforeEach(async () => {
        await seed.clear();
        await gom.saveAll([
            Object.assign(new Flagged(), { id: 'b1', flag: true }),
            Object.assign(new Flagged(), { id: 'b2', flag: false })
        ]);
    });

    afterAll(async () => {
        await seed.clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    const ids = async (where: string, bindings: Record<string, any>): Promise<string[]> =>
        (await gom.loadAll(Flagged, where, bindings)).map((it) => it.id).sort();

    it('should find the nodes that hold the bound boolean in a load and a count', async () => {
        expect(await ids(WHERE, { flag: true })).toEqual(['b1']);
        expect(await ids('n.flag <> $flag', { flag: true })).toEqual(['b2']);
        expect(await ids('n.flag != $flag', { flag: false })).toEqual(['b1']);
        expect((await gom.loadAll(Flagged, { where: WHERE, bindings: { flag: false } })).map((it) => it.id)).toEqual([
            'b2'
        ]);
        expect(await gom.count(Flagged, WHERE, { flag: false })).toBe(1);
    });

    it("should meet the node that holds it in a patch, and not one that doesn't", async () => {
        expect(
            (await gom.patch(Flagged, 'b1', { set: { note: 'met' }, where: WHERE, bindings: { flag: true } })).applied
        ).toBe(true);
        expect(
            (await gom.patch(Flagged, 'b1', { set: { note: 'missed' }, where: WHERE, bindings: { flag: false } }))
                .applied
        ).toBe(false);
        expect((await gom.load(Flagged, 'b1'))?.note).toEqual('met');
    });

    it("should read it so in a grouped read's where and aggregate filter", async () => {
        expect(
            await gom.groups.load(Flagged, { keys: { id: key('id') }, where: WHERE, bindings: { flag: true } })
        ).toEqual([{ id: 'b1' }]);
        expect(
            await gom.groups.load(Flagged, {
                keys: { id: key('id') },
                aggregates: { flagged: count(WHERE) },
                bindings: { flag: true },
                orderBy: [['id', 'asc']]
            })
        ).toEqual([
            { id: 'b1', flagged: 1 },
            { id: 'b2', flagged: 0 }
        ]);
    });

    it('should take the nodes that hold it in a delete', async () => {
        expect(await gom.delete(Flagged, 'b1', { where: WHERE, bindings: { flag: false } })).toBe(0);
        expect(await gom.deleteAll(Flagged, WHERE, { flag: false })).toBe(1);
        expect((await gom.loadAll(Flagged)).map((it) => it.id)).toEqual(['b1']);
        expect(await gom.delete(Flagged, 'b1', { where: WHERE, bindings: { flag: true } })).toBe(1);
    });
});
