import {
    avg,
    count,
    CypherBackend,
    cypherGrammarFor,
    Direction,
    hop,
    key,
    max,
    min,
    ModelRegistry,
    NodeFragment,
    NodeId,
    pathKey,
    PersistenceManager,
    QuerySpecification,
    StatelessGraphObjectManager,
    sum
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['GroupTest', 'Feedback'] })
class Feedback {
    @NodeId() id: string;
    page?: string;
    helpful?: boolean;
    month?: number;
    score?: number;
}

@NodeFragment({ labels: ['GroupTest', 'Message'] })
class Message {
    @NodeId() id: string;
    tokens?: number;
}

@NodeFragment({ labels: ['GroupTest', 'User'] })
class User {
    @NodeId() id: string;
    username?: string;
}

describe.each(graphEngines())('groups on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
        await pm.execute(new QuerySpecification('MATCH (n:GroupTest) DETACH DELETE n'));
        await pm.execute(
            new QuerySpecification(
                "CREATE (:GroupTest:Feedback {id: 'f1', page: '/install', helpful: true, month: 1, score: 5}), " +
                    "(:GroupTest:Feedback {id: 'f2', page: '/install', helpful: true, month: 3, score: 4}), " +
                    "(:GroupTest:Feedback {id: 'f3', page: '/install', helpful: false, month: 3}), " +
                    "(:GroupTest:Feedback {id: 'f4', page: '/agents', helpful: true, month: 3, score: 2}), " +
                    "(:GroupTest:Feedback {id: 'f5', page: '/agents', helpful: false, month: 3, score: 1}), " +
                    "(:GroupTest:Feedback {id: 'f6', helpful: false, month: 3}), " +
                    // ada owns two sessions, one of which holds m1 by two relationships; bob owns one; cy owns none.
                    "(ada:GroupTest:User {id: 'ada', username: 'Ada'}), (bob:GroupTest:User {id: 'bob'}), (:GroupTest:User {id: 'cy'}), " +
                    "(s1:GroupTest:ChatSession {id: 's1'})-[:OWNED_BY]->(ada), (s2:GroupTest:ChatSession {id: 's2'})-[:OWNED_BY]->(ada), " +
                    "(s3:GroupTest:ChatSession {id: 's3'})-[:OWNED_BY]->(bob), " +
                    "(s1)-[:HAS_MESSAGE]->(m1:GroupTest:Message {id: 'm1', tokens: 10}), (s2)-[:HAS_MESSAGE]->(m1), " +
                    "(s1)-[:HAS_MESSAGE]->(:GroupTest:Message {id: 'm2', tokens: 5}), " +
                    "(s3)-[:HAS_MESSAGE]->(:GroupTest:Message {id: 'm3', tokens: 7})"
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:GroupTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should count by a property, with nodes that lack it under undefined', async () => {
        const votes = await gom.groups.countBy(Feedback, 'page');
        expect(votes).toEqual(
            new Map<any, number>([
                [undefined, 1],
                ['/agents', 2],
                ['/install', 3]
            ])
        );
    });

    it('should give several numbers per group, and keep the three filters apart', async () => {
        const all = await gom.groups.load(Feedback, {
            where: 'n.page IS NOT NULL',
            keys: { page: key('page') },
            aggregates: { votes: count(), likes: count('n.helpful = true') }
        });
        expect(all).toEqual([
            { page: '/agents', votes: 2, likes: 1 },
            { page: '/install', votes: 3, likes: 2 }
        ]);
        const march = await gom.groups.load(Feedback, {
            where: 'n.page IS NOT NULL AND n.month >= $march',
            bindings: { march: 3 },
            keys: { page: key('page') },
            aggregates: { votes: count(), likes: count('n.helpful = true') }
        });
        expect(march).toEqual([
            { page: '/agents', votes: 2, likes: 1 },
            { page: '/install', votes: 2, likes: 1 }
        ]);
        const busy = await gom.groups.load(Feedback, {
            where: 'n.page IS NOT NULL AND n.month >= 3',
            keys: { page: key('page') },
            aggregates: { votes: count() },
            having: [['votes', 'gte', 3]]
        });
        expect(busy).toEqual([]);
    });

    it('should sum, average and find extremes, skipping missing values', async () => {
        const stats = await gom.groups.load(Feedback, {
            where: 'n.page IS NOT NULL',
            keys: { page: key('page') },
            aggregates: {
                total: sum('score'),
                mean: avg('score'),
                low: min('score'),
                high: max('score'),
                helpfulTotal: sum('score', 'n.helpful = true AND n.month > 5'),
                helpfulMean: avg('score', 'n.helpful = true AND n.month > 5')
            }
        });
        expect(stats).toEqual([
            { page: '/agents', total: 3, mean: 1.5, low: 1, high: 2, helpfulTotal: 0, helpfulMean: undefined },
            { page: '/install', total: 9, mean: 4.5, low: 4, high: 5, helpfulTotal: 0, helpfulMean: undefined }
        ]);
    });

    it('should group by a node reached through a path, counting each source once per group', async () => {
        const ranking = await gom.groups.load(Message, {
            keys: { user: pathKey(User, [hop('HAS_MESSAGE', Direction.INCOMING, 'ChatSession'), hop('OWNED_BY')]) },
            aggregates: { messages: count(), tokens: sum('tokens') },
            orderBy: [['messages', 'desc']]
        });
        expect(ranking.map((it) => [it.user.id, it.messages, it.tokens])).toEqual([
            ['ada', 2, 15],
            ['bob', 1, 7]
        ]);
        expect(ranking[0].user).toBeInstanceOf(User);
        expect(ranking[0].user.username).toEqual('Ada');
    });

    it('should order, break ties by the keys, and page', async () => {
        const top = await gom.groups.load(Feedback, {
            keys: { month: key('month') },
            aggregates: { votes: count() },
            orderBy: [['votes', 'desc']],
            limit: 1
        });
        expect(top).toEqual([{ month: 3, votes: 5 }]);
        const second = await gom.groups.load(Feedback, {
            keys: { helpful: key('helpful') },
            aggregates: { votes: count() },
            orderBy: [['votes', 'asc']],
            skip: 1
        });
        expect(second).toEqual([{ helpful: true, votes: 3 }]);
    });
});
