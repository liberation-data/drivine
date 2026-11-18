import {
    backendFor,
    CascadeType,
    DatabaseRegistry,
    DatabaseType,
    Direction,
    GraphBackend,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    nodeRef,
    NodeStamp,
    PersistenceManager,
    QuerySpecification,
    RelateMode,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { writeLayout } from '@/cypher/ValueLayout';
import { ClassType } from '@/query/QuerySpecification';
import { SqlSeed, sqlPersistenceManager, sqlStores } from '../support/SqlStores';

// Oracle parses each save's PL/SQL block the first time it sees it, and the plan check writes some thousands of nodes.
jest.setTimeout(120_000);

@NodeFragment({ labels: ['SqlLookup', 'LookupNumber'] })
class LookupNumber {
    @NodeId() id: number;
    name?: string;
}

@NodeFragment({ labels: ['SqlLookup', 'LookupDate'] })
class LookupDate {
    @NodeId() id: Date;
    name?: string;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['SqlLookup', 'LookupText'] })
class LookupText {
    @NodeId() id: string;
    name?: string;
}

/** A node of LookupText's labels whose id is a number: what a text id must not find by the same text. */
@NodeFragment({ labels: ['SqlLookup', 'LookupText'] })
class LookupTextNumber {
    @NodeId() id: number;
    name?: string;
}

@NodeFragment({ labels: ['SqlLookup', 'LookupTarget'] })
class LookupTarget {
    @NodeId() id: string;
    name?: string;
}

/** A `$`-named @NodeId, which the store layout holds under `$$code`. */
@NodeFragment({ labels: ['SqlLookup', 'LookupPriced'] })
class LookupPriced {
    @NodeId() $code: string;
    name?: string;
}

/** The target joined to days, which a save that replaces the list unlinks by their ids. */
@GraphView()
class LookupTargetDays {
    @Root() target: LookupTarget;
    @GraphRelationship({ type: 'ON_DAY', target: () => LookupDate }) days: LookupDate[] = [];
}

/** Days, each with the days that are part of it, one level deep: a cascade delete refuses a tree deeper than that. */
@GraphView()
class LookupDateTree {
    @Root() day: LookupDate;
    @GraphRelationship({
        type: 'DAY_PART_OF',
        direction: Direction.INCOMING,
        target: () => LookupDateTree,
        maxDepth: 1
    })
    parts: LookupDateTree[] = [];
}

const make = <T extends object>(type: new () => T, fields: Partial<T>): T => Object.assign(new type(), fields);
const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/**
 * A node found by its id on a SQL store, under the store layout 2 (liberation-data/drivine-cypher-spec#245), a port of
 * drivine4j's NodeIdLookupCrossEngineTest: a save, a load, a delete by id, loadRelated, a relate and a patch compare the id
 * as the store's index is made over it, the property's JSON on Postgres and its class and key on Oracle and SQLite. So a
 * temporal id, held as its tag, is found: a Date id saved twice is one node. An id given as text is read as the @NodeId
 * field's type first; text that is no value of it finds nothing, and a string id is the text given.
 */
