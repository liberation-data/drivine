import {
    backendFor,
    DatabaseType,
    EmptyWhenAbsent,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { rawProps, SqlStore } from '../support/SqlStores';

// Neo4j plans each statement the first time it sees it, a few hundred milliseconds for one of the object manager's, and
// the tests here send statements of their own shapes. On fresh containers, beside the suites running in parallel, a
// test can pass Jest's 5 seconds planning them (#349).
jest.setTimeout(30_000);

/**
 * Lists and sets TypeScript records as Object, as it records a map, where they are declared with a union under strict
 * null checks: their kind named. And a list and a set it records as such.
 */
@NodeFragment({ labels: ['EmptyAbsent'] })
class Listing {
    @NodeId() id: string;
    name?: string;
    @EmptyWhenAbsent({ kind: 'array' }) tags: string[] | null;
    @EmptyWhenAbsent() more?: string[];
    @EmptyWhenAbsent() codes: Set<string>;
    @EmptyWhenAbsent({ kind: 'set' }) badges: Set<string> | null;
    @NodeStamp() stamp?: string;
}

const listing = (id: string, fields: Partial<Listing> = {}): Listing => Object.assign(new Listing(), { id, ...fields });

/**
 * An `@EmptyWhenAbsent` list or set of a node saved without it loads as an empty one, whatever TypeScript records for
 * its type, and saves back as an empty list, not as `{}`.
 */
describe.each(allStores())('@EmptyWhenAbsent lists and sets on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    const stored = async (): Promise<Record<string, any>> => {
        const sql = engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES;
        const row = await pm.getOne<any>(
            new QuerySpecification(
                sql ? rawProps(engine as SqlStore, 'EmptyAbsent') : 'MATCH (n:EmptyAbsent) RETURN properties(n)'
            )
        );
        const props = sql ? row.props ?? row : row;
        return typeof props === 'string' ? JSON.parse(props) : props;
    };

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        if (engine.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
    });

    beforeEach(async () => {
        await clearLabels(pm, engine, 'EmptyAbsent');
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'EmptyAbsent');
        await closeGraphEngines();
    });

    it('should load a list and a set the node holds nothing for as empty ones, and save them back as empty lists', async () => {
        await gom.save(listing('l1', { name: 'bare' }));
        expect((await stored()).tags).toBeUndefined();

        const loaded = (await gom.load(Listing, 'l1'))!;
        expect(loaded.tags).toEqual([]);
        expect(loaded.more).toEqual([]);
        expect(loaded.codes).toEqual(new Set());
        expect(loaded.badges).toEqual(new Set());

        await gom.save(listing('l1', { ...loaded, name: 'saved back' }), { from: loaded });
        const after = await stored();
        expect(after.name).toEqual('saved back');
        for (const field of ['tags', 'more', 'codes', 'badges']) {
            expect([field, after[field]]).toEqual([field, []]);
        }
        expect((await gom.load(Listing, 'l1'))!.tags).toEqual([]);
    });

    it('should store a set as a list, and load it back as a set', async () => {
        await gom.save(listing('l2', { tags: ['a'], codes: new Set(['x', 'y']), badges: new Set(['gold']) }));
        const props = await stored();
        expect(props.tags).toEqual(['a']);
        expect([...props.codes].sort()).toEqual(['x', 'y']);
        expect(props.badges).toEqual(['gold']);

        const loaded = (await gom.load(Listing, 'l2'))!;
        expect(loaded.tags).toEqual(['a']);
        expect(loaded.codes).toEqual(new Set(['x', 'y']));
        expect(loaded.badges).toEqual(new Set(['gold']));
    });

    it('should find a node by an item of a set, which it stores as a list', async () => {
        await gom.save(listing('l4', { codes: new Set(['x', 'y']), badges: new Set(['gold']) }));
        await gom.save(listing('l5', { codes: new Set(['z']) }));
        const ids = async (where: (q: any) => any): Promise<string[]> =>
            (await gom.loadAll(Listing, (q) => ({ where: where(q) }))).map((it) => it.id).sort();

        expect(await ids((q) => q.codes.hasItem('y'))).toEqual(['l4']);
        expect(await ids((q) => q.badges.hasItem('gold'))).toEqual(['l4']);
    });

    it('should load a set saved before sets were stored as lists, which a store held as {}, as an empty set', async () => {
        // A Set was written as it was given: JSON text holds one as {}, and Memgraph a map.
        if (engine.type === DatabaseType.NEO4J || engine.type === DatabaseType.FALKORDB) {
            return; // Neo4j and FalkorDB refuse a map as a property, so none holds a set saved so.
        }
        await gom.save(listing('l3', { name: 'old', codes: {} as any }));
        const loaded = (await gom.load(Listing, 'l3'))!;
        expect(loaded.codes).toEqual(new Set());

        await gom.save(listing('l3', { ...loaded, name: 'saved back', codes: new Set(['x']) }), { from: loaded });
        expect((await stored()).codes).toEqual(['x']);
        expect((await gom.load(Listing, 'l3'))!.codes).toEqual(new Set(['x']));
    });
});
