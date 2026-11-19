import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    backendFor,
    count,
    DatabaseRegistry,
    DatabaseType,
    key,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    StatelessGraphObjectManager,
    TransactionContextHolder
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['RawFlagged'] })
class Flagged {
    @NodeId() id: string;
    flag: boolean;
    note?: string;
}

const WHERE = 'n.flag = $flag';

/**
 * A raw where in Cypher's shorthand that compares a property with a parameter bound to a boolean, run on SQLite, which
 * Node bundles, so no container (#802, drivine-python#542). The shorthand reads a property as text, `'true'` for a JSON
 * true, and SQLite's driver binds a boolean as 1, so `n.flag = $flag` found nothing in a load, a count, a delete or a
 * grouped read. It is compared with the boolean's text, as `n.flag = true` is; and a patch writes a boolean into its
 * statement as the driver binds it, so SQL over `n.props` meets the node in a patch as in a load.
 */
describe('a raw where comparing a property with a bound boolean, run on SQLite', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-raw-booleans-'));
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(() => {
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ databaseType: DatabaseType.SQLITE, host: '', databaseName: path.join(folder, 'g.db') })
            .register('raw-booleans');
        pm = new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
            'raw-booleans',
            'NON_TRANSACTIONAL'
        );
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.SQLITE), new ModelRegistry());
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('DELETE FROM drivine_node'));
        await gom.saveAll([
            Object.assign(new Flagged(), { id: 'b1', flag: true }),
            Object.assign(new Flagged(), { id: 'b2', flag: false })
        ]);
    });

    afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

    const ids = async (where: string, bindings: Record<string, any>): Promise<string[]> =>
        (await gom.loadAll(Flagged, where, bindings)).map((it) => it.id).sort();

    it('should find the nodes that hold the bound boolean in a load and a count', async () => {
        expect(await ids(WHERE, { flag: true })).toEqual(['b1']);
        expect(await ids('n.flag <> $flag', { flag: true })).toEqual(['b2']);
        expect(await ids('n.flag != $flag', { flag: false })).toEqual(['b1']);
        expect(await gom.count(Flagged, WHERE, { flag: false })).toBe(1);
        // SQL over the row reads the boolean as the driver binds it, 1.
        expect(await ids("(n.props ->> '$.flag') = $flag", { flag: true })).toEqual(['b1']);
    });

    it("should meet the node that holds it in a patch, and not one that doesn't", async () => {
        const patched = async (where: string, flag: boolean, note: string): Promise<boolean> =>
            (await gom.patch(Flagged, 'b1', { set: { note }, where, bindings: { flag } })).applied;
        expect(await patched(WHERE, true, 'met')).toBe(true);
        expect(await patched(WHERE, false, 'missed')).toBe(false);
        // SQL over the row reads the boolean in a patch as in a load.
        expect(await patched("(n.props ->> '$.flag') = $flag", true, 'met again')).toBe(true);
        expect(await patched("(n.props ->> '$.flag') = $flag", false, 'missed again')).toBe(false);
        expect((await gom.load(Flagged, 'b1'))?.note).toEqual('met again');
    });

    it("should read it so in a grouped read's where and aggregate filter", async () => {
        expect(
            await gom.groups.load(Flagged, { keys: { id: key('id') }, where: WHERE, bindings: { flag: true } })
        ).toEqual([{ id: 'b1' }]);
        const counted = await gom.groups.load(Flagged, {
            keys: { id: key('id') },
            aggregates: { flagged: count(WHERE) },
            bindings: { flag: true },
            orderBy: [['id', 'asc']]
        });
        expect(counted).toEqual([
            { id: 'b1', flagged: 1 },
            { id: 'b2', flagged: 0 }
        ]);
    });

    it('should take the nodes that hold it in a delete', async () => {
        expect(await gom.deleteAll(Flagged, WHERE, { flag: false })).toBe(1);
        expect((await gom.loadAll(Flagged)).map((it) => it.id)).toEqual(['b1']);
    });
});