describe.each(sqlStores())('a lookup by id on $name', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let backend: GraphBackend;
    let seed: SqlSeed;
    const target = nodeRef(LookupTarget, 'x');

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        backend = backendFor(store.type);
        gom = new StatelessGraphObjectManager(pm, backend, new ModelRegistry());
        seed = new SqlSeed(pm, store, 'SqlLookup');
        await seed.prepare();
    });

    beforeEach(async () => {
        await seed.clear();
        await gom.save(make(LookupTarget, { id: 'x', name: 'the target' }));
    });

    afterAll(async () => {
        await seed.clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    /** The names of the nodes of `type`'s labels, in order. */
    const names = async (type: ClassType): Promise<string[]> =>
        ((await gom.loadAll(type)) as any[]).map((it) => it.name).sort();

    // ----- A temporal id -----

    it("should make one node of a Date id saved twice, and load it by the id's text", async () => {
        await gom.save(make(LookupDate, { id: day('2024-01-02'), name: 'first' }));
        await gom.save(make(LookupDate, { id: day('2024-01-02'), name: 'second' }));
        expect(await names(LookupDate)).toEqual(['second']);
        expect((await gom.load(LookupDate, '2024-01-02T00:00:00.000Z'))?.name).toEqual('second');
        expect((await gom.load(LookupDate, '2024-01-02'))?.name).toEqual('second');
    });

    it('should make one node of a Date id saved twice in one saveAll', async () => {
        await gom.saveAll([
            make(LookupDate, { id: day('2024-01-03'), name: 'batch first' }),
            make(LookupDate, { id: day('2024-01-03'), name: 'batch second' })
        ]);
        expect(await names(LookupDate)).toEqual(['batch second']);
        // A datetime loads as its text, as a load reads every datetime.
        expect(new Date((await gom.load(LookupDate, '2024-01-03'))!.id)).toEqual(day('2024-01-03'));
    });

    // ----- Load, delete by id and loadRelated, for a number, a Date and a string id -----

    /** Saves `node`, joins it to the target, and finds it by `text` through a load, loadRelated and a delete. */
    const lookups = async (type: ClassType, node: any, text: string): Promise<void> => {
        await gom.save(node);
        expect(await gom.edges.relate(nodeRef(type, text), target, 'POINTS_TO')).toBe(true);
        expect((await gom.load(type, text)) as any).toMatchObject({ name: node.name });
        const related = await gom.edges.loadRelated(nodeRef(type, text), 'POINTS_TO', Direction.OUTGOING, LookupTarget);
        expect(related.map((it) => it.id)).toEqual(['x']);
        expect(await gom.delete(type, text)).toEqual(1);
        expect(await gom.load(type, text)).toBeUndefined();
    };

    it('should find a number id by its text', async () => {
        await lookups(LookupNumber, make(LookupNumber, { id: 5, name: 'five' }), '5');
    });

    it('should find a Date id by its text', async () => {
        await lookups(LookupDate, make(LookupDate, { id: day('2024-03-04'), name: 'march' }), '2024-03-04');
    });

    it('should find a string id by its text', async () => {
        await lookups(LookupText, make(LookupText, { id: 't5', name: 'text' }), 't5');
    });

    // ----- Relate (a `ref` step) and patch (a `patch` step), each finding its node by the id's JSON -----

    /**
     * Joins `node`, saved, to the target by refs given the id as text and as its value; patches its name; and refers to
     * a node of the class that isn't there, `absent`, which is not made, and joins nothing.
     */
    const refsAndPatches = async (type: ClassType, node: any, text: string, absent: string): Promise<void> => {
        await gom.save(node);
        const id = (node as any).id;
        expect(await gom.edges.relate(nodeRef(type, text), target, 'REFERS_TO')).toBe(true);
        expect(await gom.edges.relate(nodeRef(type, id), target, 'REFERS_TO', {}, RelateMode.CREATE)).toBe(true);
        expect(await gom.edges.unrelate(nodeRef(type, text), target, 'REFERS_TO')).toEqual(2);
        expect(await gom.edges.relate(nodeRef(type, id), target, 'REFERS_TO')).toBe(true);

        expect(await gom.patch(type, text, { set: { name: 'renamed' } })).toEqual({
            found: true,
            applied: true,
            changed: true
        });
        expect(((await gom.load(type, text)) as any).name).toEqual('renamed');
        expect(await gom.patchAll([make(type as any, { id, name: 'patched all' })], { only: ['name'] })).toEqual([
            { found: true, applied: true, changed: true }
        ]);
        expect(((await gom.load(type, id)) as any).name).toEqual('patched all');

        expect(await gom.edges.relate(nodeRef(type, absent), target, 'REFERS_TO')).toBe(false);
        expect(await gom.edges.relate(target, nodeRef(type, absent), 'REFERS_TO')).toBe(false);
        expect(await gom.edges.loadRelated(target, 'REFERS_TO', Direction.OUTGOING, type)).toEqual([]);
        expect(await gom.edges.unrelateAll(nodeRef(type, text), 'REFERS_TO')).toEqual(1);
    };

    it('should relate and patch a node of a number id', async () => {
        await refsAndPatches(LookupNumber, make(LookupNumber, { id: 21, name: 'a' }), '21', '22');
    });

    it('should relate and patch a node of a Date id', async () => {
        await refsAndPatches(
            LookupDate,
            make(LookupDate, { id: day('2024-05-06'), name: 'a' }),
            '2024-05-06',
            '2024-05-07'
        );
    });

    it('should relate and patch a node of a string id', async () => {
        await refsAndPatches(LookupText, make(LookupText, { id: 't21', name: 'a' }), 't21', 't22');
    });

    /**
     * A save that replaces a list keeps the targets the object still holds, told by their ids as the plan keys them, and
     * unlinks the rest: a target of a Date id is read back by its tag's text `v`, which the plan's `ids` hold. Read as
     * anything else, the dropped day would be kept, or the held one unlinked and joined again, which gives it a new
     * relationship token, its stamp's second.
     */
    it("should unlink a target of a Date id by its tag's text, and keep the one still held", async () => {
        const days = make(LookupTarget, { id: 'days', name: 'a target of days' });
        const first = make(LookupDate, { id: day('2025-01-01'), name: 'first day' });
        const second = make(LookupDate, { id: day('2025-01-02'), name: 'second day' });
        await gom.save(make(LookupTargetDays, { target: days, days: [first, second] }), { replace: ['days'] });
        expect((await gom.load(LookupTargetDays, 'days'))!.days.map((it) => it.name).sort()).toEqual([
            'first day',
            'second day'
        ]);
        const held = (await gom.load(LookupDate, '2025-01-02'))!.stamp;

        const kept = make(LookupDate, { id: day('2025-01-02'), name: 'second day' });
        await gom.save(make(LookupTargetDays, { target: days, days: [kept] }), { replace: ['days'] });

        expect((await gom.load(LookupTargetDays, 'days'))!.days.map((it) => it.name)).toEqual(['second day']);
        expect((await gom.load(LookupDate, '2025-01-02'))!.stamp).toEqual(held);
        expect((await gom.load(LookupDate, '2025-01-01'))?.name).toEqual('first day');
    });

    /**
     * A cascade delete by a Date id's text finds its root as a load does, both in the check that refuses a tree deeper
     * than the view reads and in the delete itself.
     */
    it("should check the depth of a cascade delete by a Date id's text, and delete the tree", async () => {
        const isos = ['2026-02-01', '2026-02-02', '2026-02-03'];
        for (const [i, iso] of isos.entries()) {
            await gom.save(make(LookupDate, { id: day(iso), name: `tree day ${i}` }));
        }
        for (let i = 1; i < isos.length; i++) {
            expect(
                await gom.edges.relate(nodeRef(LookupDate, isos[i]), nodeRef(LookupDate, isos[i - 1]), 'DAY_PART_OF')
            ).toBe(true);
        }
        await expect(gom.delete(LookupDateTree, '2026-02-01', { cascade: CascadeType.DELETE_ALL })).rejects.toThrow(
            '1 node below that would be left behind'
        );
        expect(await names(LookupDate)).toHaveLength(3);

        expect(await gom.delete(LookupDate, '2026-02-03')).toEqual(1);
        expect(await gom.delete(LookupDateTree, '2026-02-01', { cascade: CascadeType.DELETE_ALL })).toEqual(2);
        expect(await names(LookupDate)).toEqual([]);
    });

    it("should find no node for a patch of one that isn't there", async () => {
        expect(await gom.patch(LookupDate, '1999-01-01', { set: { name: 'none' } })).toEqual({
            found: false,
            applied: false,
            changed: false
        });
        expect(await names(LookupDate)).toEqual([]);
    });

    it('should find only the string by text on a string id, not a number of the same text', async () => {
        await gom.save(make(LookupTextNumber, { id: 6, name: 'number' }));
        await gom.save(make(LookupText, { id: '6', name: 'string' }));

        expect((await gom.load(LookupText, '6'))?.name).toEqual('string');
        expect(await gom.delete(LookupText, '6')).toEqual(1);
        expect((await gom.load(LookupTextNumber, 6))?.name).toEqual('number');
        expect(await gom.load(LookupText, '6')).toBeUndefined();
    });

    it('should find nothing for text that is no number on a number id, and throw nothing', async () => {
        await gom.save(make(LookupNumber, { id: 7, name: 'seven' }));
        const nowhere = nodeRef(LookupNumber, 'abc');

        expect(await gom.load(LookupNumber, 'abc')).toBeUndefined();
        expect(await gom.delete(LookupNumber, 'abc')).toEqual(0);
        expect(await gom.edges.loadRelated(nowhere, 'POINTS_TO', Direction.OUTGOING, LookupTarget)).toEqual([]);
        expect(await gom.edges.relate(nowhere, target, 'POINTS_TO')).toBe(false);
        expect(await gom.patch(LookupNumber, 'abc', { set: { name: 'x' } })).toEqual({
            found: false,
            applied: false,
            changed: false
        });
        expect((await gom.load(LookupNumber, '7'))?.name).toEqual('seven');
    });

    it('should find no node for a patch by a null id, beside a node whose id is the text "null" (#773)', async () => {
        await gom.save(make(LookupText, { id: 'null', name: 'the text null' }));
        expect(await gom.patch(LookupText, null, { set: { name: 'patched' } })).toEqual({
            found: false,
            applied: false,
            changed: false
        });
        expect((await gom.load(LookupText, 'null'))?.name).toEqual('the text null');
    });

    it('should find a node of a $-named id by its id', async () => {
        await gom.save(make(LookupPriced, { $code: 'p1', name: 'priced' }));
        expect((await gom.load(LookupPriced, 'p1'))?.name).toEqual('priced');
        expect(await gom.patch(LookupPriced, 'p1', { set: { name: 'repriced' } })).toMatchObject({ found: true });
        expect(await gom.delete(LookupPriced, 'p1')).toEqual(1);
        expect(await gom.load(LookupPriced, 'p1')).toBeUndefined();
    });

    // ----- Each lookup reads the index -----

    /**
     * A load, a delete by id and loadRelated read the index the library makes over the id, a uniqueness constraint's
     * ensured through `gom.constraints`, which the shared module's schema plan makes as layout 2 makes it: over the
     * property's JSON on Postgres, and its class and key on SQLite, which the module's hasId compares. On Postgres and
     * SQLite, whose planners are read here; Oracle's lookups are planned in drivine4j's suite.
     */
    const planned = store.type === DatabaseType.ORACLE ? it.skip : it;
    planned('should read the index over the id for a load, a delete and loadRelated', async () => {
        const constraint = { kind: 'UNIQUE' as const, label: 'LookupNumber', properties: ['id'] };
        const sqlite = store.type === DatabaseType.SQLITE;
        await gom.saveAll(Array.from({ length: 3000 }, (_, i) => make(LookupNumber, { id: 1000 + i, name: 'filler' })));
        await gom.constraints.ensure(constraint);
        try {
            await pm.execute(new QuerySpecification(sqlite ? 'ANALYZE' : 'ANALYZE drivine_node'));
            const registry = new ModelRegistry();
            const model = registry.fragment(LookupNumber);
            const explain = async (text: string, bindings: Record<string, any>): Promise<string> => {
                const rows = await pm.query<any>(
                    new QuerySpecification(`${sqlite ? 'EXPLAIN QUERY PLAN' : 'EXPLAIN'} ${text}`).bind(bindings)
                );
                return rows.map((it) => (sqlite ? it.detail : Object.values(it)[0])).join('\n');
            };
            const index = 'drivine_uq2_lookupnumberid_\\w+';
            const reads = sqlite
                ? new RegExp(`SEARCH \\w+ USING (COVERING )?INDEX ${index} \\(<expr>=\\? AND <expr>=\\?\\)`, 'i')
                : new RegExp(`Index (Only )?Scan using ${index} on drivine_node`, 'i');
            const bound = { id: writeLayout(1500, 'postgres') };
            expect(await explain(backend.loadFragment(model).text, bound)).toMatch(reads);
            expect(await explain(backend.delete({ kind: 'NODE_FRAGMENT', model }).text, bound)).toMatch(reads);
            const related = backend.related(
                { model, id: 1500 },
                'POINTS_TO',
                Direction.OUTGOING,
                registry.fragment(LookupTarget)
            );
            expect(await explain(related.text, related.bindings)).toMatch(reads);
        } finally {
            await gom.constraints.drop(constraint);
        }
    });
});
