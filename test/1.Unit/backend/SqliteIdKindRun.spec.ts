import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    Direction,
    DrivineError,
    FullTextIndex,
    count,
    GraphObjectManagerFactory,
    GraphPath,
    GraphProperty,
    GraphRelationship,
    GraphView,
    key,
    ModelRegistry,
    NodeFragment,
    NodeId,
    nodeRef,
    NodeStamp,
    pathKey,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    RelationshipFragment,
    Root,
    SchemaCatalog,
    SchemaManager,
    StatelessGraphObjectManager,
    TargetNode,
    TransactionContextHolder,
    VectorIndex
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['IdKindRun', 'Keyed'] })
class LookupDateAsText {
    @NodeId() id: string;
    name?: string;
    @FullTextIndex() body?: string;
    @VectorIndex({ dimensions: 2 }) embedding?: number[];
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['IdKindRun', 'Keyed'] })
class LookupDateAsNumber {
    @NodeId() id: number;
    name?: string;
}

@NodeFragment({ labels: ['IdKindRun', 'Keyed'] })
class LookupDateAsBigInt {
    @NodeId() id: bigint;
}

@NodeFragment({ labels: ['IdKindRun', 'Keyed'] })
class LookupDateAsBoolean {
    @NodeId() id: boolean;
}

/** An id the user didn't type: TypeScript records `Object`, so it is not refused (as drivine-python's `Any`). */
@NodeFragment({ labels: ['IdKindRun', 'Keyed'] })
class LookupDateAsAny {
    @NodeId() id: any;
    name?: string;
}

/** An id declared a union: TypeScript records `Object` too. */
@NodeFragment({ labels: ['IdKindRun', 'Keyed'] })
class LookupDateAsUnion {
    @NodeId() id: string | Date;
}

@NodeFragment({ labels: ['IdKindRun', 'Keyed'] })
class LookupDateAsDate {
    @NodeId() id: Date;
    name?: string;
}

/** An id stored under another name: refused by its field's name. */
@NodeFragment({ labels: ['IdKindRun', 'Renamed'] })
class RenamedId {
    @NodeId() @GraphProperty('key') id: string;
}

@NodeFragment({ labels: ['IdKindRun', 'Base'] })
class BaseKeyed {
    @NodeId() id: string;
}

/** A subclass inheriting its @NodeId: TypeScript records the id's type on the base's prototype. */
@NodeFragment({ labels: ['IdKindRun', 'Base', 'Sub'] })
class SubKeyed extends BaseKeyed {
    name?: string;
}

enum Code {
    A = 'a'
}

/** A string enum: TypeScript records `String`. */
@NodeFragment({ labels: ['IdKindRun', 'Keyed'] })
class LookupDateAsEnum {
    @NodeId() id: Code;
}

@NodeFragment({ labels: ['IdKindRun', 'Owner'] })
class Owner {
    @NodeId() id: string;
    name?: string;
}

@GraphView()
class KeyedView {
    @Root() keyed: LookupDateAsText;
}

@RelationshipFragment()
class Ownership {
    since?: string;
    @TargetNode() keyed: LookupDateAsText;
}

@GraphView()
class Owned {
    @Root() owner: Owner;
    @GraphRelationship({ type: 'OWNS', target: () => LookupDateAsText }) keyed: LookupDateAsText[];
}

@GraphView()
class OwnedNested {
    @Root() owner: Owner;
    @GraphRelationship({ type: 'OWNS', target: () => KeyedView }) views: KeyedView[];
}

@GraphView()
class OwnedByFragment {
    @Root() owner: Owner;
    @GraphRelationship({ type: 'OWNS', target: () => Ownership }) ownerships: Ownership[];
}

@GraphView()
class OwnedByPath {
    @Root() owner: Owner;
    @GraphPath([{ type: 'OWNS' }], { target: () => LookupDateAsText }) reached: LookupDateAsText[];
}

