import {
    backendFor,
    CascadeType,
    DatabaseType,
    Direction,
    GraphPath,
    GraphRelationship,
    GraphView,
    hop,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    ReadOnly,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { allStores, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { SqlSeed } from '../support/SqlStores';

// Neo4j plans each cascade statement the first time it sees it, and a cascade through a view nested in itself is a dozen
// pattern comprehensions, one for each position at each level: the plan takes most of a test's time, ten times its run,
// and on CI, beside the suites running in parallel, it can pass Jest's 5 seconds.
jest.setTimeout(30_000);

@NodeFragment({ labels: ['RecursiveCascade', 'Session'] })
class Session {
    @NodeId() id: string;
    title?: string;
}

@NodeFragment({ labels: ['RecursiveCascade', 'Message'] })
class Message {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['RecursiveCascade', 'Attachment'] })
class Attachment {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['RecursiveCascade', 'User'] })
class User {
    @NodeId() id: string;
}

@GraphView()
class MessageWithAttachments {
    @Root() message: Message;
    @GraphRelationship({ type: 'HAS_ATTACHMENT', target: () => Attachment }) attachments: Attachment[] = [];
}

/**
 * A Session, its messages, and the sessions PART_OF it, to three levels. Each level holds its own messages, as the root
 * does, so a cascade deletes those at every level, and refuses a tree deeper than three levels rather than leave the
 * rest of it behind.
 */
@GraphView()
class DeletableSessionTree {
    @Root() session: Session;
    @GraphRelationship({ type: 'HAS_MESSAGE', target: () => Message }) messages: Message[] = [];
    @GraphRelationship({
        type: 'PART_OF',
        direction: Direction.INCOMING,
        target: () => DeletableSessionTree,
        maxDepth: 3
    })
    parts: DeletableSessionTree[] = [];
}

/** DeletableSessionTree whose messages are a nested view, so each level reaches its messages' attachments too. */
@GraphView()
class DeletableSessionTreeDeep {
    @Root() session: Session;
    @GraphRelationship({ type: 'HAS_MESSAGE', target: () => MessageWithAttachments })
    messages: MessageWithAttachments[] = [];
    @GraphRelationship({
        type: 'PART_OF',
        direction: Direction.INCOMING,
        target: () => DeletableSessionTreeDeep,
        maxDepth: 3
    })
    parts: DeletableSessionTreeDeep[] = [];
}

/** A session that shelves session trees: the recursive relationship is one view in. */
@GraphView()
class DeletableSessionShelf {
    @Root() session: Session;
    @GraphRelationship({ type: 'SHELVES', target: () => DeletableSessionTree }) trees: DeletableSessionTree[] = [];
}

/** DeletableSessionTree with reviewers it only reads, at every level: a cascade deletes the levels and leaves those. */
@GraphView()
class ReviewedSessionTree {
    @Root() session: Session;
    @GraphRelationship({ type: 'HAS_MESSAGE', target: () => Message }) messages: Message[] = [];
    @ReadOnly() @GraphRelationship({ type: 'REVIEWED_BY', target: () => User }) reviewers: User[] = [];
    @GraphRelationship({
        type: 'PART_OF',
        direction: Direction.INCOMING,
        target: () => ReviewedSessionTree,
        maxDepth: 3
    })
    parts: ReviewedSessionTree[] = [];
}

/** The sessions below a session, as a flat list read over several hops: read-only, as no one relationship holds it. */
@GraphView()
class SessionDescendants {
    @Root() session: Session;
    @GraphRelationship({ type: 'PART_OF', direction: Direction.INCOMING, target: () => Session, maxDepth: 3 })
    below: Session[] = [];
}

/** The users who wrote a session's messages, read over a path of two hops. */
@GraphView()
class SessionAuthors {
    @Root() session: Session;
    @GraphPath([hop('HAS_MESSAGE', Direction.OUTGOING, 'Message'), hop('AUTHORED_BY')], { target: () => User })
    authors: User[] = [];
}

/** A graph to seed: each node by label and id, and each relationship from one id to another. */
interface Graph {
    nodes: [string, string][];
    edges: [string, string, string][];
}

