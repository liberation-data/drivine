import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
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
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';
import { OracleSeed } from '../support/OracleSeed';

@NodeFragment({ labels: ['OraSave', 'Person'] })
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

@NodeFragment({ labels: ['OraSave', 'Tag'] })
class Tag {
    @NodeId() id: string;
    @NodeStamp() stamp?: string;
}

/** A bag and no @NodeLabels: a save merges its properties in place, as Oracle then keeps them (OSON version 2). */
@NodeFragment({ labels: ['OraSave', 'Note'] })
class Note {
    @NodeId() id: string;
    @PropertyBag() metadata: Record<string, any> = {};
}

@NodeFragment({ labels: ['OraSave', 'Org'] })
class Org {
    @NodeId() id: string;
    name?: string;
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

describeOnOracle('saves on Oracle', () => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: OracleSeed;

    beforeAll(() => {
        pm = oraclePersistenceManager();
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.ORACLE), new ModelRegistry());
        seed = new OracleSeed(pm, 'OraSave');
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
        const raw = await pm.getOne<any>(
            new QuerySpecification(
                // Re-encoded: the thin driver can't read a document updated in place (oracle/node-oracledb#1796).
                `SELECT JSON_TRANSFORM(n.props, KEEP '$') AS "props" FROM drivine_node n ` +
                    `WHERE JSON_EXISTS(n.labels, '$?(@ == "OraSave")')`
            )
        );
        expect(raw).toEqual({
            id: 'ada',
            name: 'Ada Lovelace',
            born_in: 1815,
            'metadata.source': 'wiki',
            '__drivine.labels.tags': []
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
});
