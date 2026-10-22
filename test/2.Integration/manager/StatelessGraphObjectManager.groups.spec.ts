import {
    anyOf,
    avg,
    count,
    backendFor,
    DatabaseType,
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
import { clearLabels, closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { SqlSeed, SqlStore, sqlStores } from '../support/SqlStores';

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

describe.each([...graphEngines(), ...sqlStores()])('groups on $type', (engine) => {
    const oracle = engine.type === DatabaseType.ORACLE;
    const postgres = engine.type === DatabaseType.POSTGRES;
    /** A raw filter in the store's own language: Cypher over n, or SQL over the row n on Oracle and on Postgres. */
    const raw = (cypher: string, oracleSql: string, postgresSql: string): string =>
        oracle ? oracleSql : postgres ? postgresSql : cypher;
    const month = "CAST(n.props ->> 'month' AS numeric)";
    const hasPage = raw('n.page IS NOT NULL', "JSON_EXISTS(n.props, '$.page')", "(n.props -> 'page') IS NOT NULL");
    const helpful = raw(
        'n.helpful = true',
        "JSON_EXISTS(n.props, '$?(@.helpful == true)')",
        "(n.props -> 'helpful') = 'true'::jsonb"
    );
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        if (oracle || postgres) {
            const seed = new SqlSeed(pm, engine as SqlStore, 'GroupTest');
            await seed.prepare();
            await seed.clear();
            await seedSql(seed);
            return;
        }
        await clearLabels(pm, engine, 'GroupTest');
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
        await clearLabels(pm, engine, 'GroupTest');
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
            where: hasPage,
            keys: { page: key('page') },
            aggregates: { votes: count(), likes: count(helpful) }
        });
        expect(all).toEqual([
            { page: '/agents', votes: 2, likes: 1 },
            { page: '/install', votes: 3, likes: 2 }
        ]);
        const march = await gom.groups.load(Feedback, {
            where: raw(
                'n.page IS NOT NULL AND n.month >= $march',
                `${hasPage} AND JSON_EXISTS(n.props, '$?(@.month >= $m)' PASSING $march AS "m")`,
                `${hasPage} AND ${month} >= $march`
            ),
            bindings: { march: 3 },
            keys: { page: key('page') },
            aggregates: { votes: count(), likes: count(helpful) }
        });
        expect(march).toEqual([
            { page: '/agents', votes: 2, likes: 1 },
            { page: '/install', votes: 2, likes: 1 }
        ]);
        const busy = await gom.groups.load(Feedback, {
            where: raw(
                'n.page IS NOT NULL AND n.month >= 3',
                `${hasPage} AND JSON_EXISTS(n.props, '$?(@.month >= 3)')`,
                `${hasPage} AND ${month} >= 3`
            ),
            keys: { page: key('page') },
            aggregates: { votes: count() },
            having: [['votes', 'gte', 3]]
        });
        expect(busy).toEqual([]);
    });

    it('should sum, average and find extremes, skipping missing values', async () => {
        const stats = await gom.groups.load(Feedback, {
            where: hasPage,
            keys: { page: key('page') },
            aggregates: {
                total: sum('score'),
                mean: avg('score'),
                low: min('score'),
                high: max('score'),
                helpfulTotal: sum(
                    'score',
                    raw(
                        'n.helpful = true AND n.month > 5',
                        `${helpful} AND JSON_EXISTS(n.props, '$?(@.month > 5)')`,
                        `${helpful} AND ${month} > 5`
                    )
                ),
                helpfulMean: avg(
                    'score',
                    raw(
                        'n.helpful = true AND n.month > 5',
                        `${helpful} AND JSON_EXISTS(n.props, '$?(@.month > 5)')`,
                        `${helpful} AND ${month} > 5`
                    )
                )
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

    it('should take a query over the references: typed keys, aggregates and conditions', async () => {
        const march = await gom.groups.load(Feedback, (q) => ({
            where: [q.page.isNotNull(), q.month.gte(3)],
            keys: { page: key(q.page) },
            aggregates: {
                votes: count(),
                likes: count(q.helpful.eq(true)),
                best: max(q.score, anyOf(q.helpful.eq(true), q.score.lt(2)))
            }
        }));
        expect(march).toEqual([
            { page: '/agents', votes: 2, likes: 1, best: 2 },
            { page: '/install', votes: 2, likes: 1, best: 4 }
        ]);
        // The key is typed as its property: a string.
        const page: string | undefined = march[0].page;
        expect(page?.startsWith('/')).toBe(true);
        const tokens = await gom.groups.load(Message, (q) => ({
            keys: { user: pathKey(User, [hop('HAS_MESSAGE', Direction.INCOMING, 'ChatSession'), hop('OWNED_BY')]) },
            aggregates: { tokens: sum(q.tokens, q.tokens.gt(6)) },
            orderBy: [['tokens', 'desc']]
        }));
        expect(tokens.map((it) => [it.user.id, it.tokens])).toEqual([
            ['ada', 10],
            ['bob', 7]
        ]);
    });
});

/** The graph the Cypher seed writes, written into a SQL store's tables. */
async function seedSql(seed: SqlSeed): Promise<void> {
    const feedback: [string, Record<string, any>][] = [
        ['f1', { page: '/install', helpful: true, month: 1, score: 5 }],
        ['f2', { page: '/install', helpful: true, month: 3, score: 4 }],
        ['f3', { page: '/install', helpful: false, month: 3 }],
        ['f4', { page: '/agents', helpful: true, month: 3, score: 2 }],
        ['f5', { page: '/agents', helpful: false, month: 3, score: 1 }],
        ['f6', { helpful: false, month: 3 }]
    ];
    for (const [id, props] of feedback) {
        await seed.node(['Feedback'], { id, ...props });
    }
    await seed.node(['User'], { id: 'ada', username: 'Ada' });
    await seed.node(['User'], { id: 'bob' });
    await seed.node(['User'], { id: 'cy' });
    for (const id of ['s1', 's2', 's3']) {
        await seed.node(['ChatSession'], { id });
    }
    await seed.node(['Message'], { id: 'm1', tokens: 10 });
    await seed.node(['Message'], { id: 'm2', tokens: 5 });
    await seed.node(['Message'], { id: 'm3', tokens: 7 });
    await seed.edge('s1', 'OWNED_BY', 'ada');
    await seed.edge('s2', 'OWNED_BY', 'ada');
    await seed.edge('s3', 'OWNED_BY', 'bob');
    await seed.edge('s1', 'HAS_MESSAGE', 'm1');
    await seed.edge('s2', 'HAS_MESSAGE', 'm1');
    await seed.edge('s1', 'HAS_MESSAGE', 'm2');
    await seed.edge('s3', 'HAS_MESSAGE', 'm3');
}