/** Each temporal kind an id may be held as, as Cypher writes it, and the text the read gives it as. */
const KINDS = [
    { kind: 'date', cypher: "date('2026-01-05')", text: '2026-01-05' },
    { kind: 'datetime', cypher: "datetime('2026-01-05T10:11:12Z')", text: '2026-01-05T10:11:12Z' },
    { kind: 'datetime', cypher: "datetime('2026-01-05T10:11:12+02:00')", text: '2026-01-05T10:11:12+02:00' },
    { kind: 'localdatetime', cypher: "localdatetime('2026-01-05T10:11:12')", text: '2026-01-05T10:11:12' },
    { kind: 'time', cypher: "time('10:11:12+02:00')", text: '10:11:12+02:00' },
    { kind: 'duration', cypher: "duration('P1DT2H')", text: 'P1DT2H' }
];

const refusal = (type: string, declared: string, text: string, kind: string): string =>
    `${type}'s @NodeId id is declared a ${declared}, but the node whose id is '${text}' holds it as a ${kind}: ` +
    `declare id as a ${kind} to load it.`;

/**
 * A node whose @NodeId is held as a temporal tag, loaded by a class that declares the id a non-temporal scalar, on
 * SQLite, which Node bundles, so no container (#813). The read gives the id as its text, which a lookup by id misses,
 * as it compares the id's kind too: a save of what was loaded made a second node. Every read that maps a node now
 * refuses it, by name, before anything is written.
 */
