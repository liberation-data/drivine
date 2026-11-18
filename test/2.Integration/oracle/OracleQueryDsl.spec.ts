import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';
import { OracleSeed } from '../support/OracleSeed';

jest.setTimeout(120_000);

@NodeFragment({ labels: ['OraDsl'] })
class Note {
    @NodeId() id: string;
    title?: string;
    meta?: Record<string, any>;
    tags?: unknown[];
}

/**
 * The query DSL on Oracle as the shared module's fragments (drivine-cypher-spec#235, step 4), run: each statement with
 * the hints its fragments ask for after its first SELECT or DELETE, an equality's index key bound as plain text beside
 * the value (#761), and a comparison that calls the graph's nulls_equal run where the graph was made with it.
 * OracleQueryDsl.spec in the unit tests pins the SQL.
 */
describeOnOracle('the query DSL on Oracle, as the module writes it', () => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(() => {
        pm = oraclePersistenceManager();
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.ORACLE), new ModelRegistry());
    });

    beforeEach(async () => {
        await new OracleSeed(pm, 'OraDsl').clear();
    });

    afterAll(async () => {
        await new OracleSeed(pm, 'OraDsl').clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    const titles = async (fn: (q: any) => any): Promise<string[]> =>
        (await gom.loadAll(Note, fn)).map((it) => it.title!);

    it('compares and orders text by its code points, as Neo4j does: B before a, and é after z', async () => {
        await gom.saveAll(
            ['a', 'B', 'b', 'é', 'z'].map((title) => Object.assign(new Note(), { id: `c-${title}`, title }))
        );
        expect(await titles((q) => ({ orderBy: [q.title.asc()] }))).toEqual(['B', 'a', 'b', 'z', 'é']);
        expect(await titles((q) => ({ orderBy: [q.title.desc()] }))).toEqual(['é', 'z', 'b', 'a', 'B']);
        expect(await titles((q) => ({ where: q.title.gt('B'), orderBy: [q.title.asc()] }))).toEqual([
            'a',
            'b',
            'z',
            'é'
        ]);
        expect(await titles((q) => ({ orderBy: [q.title.asc()], seek: [q.title.after('b')] }))).toEqual(['z', 'é']);
    });

    it("finds a text by its index key up to 4,000 bytes, and by its value past them, a delete and a patch's too", async () => {
        const at = 'x'.repeat(4000);
        const past = 'x'.repeat(4001);
        await gom.saveAll([
            Object.assign(new Note(), { id: 'at', title: at }),
            Object.assign(new Note(), { id: 'past', title: past })
        ]);
        expect((await gom.loadAll(Note, (q) => ({ where: q.title.eq(at) }))).map((it) => it.id)).toEqual(['at']);
        expect((await gom.loadAll(Note, (q) => ({ where: q.title.eq(past) }))).map((it) => it.id)).toEqual(['past']);
        expect(await gom.count(Note, (q: any) => ({ where: q.title.neq(at) }))).toEqual(1);
        expect(
            (await gom.patch(Note, 'at', { set: { tags: ['patched'] }, where: (q: any) => q.title.eq(at) })).applied
        ).toBe(true);
        expect(await gom.deleteAll(Note, (q) => ({ where: q.title.eq(past) }))).toEqual(1);
        expect((await gom.loadAll(Note)).map((it) => it.id)).toEqual(['at']);
    });

    it('runs a comparison that calls the graph’s nulls_equal, and gives what Cypher gives', async () => {
        await gom.saveAll([
            Object.assign(new Note(), { id: 'one', meta: { a: 1 }, tags: [[1, 2]] }),
            Object.assign(new Note(), { id: 'two', meta: { a: 2 }, tags: [[1, 3]] })
        ]);
        // A map or a list that holds a null equals none: Cypher gives null for it.
        expect(await gom.count(Note, (q: any) => ({ where: q.meta.eq({ a: null }) }))).toEqual(0);
        expect(await gom.count(Note, (q: any) => ({ where: q.tags.hasItem([1, null]) }))).toEqual(0);
        expect((await gom.loadAll(Note, (q: any) => ({ where: q.meta.eq({ a: 1 }) }))).map((it) => it.id)).toEqual([
            'one'
        ]);
    });
});
