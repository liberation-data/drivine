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
});
