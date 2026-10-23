import {
    backendFor,
    DatabaseType,
    DatabaseRegistry,
    Direction,
    GraphProperty,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeLabels,
    NodeStamp,
    NullPolicy,
    PersistenceManager,
    PropertyBag,
    QuerySpecification,
    RelationshipFragment,
    RemovedTargets,
    Root,
    StaleObjectException,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { rawProps, SqlSeed, sqlPersistenceManager, sqlStores } from '../support/SqlStores';

@NodeFragment({ labels: ['SqlSave', 'Person'] })
class Person {
    @NodeId() id: string;
    name?: string | null;
    @GraphProperty('born_in') born?: number;
    @NodeStamp() stamp?: string;
    @PropertyBag() metadata: Record<string, any> = {};
    @NodeLabels() tags: string[] = [];
}

@NodeFragment({ labels: ['Pilot'] })
class Pilot extends Person {}

@NodeFragment({ labels: ['SqlSave', 'Tag'] })
class Tag {
    @NodeId() id: string;
    @NodeStamp() stamp?: string;
}

/** A bag and no @NodeLabels: a save merges its properties in place, as Oracle then keeps them (OSON version 2). */
@NodeFragment({ labels: ['SqlSave', 'Note'] })
class Note {
    @NodeId() id: string;
    @PropertyBag() metadata: Record<string, any> = {};
}

/** A flat bag beside a stamp, a prefixed bag, and a field stored under another name. */
@NodeFragment({ labels: ['SqlSave', 'Sticker'] })
class Sticker {
    @NodeId() id: string;
    @GraphProperty('sticker_name') name?: string;
    @PropertyBag() meta: Record<string, any> = {};
    @PropertyBag({ flat: true }) extras: Record<string, any> = {};
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['SqlSave', 'Org'] })
class Org {
    @NodeId() id: string;
    name?: string;
}

/** A closed @NodeLabels field: it owns only its members. */
@NodeFragment({ labels: ['SqlSave', 'Badge'] })
class Badge {
    @NodeId() id: string;
    @NodeLabels(['Gold', 'Silver']) levels: string[] = [];
}

@RelationshipFragment()
class Job {
    role: string;
    @TargetNode() org: Org;
}

@GraphView()
class Career {
    @Root() person: Person;
    @GraphRelationship({ type: 'TAGGED', target: () => Tag }) tagList: Tag[] = [];
    @GraphRelationship({ type: 'WORKS_FOR', target: () => Job }) jobs: Job[] = [];
    @GraphRelationship({ type: 'MENTORED_BY', target: () => Person }) mentor?: Person;
}

@GraphView()
class Team {
    @Root() org: Org;
    @GraphRelationship({ type: 'WORKS_FOR', direction: Direction.INCOMING, target: () => Career }) members: Career[] =
        [];
}

const person = (id: string, fields: Partial<Person> = {}): Person => Object.assign(new Person(), { id, ...fields });
const tag = (id: string): Tag => Object.assign(new Tag(), { id });
const career = (fields: Partial<Career>): Career => Object.assign(new Career(), fields);