const graph = (nodes: [string, string][], edges: [string, string, string][] = []): Graph => ({ nodes, edges });
const plus = (a: Graph, b: Graph): Graph => graph([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);

/**
 * The tree (PART_OF points child → parent; the view's INCOMING relationship makes them parts): rc-root ← rc-child ←
 * rc-grand, each with a message, and a User the nested messages point at.
 */
const TREE = graph(
    [
        ['User', 'rc-user'],
        ['Session', 'rc-root'],
        ['Message', 'rc-m0'],
        ['Session', 'rc-child'],
        ['Message', 'rc-m1'],
        ['Session', 'rc-grand'],
        ['Message', 'rc-m2']
    ],
    [
        ['rc-root', 'HAS_MESSAGE', 'rc-m0'],
        ['rc-child', 'PART_OF', 'rc-root'],
        ['rc-child', 'HAS_MESSAGE', 'rc-m1'],
        ['rc-grand', 'PART_OF', 'rc-child'],
        ['rc-grand', 'HAS_MESSAGE', 'rc-m2'],
        ['rc-m1', 'AUTHORED_BY', 'rc-user'],
        ['rc-m2', 'SENT_TO', 'rc-user']
    ]
);

/** Sessions rc-s0 ← rc-s1 ← … ← rc-s[levels], each with a message rc-sm[i]: `levels` below the root. */
const chain = (levels: number): Graph =>
    graph(
        Array.from({ length: levels + 1 }, (_, i): [string, string][] => [
            ['Session', `rc-s${i}`],
            ['Message', `rc-sm${i}`]
        ]).flat(),
        Array.from({ length: levels + 1 }, (_, i): [string, string, string][] => [
            [`rc-s${i}`, 'HAS_MESSAGE', `rc-sm${i}`],
            ...(i > 0 ? [[`rc-s${i}`, 'PART_OF', `rc-s${i - 1}`] as [string, string, string]] : [])
        ]).flat()
    );

/**
 * The sessions of a chat store: a user bookmarks a root message, and a message of another session quotes one of a
 * sub-session's. Each attachment hangs off its message alone.
 */
const BOOKMARKED = graph(
    [
        ['User', 'rc-user'],
        ['Session', 'rc-other'],
        ['Message', 'rc-quote'],
        ['Session', 'rc-root'],
        ['Message', 'rc-m0'],
        ['Message', 'rc-m1'],
        ['Attachment', 'rc-a1'],
        ['Session', 'rc-child'],
        ['Message', 'rc-m2'],
        ['Attachment', 'rc-a2'],
        ['Message', 'rc-m3'],
        ['Attachment', 'rc-a3']
    ],
    [
        ['rc-other', 'HAS_MESSAGE', 'rc-quote'],
        ['rc-root', 'HAS_MESSAGE', 'rc-m0'],
        ['rc-root', 'HAS_MESSAGE', 'rc-m1'],
        ['rc-m1', 'HAS_ATTACHMENT', 'rc-a1'],
        ['rc-m1', 'BOOKMARKED_BY', 'rc-user'],
        ['rc-child', 'PART_OF', 'rc-root'],
        ['rc-child', 'HAS_MESSAGE', 'rc-m2'],
        ['rc-m2', 'HAS_ATTACHMENT', 'rc-a2'],
        ['rc-child', 'HAS_MESSAGE', 'rc-m3'],
        ['rc-m3', 'HAS_ATTACHMENT', 'rc-a3'],
        ['rc-quote', 'QUOTES', 'rc-m3']
    ]
);

const treeIds = (tree: DeletableSessionTree): string[] => [
    tree.session.id,
    ...tree.messages.map((it) => it.id),
    ...tree.parts.flatMap(treeIds)
];

const deepTreeIds = (tree: DeletableSessionTreeDeep): string[] => [
    tree.session.id,
    ...tree.messages.flatMap((it) => [it.message.id, ...it.attachments.map((a) => a.id)]),
    ...tree.parts.flatMap(deepTreeIds)
];

/** The ids a delete removed, and the count it returned. */
interface Removed {
    removed: string[];
    deleted: number;
}

const sorted = (ids: Iterable<string>): string[] => [...new Set(ids)].sort();

/**
 * A cascade delete through a view that contains itself deletes what a load of it reads: the nodes at every level and
 * what each level holds, and nothing the view does not declare. A tree deeper than the relationship's maxDepth is
 * refused before anything is written, where the cascade would otherwise leave the levels below it behind. drivine4j's
 * RecursiveCascadeDeleteCrossEngineTest, on every store; DELETE_ORPHAN on all but Memgraph, which has none.
 */
describe.each(allStores())('a cascade through a recursive view on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let sql: SqlSeed | undefined;
    const orphans = engine.type !== DatabaseType.MEMGRAPH;

    const ids = async (): Promise<string[]> => {
        const statement =
            engine.type === DatabaseType.ORACLE
                ? `SELECT JSON_VALUE(n.props, '$.id') AS "id" FROM drivine_node n ` +
                  `WHERE JSON_EXISTS(n.labels, '$?(@ == "RecursiveCascade")')`
                : engine.type === DatabaseType.POSTGRES
                ? `SELECT n.props ->> 'id' AS "id" FROM drivine_node n WHERE n.labels @> '["RecursiveCascade"]'`
                : 'MATCH (n:RecursiveCascade) RETURN n.id AS id';
        const rows = await pm.query<any>(new QuerySpecification(statement));
        return sorted(rows.map((it) => (typeof it === 'object' && it !== null ? it.id : it)));
    };

    const seed = async (it: Graph): Promise<void> => {
        if (sql) {
            for (const [label, id] of it.nodes) {
                await sql.node([label], { id });
            }
            for (const [from, type, to] of it.edges) {
                await sql.edge(from, type, to);
            }
            return;
        }
        const variable = new Map(it.nodes.map(([, id], i) => [id, `v${i}`]));
        const nodes = it.nodes.map(([label, id]) => `(${variable.get(id)}:RecursiveCascade:${label} {id: '${id}'})`);
        const edges = it.edges.map(([from, type, to]) => `(${variable.get(from)})-[:${type}]->(${variable.get(to)})`);
        await pm.execute(new QuerySpecification(`CREATE ${[...nodes, ...edges].join(', ')}`));
    };

    /** Deletes with `remove` and gives the ids it removed, with the count it returned. */
    const removedBy = async (remove: () => Promise<number>): Promise<Removed> => {
        const before = await ids();
        const deleted = await remove();
        const after = await ids();
        return { removed: before.filter((it) => !after.includes(it)), deleted };
    };

    const clear = async (): Promise<void> => {
        if (sql) {
            await sql.clear();
        } else {
            await pm.execute(new QuerySpecification('MATCH (n:RecursiveCascade) DETACH DELETE n'));
        }
    };

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        if (engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES) {
            sql = new SqlSeed(pm, { name: engine.type, type: engine.type }, 'RecursiveCascade');
            await sql.prepare();
        }
    });

    beforeEach(clear);

    afterAll(async () => {
        await clear();
        await closeGraphEngines();
    });

    it('should delete with DELETE_ALL what a load reads at every level', async () => {
        await seed(TREE);
        const loaded = sorted(treeIds((await gom.load(DeletableSessionTree, 'rc-root'))!));
        expect(loaded).toEqual(sorted(['rc-root', 'rc-m0', 'rc-child', 'rc-m1', 'rc-grand', 'rc-m2']));

        const { removed, deleted }: Removed = await removedBy(async () =>
            gom.delete(DeletableSessionTree, 'rc-root', { cascade: CascadeType.DELETE_ALL })
        );

        expect(removed).toEqual(loaded);
        expect(deleted).toEqual(1);
        // The nested messages point at the user, which the view does not declare.
        expect(await ids()).toEqual(['rc-user']);
    });

    it('should reach with DELETE_ALL the nested views at every level', async () => {
        await seed(
            plus(
                TREE,
                graph(
                    [
                        ['Attachment', 'rc-a1'],
                        ['Attachment', 'rc-a2']
                    ],
                    [
                        ['rc-m1', 'HAS_ATTACHMENT', 'rc-a1'],
                        ['rc-m2', 'HAS_ATTACHMENT', 'rc-a2'],
                        ['rc-a2', 'AUTHORED_BY', 'rc-user']
                    ]
                )
            )
        );
        const tree = sorted(['rc-root', 'rc-m0', 'rc-child', 'rc-m1', 'rc-a1', 'rc-grand', 'rc-m2', 'rc-a2']);
        expect(sorted(deepTreeIds((await gom.load(DeletableSessionTreeDeep, 'rc-root'))!))).toEqual(tree);

        const { removed }: Removed = await removedBy(async () =>
            gom.delete(DeletableSessionTreeDeep, 'rc-root', { cascade: CascadeType.DELETE_ALL })
        );

        expect(removed).toEqual(tree);
        expect(await ids()).toEqual(['rc-user']);
    });

    it('should reach with DELETE_ALL a recursive view one view in', async () => {
        await seed(plus(TREE, graph([['Session', 'rc-shelf']], [['rc-shelf', 'SHELVES', 'rc-root']])));
        const loaded = sorted(['rc-shelf', ...treeIds((await gom.load(DeletableSessionTree, 'rc-root'))!)]);

        const { removed }: Removed = await removedBy(async () =>
            gom.delete(DeletableSessionShelf, 'rc-shelf', { cascade: CascadeType.DELETE_ALL })
        );

        expect(removed).toEqual(loaded);
    });

    it('should delete a tree of exactly maxDepth, and a ring', async () => {
        // Exactly maxDepth levels below the root: nothing is left below, so nothing is refused.
        await seed(chain(3));
        const loaded = sorted(treeIds((await gom.load(DeletableSessionTree, 'rc-s0'))!));
        expect(loaded.length).toEqual(8);
        expect(
            (
                await removedBy(async () =>
                    gom.delete(DeletableSessionTree, 'rc-s0', { cascade: CascadeType.DELETE_ALL })
                )
            ).removed
        ).toEqual(loaded);

        // A ring of four: one level past maxDepth comes back to the root, which the cascade starts from.
        await seed(plus(chain(3), graph([], [['rc-s0', 'PART_OF', 'rc-s3']])));
        expect(sorted(treeIds((await gom.load(DeletableSessionTree, 'rc-s0'))!))).toEqual(loaded);
        expect(
            (
                await removedBy(async () =>
                    gom.delete(DeletableSessionTree, 'rc-s0', { cascade: CascadeType.DELETE_ALL })
                )
            ).removed
        ).toEqual(loaded);
    });

    it('should delete through a shelf a ring that comes back to the tree it shelves', async () => {
        // One level past maxDepth is the shelved tree again: a node the cascade takes, so nothing is refused.
        await seed(
            plus(
                chain(3),
                graph(
                    [['Session', 'rc-shelf']],
                    [
                        ['rc-s0', 'PART_OF', 'rc-s3'],
                        ['rc-shelf', 'SHELVES', 'rc-s0']
                    ]
                )
            )
        );
        const loaded = sorted(['rc-shelf', ...treeIds((await gom.load(DeletableSessionTree, 'rc-s0'))!)]);

        const { removed }: Removed = await removedBy(async () =>
            gom.delete(DeletableSessionShelf, 'rc-shelf', { cascade: CascadeType.DELETE_ALL })
        );

        expect(removed).toEqual(loaded);
    });

    it('should refuse a cascade through a tree deeper than maxDepth, deleting nothing', async () => {
        // Four levels below the root, one past maxDepth = 3.
        await seed(plus(chain(4), graph([['Session', 'rc-shelf']], [['rc-shelf', 'SHELVES', 'rc-s0']])));
        const seeded = await ids();

        for (const cascade of orphans
            ? [CascadeType.DELETE_ALL, CascadeType.DELETE_ORPHAN]
            : [CascadeType.DELETE_ALL]) {
            await expect(gom.delete(DeletableSessionTree, 'rc-s0', { cascade })).rejects.toThrow(
                "Cannot cascade-delete DeletableSessionTree 'rc-s0': DeletableSessionTree.parts reaches 3 levels deep " +
                    '(maxDepth = 3), and 1 node below that would be left behind. Raise maxDepth on parts to cover the ' +
                    'deepest level. Nothing was deleted.'
            );
            // The recursive relationship one view in is checked from where the shelf reaches it.
            await expect(gom.delete(DeletableSessionShelf, 'rc-shelf', { cascade })).rejects.toThrow(
                "DeletableSessionShelf 'rc-shelf': DeletableSessionTree.parts reaches 3 levels deep"
            );
            expect(await ids()).toEqual(seeded);
        }

        // The check reads the roots the delete would: a predicate that matches nothing refuses nothing.
        expect(
            await gom.delete(DeletableSessionTree, 'rc-s0', {
                where: (q) => q.session.title.eq('archived'),
                cascade: CascadeType.DELETE_ALL
            })
        ).toEqual(0);
        expect(await ids()).toEqual(seeded);
        // Without a cascade the delete takes the root alone, as it always has.
        expect(await gom.delete(DeletableSessionTree, 'rc-s0')).toEqual(1);
    });

    describe('what a cascade follows', () => {
        // drivine4j's StatelessSaveSoundnessContract: a cascade follows only the relationships a save writes.
        const cascades = orphans ? [CascadeType.DELETE_ALL, CascadeType.DELETE_ORPHAN] : [CascadeType.DELETE_ALL];

        it('should leave the nodes of a read-only field, and delete every level of a view nested in itself', async () => {
            const reviewed = plus(
                TREE,
                graph(
                    [['User', 'rc-reviewer']],
                    [
                        ['rc-root', 'REVIEWED_BY', 'rc-reviewer'],
                        ['rc-grand', 'REVIEWED_BY', 'rc-reviewer']
                    ]
                )
            );
            for (const cascade of cascades) {
                await clear();
                await seed(reviewed);
                const loaded = (await gom.load(ReviewedSessionTree, 'rc-root'))!;
                expect(loaded.reviewers.map((it) => it.id)).toEqual(['rc-reviewer']);
                expect(loaded.parts[0].parts[0].reviewers.map((it) => it.id)).toEqual(['rc-reviewer']);

                const { removed }: Removed = await removedBy(async () =>
                    gom.delete(ReviewedSessionTree, 'rc-root', { cascade })
                );

                if (cascade === CascadeType.DELETE_ALL) {
                    expect(removed).toEqual(sorted(['rc-root', 'rc-m0', 'rc-child', 'rc-m1', 'rc-grand', 'rc-m2']));
                } else {
                    // The reviewer is outside the cascade, so it keeps rc-grand, with its message; rc-user keeps rc-m1.
                    expect(removed).toEqual(['rc-child', 'rc-m0', 'rc-root']);
                }
                expect(await ids()).toContain('rc-reviewer');
            }
        });

        it('should leave the nodes of a list read over several hops', async () => {
            for (const cascade of cascades) {
                await clear();
                await seed(chain(2));
                const loaded = (await gom.load(SessionDescendants, 'rc-s0'))!;
                expect(sorted(loaded.below.map((it) => it.id))).toEqual(['rc-s1', 'rc-s2']);

                const { removed }: Removed = await removedBy(async () =>
                    gom.delete(SessionDescendants, 'rc-s0', { cascade })
                );

                expect(removed).toEqual(['rc-s0']);
            }
        });

        it('should not follow a path field as one relationship', async () => {
            // The path's first hop leads straight to a user here: taken as one relationship, the user would go.
            const authored = graph(
                [
                    ['Session', 'rc-root'],
                    ['Message', 'rc-m0'],
                    ['User', 'rc-user'],
                    ['User', 'rc-author']
                ],
                [
                    ['rc-root', 'HAS_MESSAGE', 'rc-user'],
                    ['rc-root', 'HAS_MESSAGE', 'rc-m0'],
                    ['rc-m0', 'AUTHORED_BY', 'rc-author']
                ]
            );
            for (const cascade of cascades) {
                await clear();
                await seed(authored);
                expect((await gom.load(SessionAuthors, 'rc-root'))!.authors.map((it) => it.id)).toEqual(['rc-author']);

                const { removed }: Removed = await removedBy(async () =>
                    gom.delete(SessionAuthors, 'rc-root', { cascade })
                );

                expect(removed).toEqual(['rc-root']);
            }
        });
    });

    (orphans ? describe : describe.skip)('DELETE_ORPHAN', () => {
        it('should keep a nested node something outside the view refers to', async () => {
            await seed(TREE);
            const loaded = sorted(treeIds((await gom.load(DeletableSessionTree, 'rc-root'))!));

            const { removed, deleted }: Removed = await removedBy(async () =>
                gom.delete(DeletableSessionTree, 'rc-root', { cascade: CascadeType.DELETE_ORPHAN })
            );

            // The nested messages are kept: the user outside the view still refers to each. The sessions are deleted,
            // though each relates to its own messages and parts: those are in the cascade.
            expect(removed).toEqual(loaded.filter((it) => it !== 'rc-m1' && it !== 'rc-m2'));
            expect(deleted).toEqual(1);
            expect(await ids()).toEqual(['rc-m1', 'rc-m2', 'rc-user']);
        });

        it('should delete a ring back to its root', async () => {
            // A ring of three: the parts come back to the root at the last level, and with it the root's message.
            await seed(plus(chain(2), graph([], [['rc-s0', 'PART_OF', 'rc-s2']])));
            const loaded = sorted(treeIds((await gom.load(DeletableSessionTree, 'rc-s0'))!));
            expect(loaded.length).toEqual(6);

            const { removed, deleted }: Removed = await removedBy(async () =>
                gom.delete(DeletableSessionTree, 'rc-s0', { cascade: CascadeType.DELETE_ORPHAN })
            );

            expect(removed).toEqual(loaded);
            expect(deleted).toEqual(1);
        });

        it('should keep what a kept node holds', async () => {
            await seed(BOOKMARKED);

            const { removed }: Removed = await removedBy(async () =>
                gom.delete(DeletableSessionTreeDeep, 'rc-root', { cascade: CascadeType.DELETE_ORPHAN })
            );

            // The bookmarked and the quoted message are kept whole, with their attachments; their sessions go.
            expect(removed).toEqual(sorted(['rc-root', 'rc-m0', 'rc-child', 'rc-m2', 'rc-a2']));
            expect(await ids()).toEqual(
                sorted(['rc-user', 'rc-other', 'rc-quote', 'rc-m1', 'rc-a1', 'rc-m3', 'rc-a3'])
            );
        });

        it('should keep a kept sub-session whole', async () => {
            // A sub-session of the sub-session, and a pin on the sub-session from outside.
            await seed(
                plus(
                    BOOKMARKED,
                    graph(
                        [
                            ['Session', 'rc-grand'],
                            ['Message', 'rc-m4']
                        ],
                        [
                            ['rc-grand', 'PART_OF', 'rc-child'],
                            ['rc-grand', 'HAS_MESSAGE', 'rc-m4'],
                            ['rc-child', 'PINNED_BY', 'rc-user']
                        ]
                    )
                )
            );

            const { removed }: Removed = await removedBy(async () =>
                gom.delete(DeletableSessionTreeDeep, 'rc-root', { cascade: CascadeType.DELETE_ORPHAN })
            );

            // The pinned sub-session keeps everything below it, at every level; only the root's own go.
            expect(removed).toEqual(['rc-m0', 'rc-root']);
        });

        it('should keep a chain longer than the view below a kept node', async () => {
            // A sub-session that is also part of the root directly: the parts below a pinned one form a chain six steps
            // long, longer than the view's fields taken to their depths one after another, and the rule keeps it all.
            await seed(
                graph(
                    [
                        ['User', 'rc-user'],
                        ['Session', 'rc-root'],
                        ['Message', 'rc-m0'],
                        ...[0, 1, 2, 3, 4, 5].map((i): [string, string] => ['Session', `rc-n${i}`]),
                        ['Message', 'rc-m5']
                    ],
                    [
                        ['rc-root', 'HAS_MESSAGE', 'rc-m0'],
                        ['rc-n0', 'PART_OF', 'rc-root'],
                        ['rc-n1', 'PART_OF', 'rc-n0'],
                        ['rc-n2', 'PART_OF', 'rc-n1'],
                        ['rc-n3', 'PART_OF', 'rc-n2'],
                        ['rc-n3', 'PART_OF', 'rc-root'],
                        ['rc-n4', 'PART_OF', 'rc-n3'],
                        ['rc-n5', 'PART_OF', 'rc-n4'],
                        ['rc-n5', 'HAS_MESSAGE', 'rc-m5'],
                        ['rc-n0', 'PINNED_BY', 'rc-user']
                    ]
                )
            );

            const { removed }: Removed = await removedBy(async () =>
                gom.delete(DeletableSessionTree, 'rc-root', { cascade: CascadeType.DELETE_ORPHAN })
            );

            // rc-n0 is pinned, and each of rc-n1 … rc-n5 and rc-m5 is one step below the one before it.
            expect(removed).toEqual(['rc-m0', 'rc-root']);
        });
    });
});
