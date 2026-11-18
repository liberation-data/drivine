import {
    backendFor,
    count,
    DatabaseRegistry,
    DatabaseType,
    key,
    max,
    min,
    ModelRegistry,
    NodeFragment,
    NodeId,
    pathKey,
    PersistenceManager,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { SqlSeed, sqlPersistenceManager, SqlStore, sqlStores } from '../support/SqlStores';

jest.setTimeout(60_000);

@NodeFragment({ labels: ['PgGroupRun', 'Item'] })
class Item {
    @NodeId() id: string;
    value?: unknown;
    name?: string;
    at?: Date;
    shelf?: string;
}

@NodeFragment({ labels: ['PgGroupRun', 'Shelf'] })
class Shelf {
    @NodeId() id: unknown;
}

const postgres: SqlStore[] = sqlStores().filter((it) => it.type === DatabaseType.POSTGRES);

/**
 * A grouped read run on Postgres, as SqliteGroupsRun.spec runs one on SQLite (drivine-cypher-spec#235, step 3): a
 * property key ordered as Cypher orders it, read through a node of the group that has it, and a least or greatest value
 * of its own kind, given as the group's column and compared and ordered at its node (drivine4j's `PostgresSelect.groups`).
 * PostgresQueryDsl.spec pins the SQL.
 */
describe.each(postgres)('a grouped read run on $name', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: SqlSeed;
    /** Relationships between nodes found by their `ref`, for a node whose id is a date. */
    let byRef: SqlSeed;

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        seed = new SqlSeed(pm, store, 'PgGroupRun');
        byRef = new SqlSeed(pm, store, 'PgGroupRun', 'ref');
        await seed.prepare();
    });

    beforeEach(async () => {
        await seed.clear();
    });

    afterAll(async () => {
        await seed.clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    /** Inserts a node of each value, as its JSON, `undefined` for none: a date as the tag a save writes. */
    async function create(values: unknown[]): Promise<void> {
        for (const [i, value] of values.entries()) {
            await seed.node(['Item'], { id: `i${i}`, ...(value === undefined ? {} : { value }) });
        }
    }

    /** A datetime's tag as a save writes it: its text, then its sort key. */
    const datetime = (v: string, s: string): object => ({ $t: 'datetime', v, s });

    /** The groups' keys of `value`, ordered by it `direction`, as their ids. */
    async function order(direction: 'asc' | 'desc'): Promise<unknown[]> {
        const groups = await gom.groups.load(Item, {
            keys: { value: key('value') },
            aggregates: { first: min('id'), all: count() },
            orderBy: [['value', direction]]
        });
        return groups.map((it: any) => it.first);
    }

    it("orders a key of dates as Cypher orders them: by the moment, an offset's included, not by its text", async () => {
        await create([
            datetime('2024-01-01T00:00:00.5Z', '10000020240101000000500000000064800'),
            datetime('2024-01-01T00:00:00Z', '10000020240101000000000000000064800'),
            datetime('2024-01-01T01:00:00+02:00', '10000020231231230000000000000072000')
        ]);
        expect(await order('asc')).toEqual(['i2', 'i1', 'i0']);
        expect(await order('desc')).toEqual(['i0', 'i1', 'i2']);
    });

    // Held: the module's order term on Postgres ranks kinds in jsonb's order, so a number sorts before a boolean
    // (liberation-data/drivine-cypher-spec#371). SQLite's ranks them as Cypher does.
    it.failing(
        'orders a key of mixed kinds as Cypher orders them: a text, a boolean, a number, and no value last',
        async () => {
            await create(['b', true, 10, 9, undefined, false, 'a']);
            expect(await order('asc')).toEqual(['i6', 'i0', 'i5', 'i1', 'i3', 'i2', 'i4']);
            expect(await order('desc')).toEqual(['i4', 'i2', 'i3', 'i1', 'i5', 'i0', 'i6']);
        }
    );

    it('orders the groups by a key it was not asked to order by, a tie broken so too', async () => {
        await create([
            datetime('2024-01-01T00:00:00.5Z', '10000020240101000000500000000064800'),
            datetime('2024-01-01T00:00:00Z', '10000020240101000000000000000064800')
        ]);
        const groups = await gom.groups.load(Item, { keys: { value: key('value') }, aggregates: { first: min('id') } });
        expect(groups.map((it: any) => it.first)).toEqual(['i1', 'i0']);
    });

    it("gives a least and a greatest text and date as a text, in Cypher's order of each, not as a number", async () => {
        await gom.saveAll(
            [
                { id: 'a', name: 'pear', at: new Date('2026-03-01T00:00:00.000Z') },
                { id: 'b', name: 'apple', at: new Date('2026-01-01T00:00:00.000Z') },
                { id: 'c', name: 'quince', at: new Date('2026-02-01T00:00:00.000Z') },
                { id: 'd' }
            ].map((it) => Object.assign(new Item(), { shelf: 'one', ...it }))
        );
        const [group] = await gom.groups.load(Item, {
            keys: { shelf: key('shelf') },
            aggregates: { first: min('name'), last: max('name'), earliest: min('at'), latest: max('at') }
        });
        // A date of a field TypeScript records no type of is given as its text, Cypher's, as on SQLite: not a Date, and
        // not the text the save wrote, `.000Z`. One declared a Date is a Date (#785): see the groups spec.
        expect(group).toEqual({
            shelf: 'one',
            first: 'apple',
            last: 'quince',
            earliest: '2026-01-01T00:00:00Z',
            latest: '2026-03-01T00:00:00Z'
        });
    });

    /** The groups of each item's shelf, ordered by it `direction`, as the shelves' ids. */
    async function shelves(direction: 'asc' | 'desc'): Promise<unknown[]> {
        const groups = await gom.groups.load(Item, {
            keys: { shelf: pathKey(Shelf, [{ type: 'ON' }]) },
            aggregates: { all: count() },
            orderBy: [['shelf', direction]]
        });
        return groups.map((it: any) => it.shelf.id);
    }

    it("orders a path key by its node's id as Cypher orders it: a text before a number", async () => {
        for (const [item, shelf] of [
            ['i0', 10],
            ['i1', 'b'],
            ['i2', 9]
        ] as [string, unknown][]) {
            await seed.node(['Item'], { id: item, ref: item });
            await seed.node(['Shelf'], { id: shelf, ref: `s-${item}` });
            await byRef.edge(item, 'ON', `s-${item}`);
        }
        expect(await shelves('asc')).toEqual(['b', 9, 10]);
        expect(await shelves('desc')).toEqual([10, 9, 'b']);
    });

    it("orders a path key whose node's id is a date by the moment, not by its tag's text", async () => {
        const at = [
            datetime('2024-01-01T00:00:00.5Z', '10000020240101000000500000000064800'),
            datetime('2024-01-01T00:00:00Z', '10000020240101000000000000000064800'),
            datetime('2024-01-01T01:00:00+02:00', '10000020231231230000000000000072000')
        ];
        for (const [i, id] of at.entries()) {
            await seed.node(['Item'], { id: `i${i}`, ref: `i${i}` });
            await seed.node(['Shelf'], { id, ref: `s${i}` });
            await byRef.edge(`i${i}`, 'ON', `s${i}`);
        }
        const moments = async (direction: 'asc' | 'desc'): Promise<string[]> =>
            (await shelves(direction)).map((id) => new Date(id as Date).toISOString());
        expect(await moments('asc')).toEqual([
            '2023-12-31T23:00:00.000Z',
            '2024-01-01T00:00:00.000Z',
            '2024-01-01T00:00:00.500Z'
        ]);
        expect(await moments('desc')).toEqual([
            '2024-01-01T00:00:00.500Z',
            '2024-01-01T00:00:00.000Z',
            '2023-12-31T23:00:00.000Z'
        ]);
    });

    it('compares, orders and filters a least or greatest value at its node, before the page is taken', async () => {
        await gom.saveAll(
            [
                { id: 'a', shelf: 'one', value: 3, name: 'x' },
                { id: 'b', shelf: 'one', value: 7, name: 'y' },
                { id: 'c', shelf: 'two', value: 5, name: 'x' },
                { id: 'd', shelf: 'three' },
                { id: 'e', shelf: 'four', value: 1, name: 'y' }
            ].map((it) => Object.assign(new Item(), it))
        );
        const top = async (spec: object): Promise<unknown[]> =>
            gom.groups.load(Item, { keys: { shelf: key('shelf') }, aggregates: { top: max('value') }, ...spec });
        // A group with no value is last ascending and first descending, as Cypher orders a null.
        expect(await top({ orderBy: [['top', 'asc']] })).toEqual([
            { shelf: 'four', top: 1 },
            { shelf: 'two', top: 5 },
            { shelf: 'one', top: 7 },
            { shelf: 'three' }
        ]);
        expect((await top({ orderBy: [['top', 'desc']] })).map((it: any) => it.shelf)).toEqual([
            'three',
            'one',
            'two',
            'four'
        ]);
        // The having is a condition over the joined node, outside the grouping, and the page is taken after it.
        const kept = { having: [['top', 'gte', 5]], orderBy: [['shelf', 'asc']] };
        expect(await top(kept)).toEqual([
            { shelf: 'one', top: 7 },
            { shelf: 'two', top: 5 }
        ]);
        expect(await top({ ...kept, skip: 1, limit: 1 })).toEqual([{ shelf: 'two', top: 5 }]);
        // Not ordered or filtered by it, the value is the group's column alone.
        expect(await top({ orderBy: [['shelf', 'desc']] })).toEqual([
            { shelf: 'two', top: 5 },
            { shelf: 'three' },
            { shelf: 'one', top: 7 },
            { shelf: 'four', top: 1 }
        ]);
        // A filtered least value is of the nodes that meet the filter: none in a group is no value.
        const filtered = await gom.groups.load(Item, (q: any) => ({
            keys: { shelf: key(q.shelf) },
            aggregates: { low: min(q.value, q.name.eq('y')) },
            orderBy: [['low', 'asc']]
        }));
        expect(filtered).toEqual([
            { shelf: 'four', low: 1 },
            { shelf: 'one', low: 7 },
            { shelf: 'three' },
            { shelf: 'two' }
        ]);
    });
});
