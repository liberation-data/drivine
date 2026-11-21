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
    NullPolicy,
    pathKey,
    PersistenceManager,
    PersistenceManagerFactory,
    PropertyBag,
    QuerySpecification,
    RelationshipFragment,
    RemovedTargets,
    Root,
    SchemaCatalog,
    SchemaManager,
    StaleObjectException,
    StatelessGraphObjectManager,
    TargetNode,
    TransactionContextHolder,
    VectorIndex
} from '@liberation-data/drivine';
import { TargetModel } from '@/model/RelationshipModel';

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
    @NodeStamp() stamp?: string;
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
    @NodeStamp() stamp?: string;
}

/** A Date id beside a property bag, whose save under NullPolicy.CLEAR reads the keys the node holds first. */
@NodeFragment({ labels: ['IdKindRun', 'Keyed'] })
class BaggedDate {
    @NodeId() id: Date;
    @PropertyBag() meta: Record<string, any> = {};
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
class OwnedAny {
    @Root() owner: Owner;
    @GraphRelationship({ type: 'OWNS', target: () => LookupDateAsAny }) keyed: LookupDateAsAny[];
}

@GraphView()
class OwnedDate {
    @Root() owner: Owner;
    @GraphRelationship({ type: 'OWNS', target: () => LookupDateAsDate }) keyed: LookupDateAsDate[];
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

    /** The JSON each Keyed node holds its id as, byte for byte, in order. */
    const storedIds = async (): Promise<string[]> =>
        (
            await pm.query<{ id: string }>(
                new QuerySpecification<{ id: string }>({
                    text:
                        "SELECT props -> '$.id' AS id FROM drivine_node WHERE labels LIKE '%IdKindRun%' " +
                        "AND labels LIKE '%Keyed%' ORDER BY 1",
                    language: 'SQL'
                })
            )
        ).map((it) => it.id);

    /** How many OWNS edges there are. */
    const ownsEdges = async (): Promise<number> =>
        (
            await pm.query<{ n: number }>(
                new QuerySpecification<{ n: number }>({
                    text: "SELECT COUNT(*) AS n FROM drivine_edge WHERE type = 'OWNS'",
                    language: 'SQL'
                })
            )
        )[0].n;

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

        // Not refused, as the user didn't type the id. The save finds the node by the tag the id was loaded from, and
        // writes it back as that tag, while the id is unchanged (#815): before, it wrote the text, which its lookup
        // missed, so it made a second node.
        it('saves an id declared any back onto the same node, its id held as it was', async () => {
            const before = await storedIds();
            const [any] = await gom.loadAll(LookupDateAsAny);
            await gom.save(Object.assign(any, { name: 'resaved' }));
            expect(await keyedCount()).toEqual(1);
            expect(await storedIds()).toEqual(before);
            expect((await gom.loadAll(LookupDateAsAny)).map((it) => it.name)).toEqual(['resaved']);
        });

        it('saves a copy of an id declared any, given from, onto the same node', async () => {
            const before = await storedIds();
            const [any] = await gom.loadAll(LookupDateAsAny);
            await gom.save(Object.assign(new LookupDateAsAny(), any, { name: 'copied' }), { from: any });
            expect(await keyedCount()).toEqual(1);
            expect(await storedIds()).toEqual(before);
            expect((await gom.loadAll(LookupDateAsAny)).map((it) => it.name)).toEqual(['copied']);
        });

        it("saves a view's related node whose id is declared any onto the same node, by update too", async () => {
            const before = await storedIds();
            const view = (await gom.load(OwnedAny, 'o'))!;
            view.keyed[0].name = 'related';
            await gom.save(view, { replace: ['keyed'] });
            await gom.update(OwnedAny, 'o', (it) => {
                it.owner.name = 'renamed';
                it.keyed[0].name = 'updated';
            });
            expect(await keyedCount()).toEqual(1);
            expect(await ownsEdges()).toEqual(1);
            expect(await storedIds()).toEqual(before);
            expect((await gom.load(OwnedAny, 'o'))!.keyed.map((it) => it.name)).toEqual(['updated']);
        });