describe('A @NodeId held as a temporal, declared a non-temporal scalar, on SQLite', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-id-kind-'));
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ databaseType: DatabaseType.SQLITE, host: '', databaseName: path.join(folder, 'g.db') })
            .register('idKind');
        pm = new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
            'idKind',
            'NON_TRANSACTIONAL'
        );
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.SQLITE), new ModelRegistry());
        const factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
        await new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, LookupDateAsText).forDatabase('idKind')]
        }).enforce();
    });

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        fs.rmSync(folder, { recursive: true, force: true });
    });

    /**
     * The owner, owning one Keyed node whose id `cypher` gives: saved by the object manager with a text id, so its
     * vector and text are written as a save writes them, then given the id by Cypher, as another writer would.
     */
    const reset = async (cypher: string): Promise<void> => {
        await pm.execute(new QuerySpecification({ text: 'MATCH (n:IdKindRun) DETACH DELETE n', language: 'CYPHER' }));
        await gom.save(
            Object.assign(new OwnedByFragment(), {
                owner: Object.assign(new Owner(), { id: 'o', name: 'owner' }),
                ownerships: [
                    Object.assign(new Ownership(), {
                        since: 'always',
                        keyed: Object.assign(new LookupDateAsText(), {
                            id: 'seed',
                            name: 'x',
                            body: 'zebra grass',
                            embedding: [1, 0]
                        })
                    })
                ]
            })
        );
        await pm.execute(
            new QuerySpecification({
                text: `MATCH (n:IdKindRun:Keyed {id: 'seed'}) SET n.id = ${cypher}`,
                language: 'CYPHER'
            })
        );
    };

    /** Every node and edge of the run as the store holds it: the same before and after a refused read. */
    const stored = async (): Promise<string[]> =>
        pm.query<string>(
            new QuerySpecification<string>({
                text:
                    "SELECT labels || ' ' || props FROM drivine_node WHERE labels LIKE '%IdKindRun%' " +
                    "UNION ALL SELECT type || ' ' || props FROM drivine_edge ORDER BY 1",
                language: 'SQL'
            })
        );

    const keyedCount = async (): Promise<number> => gom.count(LookupDateAsAny);

    describe.each(KINDS)('held as $cypher', ({ kind, cypher, text }: (typeof KINDS)[number]) => {
        beforeEach(async () => reset(cypher));

        const asText = refusal('LookupDateAsText', 'string', text, kind);

        // Each read that maps a row into a model goes through GraphObjectMapper.properties(), which refuses.
        const paths: [string, () => Promise<unknown>, string][] = [
            ['loadAll', async () => gom.loadAll(LookupDateAsText), asText],
            [
                'loadAll with a where',
                async () => gom.loadAll(LookupDateAsText, (q) => ({ where: q.name.eq('x') })),
                asText
            ],
            [
                'loadAll of a number id',
                async () => gom.loadAll(LookupDateAsNumber),
                refusal('LookupDateAsNumber', 'number', text, kind)
            ],
            [
                'loadAll of a bigint id',
                async () => gom.loadAll(LookupDateAsBigInt),
                refusal('LookupDateAsBigInt', 'bigint', text, kind)
            ],
            [
                'loadAll of a boolean id',
                async () => gom.loadAll(LookupDateAsBoolean),
                refusal('LookupDateAsBoolean', 'boolean', text, kind)
            ],
            ['loadNearest', async () => gom.loadNearest(LookupDateAsText, [1, 0], { topK: 1 }), asText],
            ['loadMatching', async () => gom.loadMatching(LookupDateAsText, 'zebra', { topK: 1 }), asText],
            [
                'edges.loadRelated',
                async () => gom.edges.loadRelated(nodeRef(Owner, 'o'), 'OWNS', Direction.OUTGOING, LookupDateAsText),
                asText
            ],
            [
                "a grouped read's path key",
                async () =>
                    gom.groups.load(Owner, {
                        keys: { keyed: pathKey(LookupDateAsText, [{ type: 'OWNS' }]) },
                        aggregates: { all: count() }
                    }),
                asText
            ],
            [
                'loadAll of a string enum id',
                async () => gom.loadAll(LookupDateAsEnum),
                refusal('LookupDateAsEnum', 'string', text, kind)
            ],
            ["a view's root", async () => gom.loadAll(KeyedView), asText],
            ["a view's related node, by load", async () => gom.load(Owned, 'o'), asText],
            ["a view's related node, by loadAll", async () => gom.loadAll(Owned), asText],
            ['a nested view', async () => gom.load(OwnedNested, 'o'), asText],
            ["a relationship fragment's node", async () => gom.load(OwnedByFragment, 'o'), asText],
            ["a path's node", async () => gom.load(OwnedByPath, 'o'), asText],
            [
                "update's load",
                async () =>
                    gom.update(Owned, 'o', (it) => {
                        it.owner.name = 'changed';
                    }),
                asText
            ]
        ];

        it.each(paths)('refuses %s by name, and writes nothing', async (_, read, message) => {
            const before = await stored();
            const failure: any = await read().catch((it: unknown) => it);
            expect(failure).toBeInstanceOf(DrivineError);
            expect(failure.message).toEqual(message);
            expect(await stored()).toEqual(before);
        });

        it("misses the node by the id's text, so a load by id finds nothing to refuse", async () => {
            expect(await gom.load(LookupDateAsText, text)).toBeUndefined();
            expect(
                await gom.update(LookupDateAsText, text, (it) => {
                    it.name = 'changed';
                })
            ).toBeUndefined();
            expect(await keyedCount()).toEqual(1);
        });

        it('made a second node when an object as the load gave it was saved: what the refusal prevents', async () => {
            // The object a load gave before #813: the id the read's text, which the save's lookup misses.
            await gom.save(Object.assign(new LookupDateAsText(), { id: text, name: 'resaved' }));
            expect(await keyedCount()).toEqual(2);
        });

        // Not refused, as the user didn't type the id, and left open as the Date over a date below: the save writes the
        // text, which its lookup misses, so it makes a second node. Fails while that holds.
        it.failing('saves an id declared any back onto the same node', async () => {
            const [any] = await gom.loadAll(LookupDateAsAny);
            await gom.save(Object.assign(any, { name: 'resaved' }));
            expect(await keyedCount()).toEqual(1);
        });

        it('groups the nodes by their properties, as no node is mapped', async () => {
            const groups = await gom.groups.load(LookupDateAsText, {
                keys: { name: key('name') },
                aggregates: { all: count() }
            });
            expect(groups).toEqual([{ name: 'x', all: 1 }]);
            expect(await gom.groups.countBy(LookupDateAsText, 'id')).toEqual(new Map([[text, 1]]));
        });

        it('refuses an id stored under another name, by its field', async () => {
            await pm.execute(
                new QuerySpecification({ text: `CREATE (:IdKindRun:Renamed {key: ${cypher}})`, language: 'CYPHER' })
            );
            await expect(gom.loadAll(RenamedId)).rejects.toThrow(refusal('RenamedId', 'string', text, kind));
        });

        it('refuses a subclass that inherits its @NodeId', async () => {
            await pm.execute(
                new QuerySpecification({ text: `CREATE (:IdKindRun:Base:Sub {id: ${cypher}})`, language: 'CYPHER' })
            );
            await expect(gom.loadAll(SubKeyed)).rejects.toThrow(refusal('SubKeyed', 'string', text, kind));
        });

        it('loads an id declared any, or a union, as the text the read gives, as before', async () => {
            const [any] = await gom.loadAll(LookupDateAsAny);
            expect(any.id).toEqual(text);
            const [union] = await gom.loadAll(LookupDateAsUnion);
            expect(union.id).toEqual(text);
        });
    });

    describe('declared a Date', () => {
        it('held as a datetime: loads as a Date, and saves back onto the same node', async () => {
            await reset("datetime('2026-01-05T10:11:12Z')");
            const [loaded] = await gom.loadAll(LookupDateAsDate);
            expect(loaded.id).toEqual(new Date('2026-01-05T10:11:12Z'));
            await gom.save(Object.assign(loaded, { name: 'resaved' }));
            expect((await gom.loadAll(LookupDateAsDate)).map((it) => it.name)).toEqual(['resaved']);
            await gom.update(LookupDateAsDate, loaded.id, (it) => {
                it.name = 'updated';
            });
            expect((await gom.load(LookupDateAsDate, loaded.id))?.name).toEqual('updated');
            expect(await keyedCount()).toEqual(1);
        });

        // As the date below: a Date binds as a datetime at UTC to the millisecond, which a lookup of a node whose id is
        // held otherwise misses, so the save makes a second node (#815). Fails while that holds.
        it.failing.each([
            "datetime('2026-01-05T10:11:12+02:00')",
            "datetime('2026-01-05T10:11:12.123456789Z')",
            "localdatetime('2026-01-05T10:11:12')"
        ])('held as %s: saves back onto the same node', async (cypher) => {
            await reset(cypher);
            const [loaded] = await gom.loadAll(LookupDateAsDate);
            await gom.save(Object.assign(loaded, { name: 'resaved' }));
            expect(await keyedCount()).toEqual(1);
        });

        it('held as a date: loads as a Date, not refused', async () => {
            await reset("date('2026-01-05')");
            const [loaded] = await gom.loadAll(LookupDateAsDate);
            expect(loaded.id).toEqual(new Date('2026-01-05T00:00:00Z'));
        });

        // Not #813's refusal, and left open: a Date binds as a datetime, which a lookup of a node whose id is held as a
        // date misses, so the save makes a second node. Fails while that holds; passes once a save of an unchanged id
        // looks the node up by the tag it was loaded from.
        it.failing('held as a date: saves back onto the same node', async () => {
            await reset("date('2026-01-05')");
            const [loaded] = await gom.loadAll(LookupDateAsDate);
            await gom.save(Object.assign(loaded, { name: 'resaved' }));
            expect(await keyedCount()).toEqual(1);
        });
    });

    it('loads a text id as it always has', async () => {
        await reset("'2026-01-05'");
        const [loaded] = await gom.loadAll(LookupDateAsText);
        expect(loaded.id).toEqual('2026-01-05');
        await gom.save(Object.assign(loaded, { name: 'resaved' }));
        expect(await keyedCount()).toEqual(1);
    });
});
