import {
    anyOf,
    RootRefs,
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
    QuerySpecification,
    Root,
    StaleObjectException,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['PatchTest', 'Session'] })
class Session {
    @NodeId() id: string;
    @GraphProperty('last_activity') lastActivity?: number | null;
    summary?: string | null;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['PatchTest', 'Message'] })
class Message {
    @NodeId() id: string;
    narration?: string;
    embedding?: number[] | null;
}

@GraphView()
class MessageInSession {
    @Root() message: Message;
    @GraphRelationship({ type: 'IN', target: () => Session }) session?: Session;
}

describe.each(graphEngines())('patch and patchAll on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const stamp = async (id: string): Promise<string | null> =>
        pm.getOne<string | null>(
            new QuerySpecification('MATCH (n:PatchTest {id: $id}) RETURN n.`__drivine.stamp`').bind({ id })
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
        await pm.execute(new QuerySpecification('MATCH (n:PatchTest) DETACH DELETE n'));
        await gom.save(Object.assign(new Session(), { id: 's1', lastActivity: 100, summary: 'Hello' }));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:PatchTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    describe('patch', () => {
        const advance = (to: number) => ({
            set: { lastActivity: to },
            where: 'n.last_activity IS NULL OR n.last_activity < $to',
            bindings: { to }
        });

        it('should say no node was found, and make none', async () => {
            expect(await gom.patch(Session, 'nobody', advance(200))).toEqual({
                found: false,
                applied: false,
                changed: false
            });
            expect(await gom.count(Session)).toEqual(1);
        });

        it('should leave the node and its stamp alone when the condition does not hold', async () => {
            const before = await stamp('s1');
            expect(await gom.patch(Session, 's1', advance(50))).toEqual({
                found: true,
                applied: false,
                changed: false
            });
            expect((await gom.load(Session, 's1'))!.lastActivity).toEqual(100);
            expect(await stamp('s1')).toEqual(before);
        });

        it('should keep the stamp when every value was already as set', async () => {
            const before = await stamp('s1');
            expect(await gom.patch(Session, 's1', { set: { lastActivity: 100 } })).toEqual({
                found: true,
                applied: true,
                changed: false
            });
            expect(await stamp('s1')).toEqual(before);
        });

        it('should write, under the graph name, and renew the data token when a value differs', async () => {
            const before = (await stamp('s1'))!;
            expect(await gom.patch(Session, 's1', advance(200))).toEqual({ found: true, applied: true, changed: true });
            expect((await gom.load(Session, 's1'))!.lastActivity).toEqual(200);
            const after = (await stamp('s1'))!;
            expect(after.split(':')[0]).not.toEqual(before.split(':')[0]);
            expect(after.split(':')[1]).toEqual(before.split(':')[1]);
        });

        it('should make an object loaded before the patch stale', async () => {
            const loaded = (await gom.load(Session, 's1'))!;
            await gom.patch(Session, 's1', { set: { summary: 'Patched' } });
            loaded.summary = 'Mine';
            await expect(gom.save(loaded)).rejects.toBeInstanceOf(StaleObjectException);
        });

        it('should clear a field, and refuse the id, the stamp, or a field named twice', async () => {
            await gom.patch(Session, 's1', { clear: ['summary'] });
            expect((await gom.load(Session, 's1'))!.summary).toBeUndefined();
            await expect(gom.patch(Session, 's1', { set: { id: 'x' } })).rejects.toThrow(/can't write id/);
            await expect(gom.patch(Session, 's1', { set: { stamp: 'x' } })).rejects.toThrow(/can't write stamp/);
            await expect(gom.patch(Session, 's1', { set: { summary: 'x' }, clear: ['summary'] })).rejects.toThrow(
                /once/
            );
        });

        it('should patch a view’s root where a condition names its relationship', async () => {
            await gom.save(
                Object.assign(new MessageInSession(), {
                    message: Object.assign(new Message(), { id: 'm1' }),
                    session: Object.assign(new Session(), { id: 's1' })
                })
            );
            await gom.save(Object.assign(new Message(), { id: 'm2' }));
            const inSession = cypherGrammarFor(engine.type).existenceCheck("(n)-[:IN]->(:Session {id: 's1'})");
            const narrate = { set: { narration: 'Once upon a time' }, where: inSession };
            expect((await gom.patch(MessageInSession, 'm1', narrate)).applied).toBe(true);
            expect(await gom.patch(MessageInSession, 'm2', narrate)).toEqual({
                found: true,
                applied: false,
                changed: false
            });
            expect((await gom.load(Message, 'm1'))!.narration).toEqual('Once upon a time');
        });

        it('should patch where a condition over the references holds', async () => {
            const advanceTo = (to: number) => ({
                set: { lastActivity: to },
                where: (q: RootRefs<Session>) => anyOf(q.lastActivity.isNull(), q.lastActivity.lt(to))
            });
            expect((await gom.patch(Session, 's1', advanceTo(200))).applied).toBe(true);
            expect((await gom.patch(Session, 's1', advanceTo(150))).applied).toBe(false);
            expect((await gom.load(Session, 's1'))!.lastActivity).toEqual(200);
            await gom.save(
                Object.assign(new MessageInSession(), {
                    message: Object.assign(new Message(), { id: 'm1' }),
                    session: Object.assign(new Session(), { id: 's1' })
                })
            );
            const narrate = (session: string) => ({
                set: { narration: 'Told' },
                where: (q: RootRefs<MessageInSession>) => q.session.id.eq(session)
            });
            expect((await gom.patch(MessageInSession, 'm1', narrate('s2'))).applied).toBe(false);
            expect((await gom.patch(MessageInSession, 'm1', narrate('s1'))).applied).toBe(true);
        });
    });

    describe('patchAll', () => {
        const message = (id: string, fields: Partial<Message>): Message =>
            Object.assign(new Message(), { id, ...fields });

        beforeEach(async () => {
            await gom.save(message('m1', { narration: 'One', embedding: [1, 1] }));
            await gom.save(message('m2', { narration: 'Two', embedding: [2, 2] }));
        });

        it('should write the named fields where each node is, in order, and make none', async () => {
            const results = await gom.patchAll(
                [
                    message('m2', { embedding: [9, 9], narration: 'X' }),
                    message('gone', { embedding: [0] }),
                    message('m1', { embedding: [1, 1] })
                ],
                { only: ['embedding'] }
            );
            expect(results).toEqual([
                { found: true, applied: true, changed: true },
                { found: false, applied: false, changed: false },
                { found: true, applied: true, changed: false }
            ]);
            expect(await gom.load(Message, 'm2')).toEqual(message('m2', { narration: 'Two', embedding: [9, 9] }));
            expect(await gom.load(Message, 'gone')).toBeUndefined();
        });

        it('should write every field but those in except, and clear nulls only under CLEAR', async () => {
            await gom.patchAll([message('m1', { narration: 'Changed', embedding: null })], { except: ['embedding'] });
            expect(await gom.load(Message, 'm1')).toEqual(message('m1', { narration: 'Changed', embedding: [1, 1] }));
            await gom.patchAll([message('m1', { embedding: null })], { only: ['embedding'] });
            expect((await gom.load(Message, 'm1'))!.embedding).toEqual([1, 1]);
            await gom.patchAll([message('m1', { embedding: null })], {
                only: ['embedding'],
                nullPolicy: NullPolicy.CLEAR
            });
            expect((await gom.load(Message, 'm1'))!.embedding).toBeUndefined();
        });

        it('should refuse a call without only or except, or with an id twice', async () => {
            await expect(gom.patchAll([message('m1', {})], {})).rejects.toThrow(/needs only or except/);
            await expect(gom.patchAll([message('m1', {}), message('m1', {})], { only: ['narration'] })).rejects.toThrow(
                /each id once/
            );
        });
    });
});