        it('patches an id declared any, as loaded, on its node', async () => {
            const before = await storedIds();
            const loaded = await gom.loadAll(LookupDateAsAny);
            loaded[0].name = 'patched';
            expect(await gom.patchAll(loaded, { only: ['name'] })).toEqual([
                { found: true, applied: true, changed: true }
            ]);
            expect(await storedIds()).toEqual(before);
            expect((await gom.loadAll(LookupDateAsAny)).map((it) => it.name)).toEqual(['patched']);
        });

        it("still misses the node by an id declared any given as its text, which no load's record is of", async () => {
            const [any] = await gom.loadAll(LookupDateAsAny);
            expect(await gom.load(LookupDateAsAny, any.id)).toBeUndefined();
            expect(
                await gom.update(LookupDateAsAny, any.id, (it) => {
                    it.name = 'changed';
                })
            ).toBeUndefined();
            expect(await keyedCount()).toEqual(1);
        });

        it('writes an id declared any changed since the load as given, making a node of it', async () => {
            const [any] = await gom.loadAll(LookupDateAsAny);
            const before = await storedIds();
            // Its stamp cleared: a save checks a loaded stamp against the node of the id it is given.
            await gom.save(Object.assign(any, { id: 'changed', name: 'moved', stamp: undefined }));
            expect(await storedIds()).toEqual([...before, '"changed"'].sort());
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

        it('held as a date: loads as a Date, not refused', async () => {
            await reset("date('2026-01-05')");
            const [loaded] = await gom.loadAll(LookupDateAsDate);
            expect(loaded.id).toEqual(new Date('2026-01-05T00:00:00Z'));
        });

        /**
         * Tags a `Date` can't hold exactly: a save writes a `Date` as a UTC datetime to the millisecond, which a lookup of
         * these missed, so a save made a second node (#815). While the id is unchanged since the load, each binds the tag
         * it was loaded from now.
         */
        describe.each([
            "date('2026-01-05')",
            "localdatetime('2026-01-05T10:11:12')",
            "datetime('2026-01-05T10:11:12+02:00')",
            "datetime('2026-01-05T10:11:12.123456789Z')"
        ])('held as %s', (cypher) => {
            beforeEach(async () => reset(cypher));

            it('saves back onto the same node, its id held as it was', async () => {
                const before = await storedIds();
                const [loaded] = await gom.loadAll(LookupDateAsDate);
                await gom.save(Object.assign(loaded, { name: 'resaved' }));
                expect(await keyedCount()).toEqual(1);
                expect(await storedIds()).toEqual(before);
                expect((await gom.loadAll(LookupDateAsDate)).map((it) => it.name)).toEqual(['resaved']);
            });

            it('saves a copy given from onto the same node', async () => {
                const before = await storedIds();
                const [loaded] = await gom.loadAll(LookupDateAsDate);
                await gom.save(Object.assign(new LookupDateAsDate(), loaded, { name: 'copied' }), { from: loaded });
                expect(await keyedCount()).toEqual(1);
                expect(await storedIds()).toEqual(before);
            });

            it('updates, patches, relates and deletes by the loaded id, finding the node', async () => {
                const before = await storedIds();
                const [loaded] = await gom.loadAll(LookupDateAsDate);
                const updated = await gom.update(LookupDateAsDate, loaded.id, (it) => {
                    it.name = 'updated';
                });
                expect(updated?.name).toEqual('updated');
                // update's change may return a copy: saved by the record of what it loaded.
                await gom.update(LookupDateAsDate, loaded.id, (it) =>
                    Object.assign(new LookupDateAsDate(), it, { name: 'returned' })
                );
                expect((await gom.load(LookupDateAsDate, loaded.id))?.name).toEqual('returned');
                expect(await gom.patch(LookupDateAsDate, loaded.id, { set: { name: 'patched' } })).toEqual({
                    found: true,
                    applied: true,
                    changed: true
                });
                expect(await gom.edges.relate(nodeRef(Owner, 'o'), nodeRef(LookupDateAsDate, loaded.id), 'LIKES')).toBe(
                    true
                );
                expect(await keyedCount()).toEqual(1);
                expect(await storedIds()).toEqual(before);
                expect(await gom.delete(LookupDateAsDate, loaded.id)).toEqual(1);
                expect(await keyedCount()).toEqual(0);
            });

            it("patches by the loaded id under a where naming $id, which names the id's value", async () => {
                const [loaded] = await gom.loadAll(LookupDateAsDate);
                await gom.save(Object.assign(loaded, { name: loaded.id.toISOString() }));
                expect(
                    await gom.patch(LookupDateAsDate, loaded.id, { set: { name: 'w' }, where: 'n.name = $id' })
                ).toEqual({ found: true, applied: true, changed: true });
            });

            it("reads a stale save's stamp from the node, which it finds by the tag", async () => {
                const [first] = await gom.loadAll(LookupDateAsDate);
                const [second] = await gom.loadAll(LookupDateAsDate);
                await gom.save(Object.assign(first, { name: 'first' }));
                const failure: any = await gom.save(Object.assign(second, { name: 'second' })).catch((it) => it);
                expect(failure).toBeInstanceOf(StaleObjectException);
                expect(failure.deleted).toBe(false);
                expect(await keyedCount()).toEqual(1);
            });

            it("removes a bag's dropped entry, reading the keys the node holds by the tag", async () => {
                await pm.execute(
                    new QuerySpecification({
                        text: 'MATCH (n:IdKindRun:Keyed) SET n.`meta.a` = 1, n.`meta.b` = 2',
                        language: 'CYPHER'
                    })
                );
                const [loaded] = await gom.loadAll(BaggedDate);
                expect(loaded.meta).toEqual({ a: 1, b: 2 });
                delete loaded.meta.b;
                await gom.save(loaded, { nullPolicy: NullPolicy.CLEAR });
                expect(await keyedCount()).toEqual(1);
                expect((await gom.loadAll(BaggedDate))[0].meta).toEqual({ a: 1 });
            });

            it('saves the related node of a view onto the same node', async () => {
                const before = await storedIds();
                const view = (await gom.load(OwnedDate, 'o'))!;
                view.keyed[0].name = 'related';
                await gom.save(view, { replace: ['keyed'] });
                expect(await keyedCount()).toEqual(1);
                expect(await ownsEdges()).toEqual(1);
                expect(await storedIds()).toEqual(before);
            });

            it('writes an id changed since the load, or a Date no load gave, as a UTC datetime', async () => {
                const [loaded] = await gom.loadAll(LookupDateAsDate);
                // The residual: a Date given afresh binds as a UTC datetime to the millisecond, which misses the node.
                expect(await gom.load(LookupDateAsDate, new Date(loaded.id.getTime()))).toBeUndefined();
                const before = await storedIds();
                loaded.id.setUTCFullYear(2027);
                await gom.save(Object.assign(loaded, { name: 'moved', stamp: undefined }));
                expect(await keyedCount()).toEqual(2);
                const after = await storedIds();
                expect(after).toHaveLength(2);
                expect(after).toEqual(expect.arrayContaining(before));
                const fresh = after.find((it) => !before.includes(it))!;
                expect(JSON.parse(fresh)).toMatchObject({
                    $t: 'datetime',
                    v: loaded.id.toISOString().replace('.000', '')
                });
                // A lookup given the changed Date binds it as given too, finding the node made of it, not the tag's.
                expect((await gom.load(LookupDateAsDate, loaded.id))?.name).toEqual('moved');
            });
        });
    });

