import {
    CascadeType,
    CypherBackend,
    cypherGrammarFor,
    DatabaseType,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['DeleteTest', 'Session'] })
class Session {
    @NodeId() id: string;
    state: string;
}

@NodeFragment({ labels: ['DeleteTest', 'Message'] })
class Message {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['DeleteTest', 'Attachment'] })
class Attachment {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['DeleteTest', 'User'] })
class User {
    @NodeId() id: string;
}

@GraphView()
class MessageView {
    @Root() message: Message;
    @GraphRelationship({ type: 'ATTACHES', target: () => Attachment }) attachments: Attachment[];
}

@GraphView()
class SessionView {
    @Root() session: Session;
    @GraphRelationship({ type: 'OWNED_BY', required: true }) owner: User;
    @GraphRelationship({ type: 'HAS', target: () => MessageView }) messages: MessageView[];
}

describe.each(graphEngines())('StatelessGraphObjectManager deletes on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const ids = async (): Promise<string[]> =>
        (await pm.query<string>(new QuerySpecification('MATCH (n:DeleteTest) RETURN n.id AS id ORDER BY id'))).sort();

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, new CypherBackend(cypherGrammarFor(engine.type)), new ModelRegistry());
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:DeleteTest) DETACH DELETE n'));
        // s1 owns m1 (with attachments a1, shared) and m2. shared is also attached to m3, outside the session.
        // s2 has no owner, so it is not a SessionView.
        await pm.execute(
            new QuerySpecification(
                "CREATE (s1:DeleteTest:Session {id: 's1', state: 'closed'}), (u:DeleteTest:User {id: 'u'}), " +
                    "(m1:DeleteTest:Message {id: 'm1'}), (m2:DeleteTest:Message {id: 'm2'}), (m3:DeleteTest:Message {id: 'm3'}), " +
                    "(a1:DeleteTest:Attachment {id: 'a1'}), (shared:DeleteTest:Attachment {id: 'shared'}), " +
                    "(s2:DeleteTest:Session {id: 's2', state: 'open'}), " +
                    '(s1)-[:OWNED_BY]->(u), (s1)-[:HAS]->(m1), (s1)-[:HAS]->(m2), ' +
                    '(m1)-[:ATTACHES]->(a1), (m1)-[:ATTACHES]->(shared), (m3)-[:ATTACHES]->(shared)'
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:DeleteTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should delete a fragment by id, with its relationships', async () => {
        expect(await gom.delete(Message, 'm1')).toEqual(1);
        expect(await ids()).not.toContain('m1');
        expect(await ids()).toContain('a1');
        expect(await gom.delete(Message, 'm1')).toEqual(0);
    });

    it('should delete by id only when the predicate holds', async () => {
        expect(await gom.delete(Session, 's1', { where: 'n.state = $state', bindings: { state: 'open' } })).toEqual(0);
        expect(await gom.delete(Session, 's1', { where: 'n.state = $state', bindings: { state: 'closed' } })).toEqual(1);
    });

    it('should delete all that match, or all', async () => {
        expect(await gom.deleteAll(Session, 'n.state = $state', { state: 'open' })).toEqual(1);
        expect(await ids()).not.toContain('s2');
        expect(await gom.deleteAll(Attachment)).toEqual(2);
    });

    it('should delete only a view root that meets the view’s requirements', async () => {
        expect(await gom.delete(SessionView, 's2')).toEqual(0);
        expect(await gom.deleteAll(SessionView)).toEqual(1);
        expect(await ids()).toEqual(['a1', 'm1', 'm2', 'm3', 's2', 'shared', 'u']);
    });

    it('should delete a view’s root only, by default', async () => {
        expect(await gom.delete(SessionView, 's1')).toEqual(1);
        expect(await ids()).toEqual(['a1', 'm1', 'm2', 'm3', 's2', 'shared', 'u']);
    });

    it('should delete every node the view reaches with DELETE_ALL', async () => {
        expect(await gom.delete(SessionView, 's1', { cascade: CascadeType.DELETE_ALL })).toEqual(1);
        expect(await ids()).toEqual(['m3', 's2']);
    });

    it('should delete what is left with no relationship with DELETE_ORPHAN', async () => {
        if (engine.type === DatabaseType.MEMGRAPH) {
            await expect(gom.delete(SessionView, 's1', { cascade: CascadeType.DELETE_ORPHAN })).rejects.toThrow(
                /DELETE_ORPHAN is not available on Memgraph/
            );
            return;
        }
        expect(await gom.delete(SessionView, 's1', { cascade: CascadeType.DELETE_ORPHAN })).toEqual(1);
        // u and m2 are left with nothing; m1 still attaches a1 and shared, and shared is attached to m3.
        expect(await ids()).toEqual(['a1', 'm1', 'm3', 's2', 'shared']);
    });

    it('should refuse a cascade on a fragment', async () => {
        await expect(gom.delete(Session, 's1', { cascade: CascadeType.DELETE_ALL })).rejects.toThrow(/is a @NodeFragment/);
    });
});