describe.each(sqlStores())('saves on $name', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: SqlSeed;

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        seed = new SqlSeed(pm, store, 'SqlSave');
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

    it('should save a fragment, hand back a whole stamp, and keep the data token when nothing changed', async () => {
        const ada = await gom.save(person('ada', { name: 'Ada', born: 1815, metadata: { source: 'wiki' } }));
        expect(ada.stamp).toMatch(/^[0-9a-f]{16}:[0-9a-f]{16}$/);
        const loaded = (await gom.load(Person, 'ada'))!;
        expect(loaded).toEqual(
            person('ada', { name: 'Ada', born: 1815, stamp: ada.stamp, metadata: { source: 'wiki' } })
        );
        const again = await gom.save(loaded);
        expect(again.stamp).toEqual(ada.stamp);
        loaded.name = 'Ada Lovelace';
        const changed = await gom.save(loaded);
        expect(changed.stamp!.split(':')[0]).not.toEqual(ada.stamp!.split(':')[0]);
        expect(changed.stamp!.split(':')[1]).toEqual(ada.stamp!.split(':')[1]);
        const raw = await pm.getOne<any>(new QuerySpecification(rawProps(store, 'SqlSave')));
        expect(raw.props ?? raw).toEqual({
            id: 'ada',
            name: 'Ada Lovelace',
            born_in: 1815,
            'metadata.source': 'wiki',
            // An open label field's record of the labels it holds: drivine4j's write function removes one that is empty.
            ...(store.type === DatabaseType.ORACLE ? { '__drivine.labels.tags': [] } : {})
        });
    });

    it('should refuse a stale save, and one of a deleted node, writing nothing', async () => {
        const mine = await gom.save(person('bob', { name: 'Bob' }));
        const theirs = (await gom.load(Person, 'bob'))!;
        theirs.name = 'Theirs';
        await gom.save(theirs);
        mine.name = 'Mine';
        const refusal = await gom.save(mine).catch((e) => e);
        expect(refusal).toBeInstanceOf(StaleObjectException);
        expect(refusal.deleted).toBe(false);
        expect((await gom.load(Person, 'bob'))!.name).toEqual('Theirs');
        await gom.delete(Person, 'bob');
        const gone = await gom.save(mine).catch((e) => e);
        expect(gone.deleted).toBe(true);
        expect(await gom.load(Person, 'bob')).toBeUndefined();
    });

    it('should refuse a flat bag entry that a field, the id, another bag or the stamp is stored under, writing nothing', async () => {
        const sticker = (extras: Record<string, any>): Sticker =>
            Object.assign(new Sticker(), { id: 's1', name: 'Star', extras });
        for (const key of ['sticker_name', 'id', 'meta.lang', '__drivine.stamp']) {
            await expect(gom.save(sticker({ [key]: 'x' }))).rejects.toThrow(
                new RegExp(`Sticker.extras has an entry '${key}', which is the property of a declared field`)
            );
            await expect(gom.save(sticker({ [key]: 'x' }), { only: ['extras'] })).rejects.toThrow(
                /which is the property/
            );
        }
        expect(await gom.load(Sticker, 's1')).toBeUndefined();
        const saved = await gom.save(sticker({ name: 'open' }));
        const loaded = (await gom.load(Sticker, 's1'))!;
        expect(loaded.extras).toEqual({ name: 'open' });
        expect(loaded.stamp).toEqual(saved.stamp);
    });

    it('should check a save from the object as loaded against the stamp it was loaded with', async () => {
        await gom.save(person('dee', { name: 'Dee' }));
        const loaded = (await gom.load(Person, 'dee'))!;

        // Built anew, without the stamp: checked as what it was loaded from, and handed the new stamp.
        const saved = await gom.save(person('dee', { name: 'Dee Dee' }), { from: loaded });
        expect((await gom.load(Person, 'dee'))!.name).toEqual('Dee Dee');
        expect(saved.stamp).not.toEqual(loaded.stamp);

        await expect(gom.save(person('dee', { name: 'Late' }), { from: loaded })).rejects.toThrow(StaleObjectException);
        await expect(gom.save(person('dee', { name: 'Late' }), { from: person('dee') })).rejects.toThrow(
            /carries no stamp/
        );
        expect((await gom.load(Person, 'dee'))!.name).toEqual('Dee Dee');
    });

    it('should let exactly one of several writers holding one stamp win', async () => {
        const base = await gom.save(person('cy', { name: 'Cy' }));
        const writers = [1, 2, 3, 4, 5].map((i) => person('cy', { name: `Writer ${i}`, stamp: base.stamp }));
        const results = await Promise.allSettled(writers.map(async (it) => gom.save(it)));
        expect(results.filter((it) => it.status === 'fulfilled')).toHaveLength(1);
        expect(
            results
                .filter((it) => it.status === 'rejected')
                .every((it: any) => it.reason instanceof StaleObjectException)
        ).toBe(true);
    });

    it('should create only what is not there', async () => {
        expect(await gom.create(person('dee', { name: 'Dee' }))).toBeDefined();
        expect(await gom.create(person('dee', { name: 'Other' }))).toBeUndefined();
        expect((await gom.load(Person, 'dee'))!.name).toEqual('Dee');
    });

    it('should clear nulls under CLEAR, and write only the fields named', async () => {
        await gom.save(person('eve', { name: 'Eve', born: 1990 }));
        await gom.save(person('eve', { name: null }), { nullPolicy: NullPolicy.CLEAR, only: ['name'] });
        expect(await gom.load(Person, 'eve')).toMatchObject({ id: 'eve', born: 1990 });
        expect((await gom.load(Person, 'eve'))!.name).toBeUndefined();
        await gom.save(person('eve', { name: 'Eve', born: 2000 }), { except: ['born'] });
        expect(await gom.load(Person, 'eve')).toMatchObject({ name: 'Eve', born: 1990 });
    });

    it('should save labels a @NodeLabels field holds, and a subclass with its own', async () => {
        await gom.save(person('fay', { tags: ['Speaker', 'Author'] }));
        expect((await gom.load(Person, 'fay'))!.tags.sort()).toEqual(['Author', 'Speaker']);
        await gom.save(person('fay', { tags: ['Speaker'] }), { nullPolicy: NullPolicy.CLEAR });
        expect((await gom.load(Person, 'fay'))!.tags).toEqual(['Speaker']);
        await gom.save(Object.assign(new Pilot(), { id: 'gus', name: 'Gus' }));
        expect(await gom.load(Person, 'gus')).toBeInstanceOf(Pilot);
    });

    it('should save a view with its relationships, relationship fragments and a nested single', async () => {
        const saved = await gom.save(
            career({
                person: person('hal', { name: 'Hal' }),
                tagList: [tag('t1'), tag('t2')],
                jobs: [
                    Object.assign(new Job(), {
                        role: 'lead',
                        org: Object.assign(new Org(), { id: 'acme', name: 'Acme' })
                    })
                ],
                mentor: person('ida', { name: 'Ida' })
            })
        );
        expect(saved.tagList.every((it) => /:/.test(it.stamp!))).toBe(true);
        const hal = (await gom.load(Career, 'hal'))!;
        expect(hal.tagList.map((it) => it.id).sort()).toEqual(['t1', 't2']);
        expect(hal.jobs.map((it) => [it.role, it.org.name])).toEqual([['lead', 'Acme']]);
        expect(hal.mentor!.name).toEqual('Ida');
        const team = (await gom.load(Team, 'acme'))!;
        expect(team.members.map((it) => it.person.id)).toEqual(['hal']);
        const beforeStamp = hal.person.stamp;
        await gom.save(hal);
        expect((await gom.load(Career, 'hal'))!.person.stamp).toEqual(beforeStamp);
    });

    it('should replace a list, deleting removed targets nothing else refers to', async () => {
        await gom.save(career({ person: person('jo'), tagList: [tag('t1'), tag('t2'), tag('t3')] }));
        await gom.save(career({ person: person('kim'), tagList: [tag('t3')] }));
        const jo = (await gom.load(Career, 'jo'))!;
        const loadedStamp = jo.person.stamp;
        jo.tagList = jo.tagList.filter((it) => it.id === 't1');
        await gom.save(jo, { replace: ['tagList'], removedTargets: RemovedTargets.DELETE_UNREFERENCED });
        expect((await gom.load(Career, 'jo'))!.tagList.map((it) => it.id)).toEqual(['t1']);
        expect(await gom.load(Tag, 't2')).toBeUndefined();
        expect(await gom.load(Tag, 't3')).toBeDefined();
        const stale = career({ person: person('jo', { stamp: loadedStamp }), tagList: [] });
        await expect(gom.save(stale, { replace: ['tagList'] })).rejects.toBeInstanceOf(StaleObjectException);
    });

    it('should replace a list of views, keeping the views whose roots the list still holds', async () => {
        const member = (id: string): Career => career({ person: person(id) });
        const acme = Object.assign(new Org(), { id: 'acme', name: 'Acme' });
        await gom.save(Object.assign(new Team(), { org: acme, members: [member('lu'), member('mo')] }));
        const team = (await gom.load(Team, 'acme'))!;
        team.members = team.members.filter((it) => it.person.id === 'mo');
        await gom.save(team, { replace: ['members'] });
        expect((await gom.load(Team, 'acme'))!.members.map((it) => it.person.id)).toEqual(['mo']);
    });

    it('should hand a related node the save makes its whole stamp, though the view holds it twice', async () => {
        const saved = await gom.save(career({ person: person('pat'), tagList: [tag('both'), tag('both')] }));
        const stored = (await gom.load(Tag, 'both'))!.stamp;
        expect(saved.tagList.map((it) => it.stamp)).toEqual([stored, stored]);
    });

    it('should save a batch whose stamps run past 4000 characters', async () => {
        await gom.saveAll(Array.from({ length: 300 }, (_, i) => tag(`t${i}`)));
        expect(await gom.count(Tag)).toEqual(300);
    });

    it('should clear under CLEAR a node saved more than once, as Oracle then keeps it', async () => {
        const note = (metadata: Record<string, any>): Note => Object.assign(new Note(), { id: 'n1', metadata });
        await gom.save(note({ source: 'wiki', rank: 1 }));
        await gom.save(note({ source: 'wiki', rank: 2 }));
        await gom.save(note({ rank: 3 }), { nullPolicy: NullPolicy.CLEAR });
        expect((await gom.load(Note, 'n1'))!.metadata).toEqual({ rank: 3 });
    });

    it('should refuse replace of a fragment or a field it names wrongly, replace all from scratch, and create of a loaded node', async () => {
        await expect(gom.save(person('ann'), { replace: ['tags'] })).rejects.toThrow(/is a @NodeFragment/);
        await expect(gom.save(career({ person: person('ann') }), { replace: 'all' })).rejects.toThrow(
            /replace: 'all' needs a Career whose root carries a stamp/
        );
        await expect(gom.save(career({ person: person('ann') }), { replace: ['nope' as any] })).rejects.toThrow(
            /not a relationship field of Career/
        );
        await expect(
            gom.save(career({ person: person('ann'), tagList: null as any }), { replace: ['tagList'] })
        ).rejects.toThrow(/Give an empty list/);
        const ann = await gom.save(person('ann'));
        await expect(gom.create(ann)).rejects.toThrow(/carries a stamp was loaded/);
        expect(await gom.count(Person)).toEqual(1);
    });

    it('should replace every list of a loaded view with replace all', async () => {
        await gom.save(career({ person: person('ned'), tagList: [tag('t1'), tag('t2')], mentor: person('ola') }));
        const ned = (await gom.load(Career, 'ned'))!;
        ned.tagList = [];
        ned.mentor = undefined;
        await gom.save(ned, { replace: 'all' });
        const replaced = (await gom.load(Career, 'ned'))!;
        expect(replaced.tagList).toEqual([]);
        expect(replaced.mentor).toBeUndefined();
        expect(await gom.load(Tag, 't1')).toBeDefined();
    });

    it('should save a closed @NodeLabels field, dropping under CLEAR a member it no longer holds', async () => {
        const badge = (levels: string[]): Badge => Object.assign(new Badge(), { id: 'b1', levels });
        await gom.save(badge(['Gold', 'Silver']));
        await gom.save(badge(['Silver']), { nullPolicy: NullPolicy.CLEAR });
        expect((await gom.load(Badge, 'b1'))!.levels).toEqual(['Silver']);
        await expect(gom.save(badge(['Bronze']))).rejects.toThrow(/holds Bronze, which its labels don't include/);
        await expect(gom.save(person('ray', { tags: ['__drivine.x'] }))).rejects.toThrow(/begins '__drivine.'/);
    });

    it("should make a related node held as a subclass with the subclass's labels", async () => {
        await gom.save(
            career({ person: person('sam'), mentor: Object.assign(new Pilot(), { id: 'tia', name: 'Tia' }) })
        );
        expect((await gom.load(Career, 'sam'))!.mentor).toBeInstanceOf(Pilot);
    });
});
