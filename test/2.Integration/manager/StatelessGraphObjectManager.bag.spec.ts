import {
    CypherBackend,
    cypherGrammarFor,
    GraphProperty,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    NullPolicy,
    PersistenceManager,
    PropertyBag,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Neo4j plans each statement the first time it sees it, a few hundred milliseconds for one of the object manager's, and
// the tests here send statements of their own shapes. On fresh containers, beside the suites running in parallel, a
// test can pass Jest's 5 seconds planning them (#349).
jest.setTimeout(30_000);

@NodeFragment({ labels: ['BagTest', 'Proposition'] })
class Proposition {
    @NodeId() id: string;
    text?: string;
    @PropertyBag() metadata: Record<string, any> = {};
    @PropertyBag({ prefix: 'meta', delimiter: '_' }) extra: Record<string, any> = {};
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['BagTest', 'Thing'] })
class Thing {
    @NodeId() id: string;
    name = '';
    @PropertyBag({ flat: true }) properties: Record<string, any> = {};
}

/** A flat bag beside a stamp, a prefixed bag, a field stored under another name, and fields of no decorator. */
@NodeFragment({ labels: ['BagTest', 'Sticker'] })
class Sticker {
    @NodeId() id: string;
    @GraphProperty('sticker_name') name?: string;
    colour = '';
    note?: string;
    @PropertyBag({ prefix: 'meta', delimiter: '_' }) meta: Record<string, any> = {};
    @PropertyBag({ flat: true }) extras: Record<string, any> = {};
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['BagTest', 'Doc'] })
class Doc {
    @NodeId() id: string;
}

@GraphView()
class DocPropositions {
    @Root() doc: Doc;
    @GraphRelationship({ type: 'STATES', target: () => Proposition }) propositions: Proposition[];
}

const proposition = (id: string, metadata: Record<string, any>, extra: Record<string, any> = {}): Proposition =>
    Object.assign(new Proposition(), { id, text: 'Sky is blue', metadata, extra });

describe.each(graphEngines())('@PropertyBag on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const stored = async (id: string): Promise<Record<string, any>> =>
        pm.getOne<Record<string, any>>(
            new QuerySpecification('MATCH (n:BagTest {id: $id}) RETURN properties(n)').bind({ id })
        );

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:BagTest) DETACH DELETE n'));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:BagTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should store each entry as a property under the bag’s namespace, and load the bag back', async () => {
        await gom.save(proposition('p1', { source: 'wiki', score: 3, tags: ['a', 'b'] }, { lang: 'en' }));
        expect(await stored('p1')).toEqual(
            expect.objectContaining({
                'metadata.source': 'wiki',
                'metadata.score': 3,
                'metadata.tags': ['a', 'b'],
                meta_lang: 'en'
            })
        );
        const loaded = (await gom.load(Proposition, 'p1'))!;
        expect(loaded.metadata).toEqual({ source: 'wiki', score: 3, tags: ['a', 'b'] });
        expect(loaded.extra).toEqual({ lang: 'en' });
        expect(loaded.text).toEqual('Sky is blue');
        const found = await gom.loadAll(Proposition, 'n.`metadata.source` = $source', { source: 'wiki' });
        expect(found.map((it) => it.id)).toEqual(['p1']);
    });

    it('should leave stale entries by default, remove them under CLEAR, and keep the stamp when nothing changes', async () => {
        const saved = await gom.save(proposition('p1', { source: 'wiki', score: 3 }));
        const stamp = saved.stamp;
        await gom.save(saved);
        expect((await stored('p1'))['__drivine.stamp']).toEqual(stamp);

        saved.metadata = { source: 'web' };
        await gom.save(saved);
        expect((await gom.load(Proposition, 'p1'))!.metadata).toEqual({ source: 'web', score: 3 });

        const loaded = (await gom.load(Proposition, 'p1'))!;
        loaded.metadata = { source: 'web' };
        await gom.save(loaded, { nullPolicy: NullPolicy.CLEAR });
        expect((await gom.load(Proposition, 'p1'))!.metadata).toEqual({ source: 'web' });
    });

    it('should take every undeclared property into a flat bag', async () => {
        await pm.execute(
            new QuerySpecification("CREATE (:BagTest:Thing {id: 't1', name: 'Box', colour: 'red', size: 3})")
        );
        const loaded = (await gom.load(Thing, 't1'))!;
        expect(loaded.name).toEqual('Box');
        expect(loaded.properties).toEqual({ colour: 'red', size: 3 });
        loaded.properties.weight = 5;
        await gom.save(loaded);
        expect(await stored('t1')).toEqual(expect.objectContaining({ colour: 'red', size: 3, weight: 5 }));
    });

    it('should refuse a flat bag entry that a field, the id, another bag or the stamp is stored under, writing nothing', async () => {
        const sticker = (extras: Record<string, any>): Sticker =>
            Object.assign(new Sticker(), { id: 's1', name: 'Star', note: 'Shiny', extras });
        for (const key of ['sticker_name', 'colour', 'note', 'id', 'meta_lang', '__drivine.stamp']) {
            await expect(gom.save(sticker({ [key]: 'x' }))).rejects.toThrow(
                new RegExp(`Sticker.extras has an entry '${key}', which is the property of a declared field`)
            );
            await expect(gom.saveAll([sticker({ [key]: 'x' })])).rejects.toThrow(/which is the property/);
            await expect(gom.save(sticker({ [key]: 'x' }), { only: ['extras'] })).rejects.toThrow(
                /which is the property/
            );
        }
        expect(await gom.load(Sticker, 's1')).toBeUndefined();

        const saved = await gom.save(Object.assign(sticker({ name: 'open', size: 3 }), { note: undefined }));
        const loaded = (await gom.load(Sticker, 's1'))!;
        expect(loaded.extras).toEqual({ name: 'open', size: 3 });
        expect(loaded.name).toEqual('Star');
        expect(loaded.stamp).toEqual(saved.stamp);
    });

    it('should write the bags of related nodes, and of fragments in a batch', async () => {
        await gom.save(
            Object.assign(new DocPropositions(), {
                doc: Object.assign(new Doc(), { id: 'd1' }),
                propositions: [proposition('p1', { source: 'wiki' }), proposition('p2', { source: 'web' })]
            })
        );
        const doc = (await gom.load(DocPropositions, 'd1'))!;
        expect(doc.propositions.map((it) => it.metadata.source).sort()).toEqual(['web', 'wiki']);
        await gom.saveAll([proposition('p3', { source: 'batch' }), proposition('p4', { source: 'batch' })]);
        expect((await gom.loadAll(Proposition, 'n.`metadata.source` = $s', { s: 'batch' })).length).toEqual(2);
    });

    it('should refuse a value that is not storable, and a patch of a bag', async () => {
        await expect(gom.save(proposition('p1', { nested: { a: 1 } }))).rejects.toThrow(/entry 'nested'/);
        await gom.save(proposition('p1', {}));
        await expect(gom.patch(Proposition, 'p1', { set: { metadata: { a: 1 } } })).rejects.toThrow(
            /can't write metadata/
        );
    });
});