    /**
     * A node whose id is held as a date and one whose id is the date's text: a load of each gives the id the same text,
     * so only what the load recorded tells them apart. Each saved back stays on its own node (#815), and an object no
     * load made, given the text, is the text's node, never the date's, as #811 kept it.
     */
    describe('beside a node whose id is the text a date reads as', () => {
        const TAG = '{"$t":"date","v":"2026-01-05","s":"10000020260105"}';

        beforeEach(async () => {
            await reset("date('2026-01-05')");
            await pm.execute(
                new QuerySpecification({
                    text: "CREATE (:IdKindRun:Keyed {id: '2026-01-05', name: 'text'})",
                    language: 'CYPHER'
                })
            );
        });

        const names = async (): Promise<Record<string, string>> =>
            Object.fromEntries(
                (
                    await pm.query<{ id: string; name: string }>(
                        new QuerySpecification<{ id: string; name: string }>({
                            text:
                                "SELECT props -> '$.id' AS id, props ->> '$.name' AS name FROM drivine_node " +
                                "WHERE labels LIKE '%Keyed%'",
                            language: 'SQL'
                        })
                    )
                ).map((it) => [it.id, it.name])
            );

        it('saves each loaded object onto its own node, the other untouched', async () => {
            const loaded = await gom.loadAll(LookupDateAsAny);
            expect(loaded.map((it) => it.id)).toEqual(['2026-01-05', '2026-01-05']);
            const dated = loaded.find((it) => it.name === 'x')!;
            const text = loaded.find((it) => it.name === 'text')!;
            await gom.save(Object.assign(dated, { name: 'dated, saved' }));
            expect(await names()).toEqual({ [TAG]: 'dated, saved', '"2026-01-05"': 'text' });
            await gom.save(Object.assign(text, { name: 'text, saved' }));
            expect(await names()).toEqual({ [TAG]: 'dated, saved', '"2026-01-05"': 'text, saved' });
            await gom.saveAll([Object.assign(dated, { name: 'dated, batched' })]);
            expect(await names()).toEqual({ [TAG]: 'dated, batched', '"2026-01-05"': 'text, saved' });
            expect(await keyedCount()).toEqual(2);
        });

        it('hands each its own stamp back from a saveAll, a view and a patchAll, so neither is then stale', async () => {
            const loaded = await gom.loadAll(LookupDateAsAny);
            const dated = loaded.find((it) => it.name === 'x')!;
            const text = loaded.find((it) => it.name === 'text')!;
            await gom.saveAll([
                Object.assign(dated, { name: 'dated, batched' }),
                Object.assign(text, { name: 'text, batched' })
            ]);
            await gom.save(Object.assign(dated, { name: 'dated, saved' }));
            await gom.save(Object.assign(text, { name: 'text, saved' }));
            expect(await names()).toEqual({ [TAG]: 'dated, saved', '"2026-01-05"': 'text, saved' });
            await pm.execute(
                new QuerySpecification({
                    text: "MATCH (o:IdKindRun:Owner {id: 'o'}), (k:IdKindRun:Keyed {name: 'text, saved'}) CREATE (o)-[:OWNS]->(k)",
                    language: 'CYPHER'
                })
            );
            const view = (await gom.load(OwnedAny, 'o'))!;
            expect(view.keyed).toHaveLength(2);
            view.keyed.forEach((it) => (it.name = `${it.name}, in a view`));
            await gom.save(view);
            for (const it of view.keyed) {
                await gom.save(Object.assign(it, { name: `${it.name} and saved` }));
            }
            expect(await names()).toEqual({
                [TAG]: 'dated, saved, in a view and saved',
                '"2026-01-05"': 'text, saved, in a view and saved'
            });
            const again = await gom.loadAll(LookupDateAsAny);
            again.forEach((it) => (it.name = `${it.name}, patched`));
            expect(await gom.patchAll(again, { only: ['name'] })).toEqual([
                { found: true, applied: true, changed: true },
                { found: true, applied: true, changed: true }
            ]);
            expect(await keyedCount()).toEqual(2);
        });

        /**
         * A write plan keys a node within the plan by the module's plan key (PostgresSaveBuilder's storedKey, the module's
         * planKeyOf and planKey), which keys a text id apart from a date that reads alike: a `replace` that keeps one drops
         * the other's relationship (drivine-cypher-spec#391). Keyed by the id's text alone, it kept both, silently.
         */
        it("trims a view's relationship to a node whose id is a date, kept the date's text alone", async () => {
            await gom.save(
                Object.assign(new Owned(), {
                    owner: Object.assign(new Owner(), { id: 'o', name: 'owner' }),
                    keyed: [Object.assign(new LookupDateAsText(), { id: '2026-01-05', name: 'text' })]
                }),
                { replace: ['keyed'] }
            );
            expect(await ownsEdges()).toEqual(1);
        });

        it("deletes, by DELETE_UNREFERENCED, the date's node, not the node of the text the view holds", async () => {
            await gom.save(
                Object.assign(new Owned(), {
                    owner: Object.assign(new Owner(), { id: 'o', name: 'owner' }),
                    keyed: [Object.assign(new LookupDateAsText(), { id: '2026-01-05', name: 'text' })]
                }),
                { replace: ['keyed'], removedTargets: RemovedTargets.DELETE_UNREFERENCED }
            );
            expect(await ownsEdges()).toEqual(1);
            expect(await names()).toEqual({ '"2026-01-05"': 'text' });
        });

        it("trims a view's relationship to the text's node, kept the date's node alone", async () => {
            await pm.execute(
                new QuerySpecification({
                    text: "MATCH (o:IdKindRun:Owner {id: 'o'}), (k:IdKindRun:Keyed {name: 'text'}) CREATE (o)-[:OWNS]->(k)",
                    language: 'CYPHER'
                })
            );
            const view = (await gom.load(OwnedAny, 'o'))!;
            view.keyed = view.keyed.filter((it) => it.name === 'x');
            await gom.save(view, { replace: ['keyed'] });
            expect(await ownsEdges()).toEqual(1);
        });

        /**
         * Oracle reads each node's id back from the node, as the tag's text, to hand a saveAll's or a view's stamps
         * back, so it can't tell the two apart: both are handed the stamp of whichever it read last, and the other is
         * then stale. Saved one by one, each is handed its own (the root's stamp comes back by itself).
         */
        it("can't hand each its own stamp back from one Oracle saveAll, as Oracle reads both ids back as the text", async () => {
            const loaded = await gom.loadAll(LookupDateAsAny);
            const dated = loaded.find((it) => it.name === 'x')!;
            const text = loaded.find((it) => it.name === 'text')!;
            const oracle = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.ORACLE), new ModelRegistry());
            const model = new ModelRegistry().fragment(LookupDateAsAny);
            const [d, t] = [`${'d'.repeat(16)}:`, `${'t'.repeat(16)}:`];
            [dated.stamp, text.stamp] = [`${'a'.repeat(16)}:`, `${'b'.repeat(16)}:`];
            (oracle as any).handBackFragments([{ model, objects: [dated, text] }], {
                groups: [
                    {
                        before: [
                            { id: '2026-01-05', stamp: dated.stamp },
                            { id: '2026-01-05', stamp: text.stamp }
                        ],
                        after: [
                            { id: '2026-01-05', stamp: d },
                            { id: '2026-01-05', stamp: t }
                        ]
                    }
                ]
            });
            expect(text.stamp).toEqual(t);
            expect(dated.stamp).not.toEqual(d);
        });

