import {
    backendFor,
    CascadeType,
    DatabaseRegistry,
    DatabaseType,
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
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';
import { OracleSeed } from '../support/OracleSeed';

@NodeFragment({ labels: ['OraWrite', 'Session'] })
class Session {
    @NodeId() id: string;
    lastActivity?: number | null;
    summary?: string | null;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['OraWrite', 'Message'] })
class Message {
    @NodeId() id: string;
    text?: string;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['OraWrite', 'Person'] })
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

const session = (id: string, fields: Partial<Session> = {}): Session => Object.assign(new Session(), { id, ...fields });
const message = (id: string, text?: string): Message => Object.assign(new Message(), { id, text });

describeOnOracle('writes beside save on Oracle', () => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: OracleSeed;

    beforeAll(() => {
        pm = oraclePersistenceManager();
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.ORACLE), new ModelRegistry());
        seed = new OracleSeed(pm, 'OraWrite');
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
        expect(await gom.edges.loadRelated(nodeRef(Session, 's1'), 'HAS_MESSAGE', Direction.OUTGOING, Message)).toEqual(
            []
        );
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
        expect(await gom.delete(Conversation, 's2', { cascade: CascadeType.DELETE_ORPHAN })).toBe(1);
        expect(await gom.load(Message, 'm3')).toBeUndefined();
        expect(await gom.load(Person, 'ada')).toBeDefined();
        expect(await gom.delete(Conversation, 's1', { cascade: CascadeType.DELETE_ALL })).toBe(1);
        expect(await gom.load(Message, 'm1')).toBeUndefined();
        expect(await gom.load(Person, 'ada')).toBeUndefined();
    });
});
