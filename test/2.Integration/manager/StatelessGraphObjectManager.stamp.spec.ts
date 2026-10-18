import {
    CypherBackend,
    cypherGrammarFor,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    PersistenceManager,
    QuerySpecification,
    Root,
    StaleObjectException,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['StampTest', 'Person'] })
class Person {
    @NodeId() id: string;
    name?: string;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['StampTest', 'Tag'] })
class Tag {
    @NodeId() id: string;
    @NodeStamp() stamp?: string;
}

@GraphView()
class Tagged {
    @Root() person: Person;
    @GraphRelationship({ type: 'TAGGED', target: () => Tag }) tags: Tag[];
}

const person = (id: string, name?: string): Person => Object.assign(new Person(), { id, name });
const tag = (id: string): Tag => Object.assign(new Tag(), { id });
const [data, links] = [(s: string) => s.split(':')[0], (s: string) => s.split(':')[1]];

describe.each(graphEngines())('@NodeStamp on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const stored = async (id: string): Promise<string> =>
        pm.getOne<string>(new QuerySpecification('MATCH (n:StampTest {id: $id}) RETURN n.`__drivine.stamp`').bind({ id }));

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, new CypherBackend(cypherGrammarFor(engine.type)), new ModelRegistry());
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:StampTest) DETACH DELETE n'));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:StampTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should stamp a node it makes, hand the stamp back, and load it', async () => {
        const saved = await gom.save(person('moon', 'Moon Girl'));
        expect(saved.stamp).toMatch(/^[0-9a-f]{16}:[0-9a-f]{16}$/);
        expect(await stored('moon')).toEqual(saved.stamp);
        expect((await gom.load(Person, 'moon'))!.stamp).toEqual(saved.stamp);
        expect(Object.keys((await gom.load(Person, 'moon'))!)).not.toContain('__drivine.stamp');
    });

    it('should replace the data token only when the data changes', async () => {
        const saved = await gom.save(person('moon', 'Moon Girl'));
        const first = saved.stamp!;
        await gom.save(saved);
        expect(await stored('moon')).toEqual(first);
        saved.name = 'Lunella';
        await gom.save(saved);
        const second = await stored('moon');
        expect(data(second)).not.toEqual(data(first));
        expect(links(second)).toEqual(links(first));
        expect(saved.stamp).toEqual(second);
    });

    it('should refuse a stale save, writing nothing', async () => {
        const mine = (await gom.save(person('moon', 'Moon Girl')))!;
        const theirs = (await gom.load(Person, 'moon'))!;
        theirs.name = 'Theirs';
        await gom.save(theirs);

        mine.name = 'Mine';
        const refusal = await gom.save(mine).catch((e) => e);
        expect(refusal).toBeInstanceOf(StaleObjectException);
        expect(refusal.deleted).toBe(false);
        expect(refusal.foundStamp).toEqual(theirs.stamp);
        expect((await gom.load(Person, 'moon'))!.name).toEqual('Theirs');
    });

    it('should refuse a save of a node that was deleted', async () => {
        const mine = await gom.save(person('moon', 'Moon Girl'));
        await gom.delete(Person, 'moon');
        const refusal = await gom.save(mine).catch((e) => e);
        expect(refusal).toBeInstanceOf(StaleObjectException);
        expect(refusal.deleted).toBe(true);
        expect(await gom.count(Person)).toEqual(0);
    });

    it('should mark both ends of a relationship it makes', async () => {
        await gom.save(person('moon'));
        await gom.save(tag('t1'));
        const [moonBefore, tagBefore] = [await stored('moon'), await stored('t1')];
        await gom.save(Object.assign(new Tagged(), { person: person('moon'), tags: [tag('t1')] }));
        const [moonAfter, tagAfter] = [await stored('moon'), await stored('t1')];
        expect(links(moonAfter)).not.toEqual(links(moonBefore));
        expect(links(tagAfter)).not.toEqual(links(tagBefore));
        expect(data(moonAfter)).toEqual(data(moonBefore));
    });

    it('should apply an adding save after another writer added a relationship, but refuse a replace', async () => {
        await gom.save(Object.assign(new Tagged(), { person: person('moon'), tags: [tag('t1')] }));
        const mine = (await gom.load(Tagged, 'moon'))!;
        const theirs = (await gom.load(Tagged, 'moon'))!;
        theirs.tags.push(tag('t2'));
        await gom.save(theirs);

        mine.person.name = 'Moon Girl';
        await gom.save(mine);
        expect((await gom.load(Person, 'moon'))!.name).toEqual('Moon Girl');

        mine.tags = [];
        await expect(gom.save(mine, { replace: ['tags'] })).rejects.toBeInstanceOf(StaleObjectException);
        expect((await gom.load(Tagged, 'moon'))!.tags.map((it) => it.id).sort()).toEqual(['t1', 't2']);
    });

    it('should hand an object without a stamp only the data token of a node that was there', async () => {
        await gom.save(person('moon', 'Moon Girl'));
        const blind = await gom.save(Object.assign(new Tagged(), { person: person('moon'), tags: [] }));
        expect(blind.person.stamp).toMatch(/^[0-9a-f]{16}:$/);
        await expect(gom.save(blind, { replace: ['tags'] })).rejects.toBeInstanceOf(StaleObjectException);
    });

    it('should let exactly one of several writers holding the same stamp save', async () => {
        const loaded = (await gom.save(person('moon', 'Moon Girl'))).stamp;
        const writers = [1, 2, 3, 4, 5].map((n) => Object.assign(person('moon', `Writer ${n}`), { stamp: loaded }));
        const outcomes = await Promise.all(writers.map(async (it) => gom.save(it).then(() => 'saved', (e) => e)));
        expect(outcomes.filter((it) => it === 'saved').length).toEqual(1);
        expect(outcomes.filter((it) => it instanceof StaleObjectException).length).toEqual(4);
    });
});