        it("saves an object no load made, given the text, onto the text's node", async () => {
            await gom.save(Object.assign(new LookupDateAsAny(), { id: '2026-01-05', name: 'fresh' }));
            expect(await names()).toEqual({ [TAG]: 'x', '"2026-01-05"': 'fresh' });
        });
    });

    /**
     * The id each SQL store's save binds, read from the statement it builds (#811's guard, as #815 refines it): an id
     * unchanged since the load binds the tag it was loaded from wherever the save binds it, and any other id its value,
     * never one in one place and the other in another. Oracle finds the node by a bound id and writes the id among the
     * properties; Postgres and SQLite find and make it by the plan step's id, and key it within the plan by `k`.
     */
    describe('as each SQL store binds it', () => {
        const TAG = '{"$t":"date","v":"2026-01-05","s":"10000020260105"}';
        const registry = new ModelRegistry();
        const target: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(LookupDateAsAny) };

        /** Oracle's: the id find_node is given, and the id among the properties apply_node writes, as JSON text. */
        const oracle = (object: LookupDateAsAny): { key: string; property: string } => {
            const statement = backendFor(DatabaseType.ORACLE).save(target, object, {}, false, registry);
            const key = /v_root := find_node\(\$x_\d+, \$(x_\d+)\)/.exec(statement.text)![1];
            const props = /apply_node\(v_root, \$(x_\d+)/.exec(statement.text)![1];
            const written = statement.bindings[props] as string;
            return {
                key: statement.bindings[key],
                property: written.slice(written.indexOf('"id":') + 5, written.indexOf(',"name"'))
            };
        };

        /** Postgres's or SQLite's: the root step's id, as JSON text, and the text it is keyed by within the plan. */
        const plan = (type: DatabaseType, object: LookupDateAsAny): { key: string; k: string; set: string[] } => {
            const statement = backendFor(type).save(target, object, {}, false, registry);
            const text = statement.bindings._plan as string;
            const step = JSON.parse(text)[0];
            const id = text.slice(text.indexOf('"id":') + 5, text.indexOf(',"labels"'));
            return { key: id, k: step.k, set: Object.keys(step.set ?? {}) };
        };

        beforeEach(async () => reset("date('2026-01-05')"));

        it('binds a loaded id, unchanged, as the tag it was loaded from, in every role', async () => {
            const [loaded] = await gom.loadAll(LookupDateAsAny);
            expect(oracle(loaded)).toEqual({ key: TAG, property: TAG });
            for (const type of [DatabaseType.POSTGRES, DatabaseType.SQLITE]) {
                expect(plan(type, loaded)).toEqual({ key: TAG, k: '2026-01-05', set: ['name', 'body', 'embedding'] });
            }
        });

        it('binds the same text given an object no load made as its text, in every role', () => {
            const fresh = Object.assign(new LookupDateAsAny(), { id: '2026-01-05', name: 'x' });
            expect(oracle(fresh)).toEqual({ key: '"2026-01-05"', property: '"2026-01-05"' });
            for (const type of [DatabaseType.POSTGRES, DatabaseType.SQLITE]) {
                // Keyed as a text, apart from the date it reads as (drivine-cypher-spec#391).
                expect(plan(type, fresh)).toEqual({ key: '"2026-01-05"', k: 't:2026-01-05', set: ['name'] });
            }
        });

        it('binds an id changed since the load as given, in every role', async () => {
            const [loaded] = await gom.loadAll(LookupDateAsAny);
            loaded.id = '2026-01-06';
            expect(oracle(loaded)).toEqual({ key: '"2026-01-06"', property: '"2026-01-06"' });
            for (const type of [DatabaseType.POSTGRES, DatabaseType.SQLITE]) {
                expect(plan(type, loaded)).toEqual({
                    key: '"2026-01-06"',
                    k: 't:2026-01-06',
                    set: ['name', 'body', 'embedding']
                });
            }
        });

        it('binds a changed copy, given from, by what from loaded, while its id is the same', async () => {
            const [loaded] = await gom.loadAll(LookupDateAsAny);
            const copy = Object.assign(new LookupDateAsAny(), loaded, { name: 'copied' });
            const statement = backendFor(DatabaseType.SQLITE).save(target, copy, { loaded }, false, registry);
            expect(statement.bindings._plan).toContain(`"id":${TAG}`);
            const moved = Object.assign(new LookupDateAsAny(), loaded, { id: 'elsewhere' });
            const fresh = backendFor(DatabaseType.ORACLE).save(target, moved, { loaded }, false, registry);
            expect(Object.values(fresh.bindings)).not.toContain(TAG);
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
