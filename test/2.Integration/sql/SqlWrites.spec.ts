import {
    backendFor,
    CascadeType,
    DatabaseRegistry,
    Direction,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    nodeRef,
    NodeStamp,
    PersistenceManager,
    RelateMode,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { rawProperty, SqlSeed, sqlPersistenceManager, sqlStores } from '../support/SqlStores';

// Oracle parses each save's PL/SQL block and its statements the first time it sees them, and a suite's first test saves
// first. On fresh containers, beside the suites running in parallel, that test can pass Jest's 5 seconds (#349).
jest.setTimeout(30_000);

@NodeFragment({ labels: ['SqlWrite', 'Session'] })
class Session {
    @NodeId() id: string;
    lastActivity?: number | null;
    summary?: string | null;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['SqlWrite', 'Message'] })
class Message {
    @NodeId() id: string;
    text?: string;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['SqlWrite', 'Person'] })
class Person {
    @NodeId() id: string;
    name?: string;
}

@GraphView()
class Conversation {
    @Root() session: Session;
    @GraphRelationship({ type: 'HAS_MESSAGE', target: () => Message }) messages: Message[] = [];
    @GraphRelationship({ type: 'OWNED_BY', target: () => Person }) owner?: Person;
}

/** People paired either way round with the root: the view a cascade follows a relationship of either direction in. */
@GraphView()
class Pairing {
    @Root() person: Person;
    @GraphRelationship({ type: 'PAIRED', direction: Direction.UNDIRECTED, target: () => Person }) pairs: Person[] = [];
}

/** People a root leads, is mentored by and is paired with: a cascade's steps out, in and either way. */
@GraphView()
class Team {
    @Root() person: Person;
    @GraphRelationship({ type: 'LEADS', target: () => Person }) led: Person[] = [];
    @GraphRelationship({ type: 'MENTORS', direction: Direction.INCOMING, target: () => Person }) mentors: Person[] = [];
    @GraphRelationship({ type: 'PAIRED', direction: Direction.UNDIRECTED, target: () => Person }) pairs: Person[] = [];
}

const session = (id: string, fields: Partial<Session> = {}): Session => Object.assign(new Session(), { id, ...fields });
const message = (id: string, text?: string): Message => Object.assign(new Message(), { id, text });

