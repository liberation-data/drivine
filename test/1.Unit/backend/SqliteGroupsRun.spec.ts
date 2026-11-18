import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    StatelessGraphObjectManager,
    TransactionContextHolder
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['GroupRun', 'Item'] })
class Item {
    @NodeId() id: string;
    value?: unknown;
    name?: string;
    at?: Date;
    shelf?: string;
}

/**
 * A grouped read run on SQLite, which Node bundles, so no container: a property key ordered as Cypher orders it, read
 * through a node of the group that has it (drivine4j's `SqliteSelect.groups`), and a least or greatest value of its own
 * kind.
 */
describe('a grouped read run on SQLite', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-groups-'));
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(() => {
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ databaseType: DatabaseType.SQLITE, host: '', databaseName: path.join(folder, 'g.db') })
            .register('groups');
        pm = new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
            'groups',
            'NON_TRANSACTIONAL'
        );
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.SQLITE), new ModelRegistry());
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification({ text: 'MATCH (n:GroupRun) DETACH DELETE n', language: 'CYPHER' }));
    });

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        fs.rmSync(folder, { recursive: true, force: true });
    });

    /** Inserts a node of each value, as its JSON, `undefined` for none: a date as the tag a save writes, its text first. */
    async function create(values: unknown[]): Promise<void> {
        for (const [i, value] of values.entries()) {
            await pm.execute(
                new QuerySpecification(
                    `INSERT INTO drivine_node (labels, props) VALUES ('["GroupRun","Item"]', $props)`
                ).bind({ props: JSON.stringify({ id: `i${i}`, value }) })
            );
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

    it('orders a key of mixed kinds as Cypher orders them: a text, a boolean, a number, and no value last', async () => {
        await create(['b', true, 10, 9, undefined, false, 'a']);
        expect(await order('asc')).toEqual(['i6', 'i0', 'i5', 'i1', 'i3', 'i2', 'i4']);
        expect(await order('desc')).toEqual(['i4', 'i2', 'i3', 'i1', 'i5', 'i0', 'i6']);
    });

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
        // A date is given as its text, Cypher's, as the temporal filters' grouped read reads one: not a Date, and not
        // the text the save wrote, `.000Z`.
        expect(group).toEqual({
            shelf: 'one',
            first: 'apple',
            last: 'quince',
            earliest: '2026-01-01T00:00:00Z',
            latest: '2026-03-01T00:00:00Z'
        });
    });
});