describe.each(sqlStores())('writes beside save on $name', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: SqlSeed;

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        seed = new SqlSeed(pm, store, 'SqlWrite');
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

    it('should save fragments of several classes in one batch, handing back stamps', async () => {
        const objects = [session('s1', { summary: 'One' }), session('s2'), message('m1', 'Hi')];
        await gom.saveAll(objects);
        expect(objects.every((it) => /^[0-9a-f]{16}:[0-9a-f]{16}$/.test(it.stamp!))).toBe(true);
        expect((await gom.load(Session, 's1'))!.summary).toEqual('One');
        expect((await gom.load(Message, 'm1'))!.stamp).toEqual(objects[2].stamp);
    });

    it('should hand each fragment its own stamp when they are given out of the order they are written in', async () => {
        await gom.save(message('m1', 'Before'));
        const m1 = Object.assign((await gom.load(Message, 'm1'))!, { text: 'One' });
        const objects = [message('m2', 'Two'), session('s1'), m1];
        await gom.saveAll(objects);
        expect(objects[0].stamp).not.toEqual(objects[2].stamp);
        expect(objects.map((it) => it.id)).toEqual(['m2', 's1', 'm1']);
        expect(objects[0].stamp).toEqual((await gom.load(Message, 'm2'))!.stamp);
        expect(objects[2].stamp).toEqual((await gom.load(Message, 'm1'))!.stamp);
        expect(objects[1].stamp).toEqual((await gom.load(Session, 's1'))!.stamp);
    });

    it('should hand a node a batch makes whole stamps, though the batch holds it twice', async () => {
        const objects = [session('twice', { summary: 'a' }), session('twice', { summary: 'b' })];
        await gom.saveAll(objects);
        const stored = (await gom.load(Session, 'twice'))!;
        expect(stored.summary).toEqual('b');
        expect(objects.map((it) => it.stamp)).toEqual([stored.stamp, stored.stamp]);
    });

    it('should patch where a condition holds, with all four outcomes', async () => {
        await gom.save(session('s1', { lastActivity: 100 }));
        const advance = (to: number) => ({
            set: { lastActivity: to },
            where: (q: any) => q.lastActivity.lt(to)
        });
        expect(await gom.patch(Session, 'nobody', advance(200))).toEqual({
            found: false,
            applied: false,
            changed: false
        });
        const before = (await gom.load(Session, 's1'))!.stamp!;
        expect(await gom.patch(Session, 's1', advance(200))).toEqual({ found: true, applied: true, changed: true });
        expect(await gom.patch(Session, 's1', advance(150))).toEqual({ found: true, applied: false, changed: false });
        expect(await gom.patch(Session, 's1', { set: { lastActivity: 200 } })).toEqual({
            found: true,
            applied: true,
            changed: false
        });
        const after = (await gom.load(Session, 's1'))!;
        expect(after.lastActivity).toEqual(200);
        expect(after.stamp!.split(':')[0]).not.toEqual(before.split(':')[0]);
        await gom.patch(Session, 's1', { clear: ['lastActivity'] });
        expect((await gom.load(Session, 's1'))!.lastActivity).toBeUndefined();
    });

    it('should patch where a raw condition holds, a negative number bound in it', async () => {
        await gom.save(session('s1', { lastActivity: 100 }));
        const patched = await gom.patch(Session, 's1', {
            set: { summary: 'patched' },
            where: `${rawProperty(store, 'lastActivity', 'NUMBER')} > 150-$back`,
            bindings: { back: -60 }
        });
        expect(patched).toEqual({ found: true, applied: false, changed: false });
        expect(
            await gom.patch(Session, 's1', {
                set: { summary: 'patched' },
                where: `${rawProperty(store, 'lastActivity', 'NUMBER')} > 150-$back`,
                bindings: { back: 60 }
            })
        ).toEqual({ found: true, applied: true, changed: true });
        // A property written as Cypher writes it is read as that property.
        expect(await gom.patch(Session, 's1', { set: { summary: 'again' }, where: "n.summary = 'other'" })).toEqual({
            found: true,
            applied: false,
            changed: false
        });
        expect(await gom.patch(Session, 's1', { set: { summary: 'again' }, where: "n.summary = 'patched'" })).toEqual({
            found: true,
            applied: true,
            changed: true
        });
    });

    it('should patch many, in order, making none', async () => {
        await gom.saveAll([session('s1', { summary: 'a' }), session('s2', { summary: 'b' })]);
        const results = await gom.patchAll(
            [session('s2', { summary: 'B' }), session('ghost', { summary: 'x' }), session('s1', { summary: 'a' })],
            { only: ['summary'] }
        );
        expect(results).toEqual([
            { found: true, applied: true, changed: true },
            { found: false, applied: false, changed: false },
            { found: true, applied: true, changed: false }
        ]);
        expect((await gom.load(Session, 's2'))!.summary).toEqual('B');
        expect(await gom.load(Session, 'ghost')).toBeUndefined();
    });

    it('should update by loading, changing and saving', async () => {
        await gom.save(session('s1', { summary: 'old' }));
        const updated = await gom.update(Session, 's1', (it) => {
            it.summary = 'new';
        });
        expect(updated!.summary).toEqual('new');
        expect((await gom.load(Session, 's1'))!.summary).toEqual('new');
    });

    it('should relate, unrelate and load related nodes, marking both ends', async () => {
        await gom.saveAll([session('s1'), message('m1'), message('m2')]);
        const stampOf = async (): Promise<string> => (await gom.load(Session, 's1'))!.stamp!;
        const first = await stampOf();
        expect(
            await gom.edges.relate(nodeRef(Session, 's1'), nodeRef(Message, 'm1'), 'HAS_MESSAGE', { order: 1 })
        ).toBe(true);
        const second = await stampOf();
        expect(second.split(':')[1]).not.toEqual(first.split(':')[1]);
        expect(
            await gom.edges.relate(nodeRef(Session, 's1'), nodeRef(Message, 'm1'), 'HAS_MESSAGE', { order: 1 })
        ).toBe(true);
        expect(await stampOf()).toEqual(second);
        await gom.edges.relate(nodeRef(Session, 's1'), nodeRef(Message, 'm2'), 'HAS_MESSAGE', {}, RelateMode.CREATE);
        expect(await gom.edges.relate(nodeRef(Session, 's1'), nodeRef(Message, 'nobody'), 'HAS_MESSAGE')).toBe(false);
        const related = await gom.edges.loadRelated(nodeRef(Session, 's1'), 'HAS_MESSAGE', Direction.OUTGOING, Message);
        expect(related.map((it) => it.id).sort()).toEqual(['m1', 'm2']);
        expect(
            (await gom.edges.loadRelated(nodeRef(Message, 'm1'), 'HAS_MESSAGE', Direction.INCOMING, Session)).map(
                (it) => it.id
            )
        ).toEqual(['s1']);
        expect(await gom.edges.unrelate(nodeRef(Session, 's1'), nodeRef(Message, 'm1'), 'HAS_MESSAGE')).toBe(1);
        expect(await gom.edges.unrelateAll(nodeRef(Session, 's1'), 'HAS_MESSAGE')).toBe(1);
        expect(await gom.edges.unrelate(nodeRef(Session, 's1'), nodeRef(Message, 'nobody'), 'HAS_MESSAGE')).toBe(0);
        expect(await gom.edges.unrelateAll(nodeRef(Session, 'nobody'), 'HAS_MESSAGE')).toBe(0);
        expect(await gom.edges.loadRelated(nodeRef(Session, 's1'), 'HAS_MESSAGE', Direction.OUTGOING, Message)).toEqual(
            []
        );
    });

    it('should load the nodes related either way round, one related to itself once (#588)', async () => {
        const person = (id: string): Person => Object.assign(new Person(), { id });
        await gom.saveAll(['p1', 'p2', 'p3', 'p4'].map(person));
        await gom.edges.relate(nodeRef(Person, 'p1'), nodeRef(Person, 'p2'), 'KNOWS');
        await gom.edges.relate(nodeRef(Person, 'p3'), nodeRef(Person, 'p1'), 'KNOWS');
        await gom.edges.relate(nodeRef(Person, 'p1'), nodeRef(Person, 'p1'), 'KNOWS');
        await gom.edges.relate(nodeRef(Person, 'p2'), nodeRef(Person, 'p4'), 'KNOWS');
        const known = async (id: string): Promise<string[]> =>
            (await gom.edges.loadRelated(nodeRef(Person, id), 'KNOWS', Direction.UNDIRECTED, Person))
                .map((it) => it.id)
                .sort();
        expect(await known('p1')).toEqual(['p1', 'p2', 'p3']);
        expect(await known('p2')).toEqual(['p1', 'p4']);
        expect(await known('p4')).toEqual(['p2']);
    });

    it('should keep, in a cascade, a node one step either way round from a kept one (#588)', async () => {
        const person = (id: string): Person => Object.assign(new Person(), { id });
        await gom.saveAll(['root', 'a', 'b', 'c', 'outside'].map(person));
        const relate = async (from: string, to: string, type: string): Promise<boolean> =>
            gom.edges.relate(nodeRef(Person, from), nodeRef(Person, to), type);
        // The view reaches a, b and c from the root, b stored the other way round.
        await relate('root', 'a', 'PAIRED');
        await relate('b', 'root', 'PAIRED');
        await relate('root', 'c', 'PAIRED');
        await relate('c', 'c', 'PAIRED');
        // a is kept by a node outside the cascade, and b by its pairing with a, stored the other way round from a.
        await relate('a', 'outside', 'KNOWS');
        await relate('b', 'a', 'PAIRED');
        // Every node deleted (#562): root and c.
        expect(await gom.delete(Pairing, 'root', { cascade: CascadeType.DELETE_ORPHAN })).toBe(2);
        const left = async (id: string): Promise<boolean> => (await gom.load(Person, id)) !== undefined;
        expect(await Promise.all(['root', 'a', 'b', 'c', 'outside'].map(left))).toEqual([
            false,
            true,
            true,
            false,
            true
        ]);
    });

    it('should keep, in a cascade that steps either way, a node by a step out or in as stored (#588)', async () => {
        const ids = ['root', 'a', 'b', 'c', 'd', 'f', 'g', 'outside'];
        await gom.saveAll(ids.map((id) => Object.assign(new Person(), { id })));
        const relate = async (from: string, to: string, type: string): Promise<boolean> =>
            gom.edges.relate(nodeRef(Person, from), nodeRef(Person, to), type);
        // The view reaches a, b and c led by the root, d and f its mentors, and g paired with it.
        await Promise.all(['a', 'b', 'c'].map(async (it) => relate('root', it, 'LEADS')));
        await relate('d', 'root', 'MENTORS');
        await relate('f', 'root', 'MENTORS');
        await relate('root', 'g', 'PAIRED');
        // a is kept by a node outside the cascade. From a, b is led and d a mentor, so both are kept; c leads a and f
        // is mentored by a, each stored the other way round from a step of the view, so neither is.
        await relate('a', 'outside', 'KNOWS');
        await relate('a', 'b', 'LEADS');
        await relate('d', 'a', 'MENTORS');
        await relate('c', 'a', 'LEADS');
        await relate('a', 'f', 'MENTORS');
        // Every node deleted (#562): root, c, f and g.
        expect(await gom.delete(Team, 'root', { cascade: CascadeType.DELETE_ORPHAN })).toBe(4);
        const left = async (id: string): Promise<boolean> => (await gom.load(Person, id)) !== undefined;
        expect(Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await left(id)])))).toEqual({
            root: false,
            a: true,
            b: true,
            c: false,
            d: true,
            f: false,
            g: false,
            outside: true
        });
    });

    it('should cascade a delete to every node the view reaches, or to those left with none', async () => {
        const conversation = (id: string, messages: string[], owner: string) =>
            Object.assign(new Conversation(), {
                session: session(id),
                messages: messages.map((it) => message(it)),
                owner: Object.assign(new Person(), { id: owner })
            });
        await gom.save(conversation('s1', ['m1', 'm2'], 'ada'));
        await gom.save(conversation('s2', ['m3'], 'ada'));
        // Every node deleted (#562): s2 and m3, ada kept; then s1, m1, m2 and ada.
        expect(await gom.delete(Conversation, 's2', { cascade: CascadeType.DELETE_ORPHAN })).toBe(2);
        expect(await gom.load(Message, 'm3')).toBeUndefined();
        expect(await gom.load(Person, 'ada')).toBeDefined();
        expect(await gom.delete(Conversation, 's1', { cascade: CascadeType.DELETE_ALL })).toBe(4);
        expect(await gom.load(Message, 'm1')).toBeUndefined();
        expect(await gom.load(Person, 'ada')).toBeUndefined();
    });
});
