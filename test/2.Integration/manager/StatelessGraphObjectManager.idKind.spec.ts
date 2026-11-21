import {
    backendFor,
    count,
    DatabaseRegistry,
    DatabaseType,
    Direction,
    DrivineError,
    FullTextIndex,
    fullTextIndex,
    GraphObjectManagerFactory,
    GraphPath,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    nodeRef,
    NodeStamp,
    pathKey,
    PersistenceManager,
    PersistenceManagerFactory,
    PostgresGraph,
    QuerySpecification,
    RelationshipFragment,
    RemovedTargets,
    Root,
    SchemaCatalog,
    SchemaManager,
    SqliteGraph,
    StatelessGraphObjectManager,
    TargetNode,
    TransactionContextHolder,
    VectorIndex,
    vectorIndex
} from '@liberation-data/drivine';
import { clearLabels, closeGraphEngines } from '../support/GraphEngines';
import { sqlPersistenceManager, sqlStores } from '../support/SqlStores';

jest.setTimeout(30_000);

@NodeFragment({ labels: ['IdKindTest', 'Keyed'] })
class LookupDateAsText {
    @NodeId() id: string;
    name?: string;
    @FullTextIndex() body?: string;
    @VectorIndex({ dimensions: 2 }) embedding?: number[];
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['IdKindTest', 'Keyed'] })
class LookupDateAsNumber {
    @NodeId() id: number;
    name?: string;
}

@NodeFragment({ labels: ['IdKindTest', 'Keyed'] })
class LookupDateAsBigInt {
    @NodeId() id: bigint;
}

@NodeFragment({ labels: ['IdKindTest', 'Keyed'] })
class LookupDateAsBoolean {
    @NodeId() id: boolean;
}

/** An id the user didn't type: TypeScript records `Object`, so it is not refused (as drivine-python's `Any`). */
@NodeFragment({ labels: ['IdKindTest', 'Keyed'] })
class LookupDateAsAny {
    @NodeId() id: any;
    name?: string;
    @NodeStamp() stamp?: string;
}

/** An id declared a union: TypeScript records `Object` too. */
@NodeFragment({ labels: ['IdKindTest', 'Keyed'] })
class LookupDateAsUnion {
    @NodeId() id: string | Date;
}

@NodeFragment({ labels: ['IdKindTest', 'Keyed'] })
class LookupDateAsDate {
    @NodeId() id: Date;
    name?: string;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['IdKindTest', 'Owner'] })
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
    { kind: 'duration', cypher: "duration('P1DT2H')", text: 'P1DT2H' }
];

/** Tags a `Date` can't hold exactly, each as Cypher writes it, and its kind. */
const INEXACT = [
    { kind: 'date', cypher: "date('2026-01-05')" },
    { kind: 'localdatetime', cypher: "localdatetime('2026-01-05T10:11:12')" },
    { kind: 'datetime', cypher: "datetime('2026-01-05T10:11:12+02:00')" },
    { kind: 'datetime', cypher: "datetime('2026-01-05T10:11:12.123456789Z')" }
];

const refusal = (type: string, declared: string, text: string, kind: string): string =>
    `${type}'s @NodeId id is declared a ${declared}, but the node whose id is '${text}' holds it as a ${kind}: ` +
    `declare id as a ${kind} to load it.`;

/**
 * A node whose @NodeId a SQL store holds as a temporal tag, loaded by a class that declares the id a non-temporal scalar
 * (#813): the read gives the id as its text, which a lookup by id misses, as it compares the id's kind too, so a save of
 * what was loaded made a second node. Every read that maps the node refuses it, by name, before anything is written.
 * SqliteIdKindRun runs the same on Node's SQLite without a container.
 */
describe.each(sqlStores())('a @NodeId held as a temporal, declared a non-temporal scalar, on $type', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const specs = [fullTextIndex('IdKindTest', 'body'), vectorIndex('IdKindTest', 'embedding', 2)];

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        if (store.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
        if (store.type === DatabaseType.SQLITE) {
            await pm.execute(new QuerySpecification(new SqliteGraph().ensuring));
        }
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        const factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
        await new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, LookupDateAsText).forDatabase(store.name)]
        }).enforce();
    });

    afterAll(async () => {
        await clearLabels(pm, store, 'IdKindTest');
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await closeGraphEngines();
    });

    /**
     * The owner, owning one Keyed node whose id `cypher` gives: saved by the object manager with a text id, so its
     * vector and text are written as a save writes them, then given the id by Cypher, as another writer would.
     */
    const reset = async (cypher: string): Promise<void> => {
        await clearLabels(pm, store, 'IdKindTest');
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
                text: `MATCH (n:IdKindTest:Keyed {id: 'seed'}) SET n.id = ${cypher}`,
                language: 'CYPHER'
            })
        );
    };

    /** What the Cypher statement `text` gives, each row's one value. */
    const values = async (text: string): Promise<any[]> =>
        pm.query(new QuerySpecification<any>({ text, language: 'CYPHER' }));

    /** How many OWNS relationships the run holds. */
    const ownsEdges = async (): Promise<number> =>
        Number((await values('MATCH (:IdKindTest)-[r:OWNS]->(:IdKindTest) RETURN count(r)'))[0]);

    /** How many Keyed nodes hold their id as `literal` gives it: the tag, and not its text. */
    const heldAs = async (literal: string): Promise<number> =>
        Number((await values(`MATCH (n:IdKindTest:Keyed) WHERE n.id = ${literal} RETURN count(n)`))[0]);

    /** The names of the Keyed nodes and the owner's, by a class that refuses none: unchanged by a refused read. */
    const names = async (): Promise<string[]> => [
        ...(await gom.loadAll(LookupDateAsAny)).map((it) => String(it.name)),
        ...(await gom.loadAll(Owner)).map((it) => String(it.name))
    ];

    describe.each(KINDS)('held as a $kind', ({ kind, cypher, text }: (typeof KINDS)[number]) => {
        beforeEach(async () => reset(cypher));

        const asText = refusal('LookupDateAsText', 'string', text, kind);

        const paths: [string, () => Promise<unknown>, string][] = [
            ['loadAll', async () => gom.loadAll(LookupDateAsText), asText],
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
            ["a view's root", async () => gom.loadAll(KeyedView), asText],
            ["a view's related node", async () => gom.load(Owned, 'o'), asText],
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
            const before = await names();
            const failure: any = await read().catch((it: unknown) => it);
            expect(failure).toBeInstanceOf(DrivineError);
            expect(failure.message).toEqual(message);
            expect(await names()).toEqual(before);
        });

        it('made a second node when an object as the load gave it was saved: what the refusal prevents', async () => {
            await gom.save(Object.assign(new LookupDateAsText(), { id: text, name: 'resaved' }));
            expect(await gom.count(LookupDateAsAny)).toEqual(2);
        });

        /**
         * The node's id is still held as the tag: a class that declares it a string is refused, naming its kind and
         * text, as it was before the save (#815).
         */
        const stillHeld = async (): Promise<void> => {
            await expect(gom.loadAll(LookupDateAsText)).rejects.toThrow(asText);
            expect(await gom.count(LookupDateAsAny)).toEqual(1);
        };

        it('saves an id declared any back onto its node, by save, from, a view and patchAll (#815)', async () => {
            const [any] = await gom.loadAll(LookupDateAsAny);
            await gom.save(Object.assign(any, { name: 'resaved' }));
            await stillHeld();
            const [again] = await gom.loadAll(LookupDateAsAny);
            await gom.save(Object.assign(new LookupDateAsAny(), again, { name: 'copied' }), { from: again });
            await stillHeld();
            const view = (await gom.load(OwnedAny, 'o'))!;
            view.keyed[0].name = 'related';
            await gom.save(view, { replace: ['keyed'] });
            await gom.update(OwnedAny, 'o', (it) => {
                it.keyed[0].name = 'updated';
            });
            await stillHeld();
            expect((await gom.load(OwnedAny, 'o'))!.keyed.map((it) => it.name)).toEqual(['updated']);
            const loaded = await gom.loadAll(LookupDateAsAny);
            loaded[0].name = 'patched';
            expect(await gom.patchAll(loaded, { only: ['name'] })).toEqual([
                { found: true, applied: true, changed: true }
            ]);
            await stillHeld();
            expect((await gom.loadAll(LookupDateAsAny)).map((it) => it.name)).toEqual(['patched']);
        });

        /**
         * A related node whose id, declared any, a load gave as its tag's text is held by a `replace` as the tag, as
         * the plan keys the node: its relationship is kept, and its node too under DELETE_UNREFERENCED. The plan's key
         * marks a text apart (drivine-cypher-spec#391), so the text alone would drop it.
         */
        it('keeps, by a replace, a related node whose id declared any was loaded from a tag', async () => {
            await gom.save((await gom.load(OwnedAny, 'o'))!, { replace: ['keyed'] });
            expect(await ownsEdges()).toEqual(1);
            await gom.save((await gom.load(OwnedAny, 'o'))!, {
                replace: ['keyed'],
                removedTargets: RemovedTargets.DELETE_UNREFERENCED
            });
            expect(await ownsEdges()).toEqual(1);
            expect(await gom.count(LookupDateAsAny)).toEqual(1);
            expect(await heldAs(cypher)).toEqual(1);
        });

        it('writes an id declared any as given once it is changed, or given an object no load made', async () => {
            await gom.save(Object.assign(new LookupDateAsAny(), { id: text, name: 'fresh' }));
            expect(await gom.count(LookupDateAsAny)).toEqual(2);
            const loaded = (await gom.loadAll(LookupDateAsAny)).find((it) => it.name === 'x')!;
            await gom.save(Object.assign(loaded, { id: 'moved', stamp: undefined }));
            expect(await gom.count(LookupDateAsAny)).toEqual(3);
        });

        it('loads an id declared any, or a union, as the text the read gives, as before', async () => {
            const [any] = await gom.loadAll(LookupDateAsAny);
            expect(any.id).toEqual(text);
            const [union] = await gom.loadAll(LookupDateAsUnion);
            expect(union.id).toEqual(text);
        });
    });

    it('loads an id declared a Date over a datetime as a Date, and saves it back onto the same node', async () => {
        await reset("datetime('2026-01-05T10:11:12Z')");
        const [loaded] = await gom.loadAll(LookupDateAsDate);
        expect(loaded.id).toEqual(new Date('2026-01-05T10:11:12Z'));
        await gom.save(Object.assign(loaded, { name: 'resaved' }));
        expect((await gom.loadAll(LookupDateAsDate)).map((it) => it.name)).toEqual(['resaved']);
    });

    it('loads an id declared a Date over a date as a Date, not refused', async () => {
        await reset("date('2026-01-05')");
        const [loaded] = await gom.loadAll(LookupDateAsDate);
        expect(loaded.id).toEqual(new Date('2026-01-05T00:00:00Z'));
    });

    /** Tags a `Date` can't hold exactly: while the id is unchanged since the load, each binds the tag (#815). */
    describe.each(INEXACT)('an id declared a Date held as $cypher', ({ kind, cypher }: (typeof INEXACT)[number]) => {
        beforeEach(async () => reset(cypher));

        // Still held as the tag, of its kind: a class that declares the id a string is refused. Its text, as each
        // store reads it back, is the read's (a fraction finer than a millisecond may be written otherwise).
        const stillHeld = async (): Promise<void> => {
            await expect(gom.loadAll(LookupDateAsText)).rejects.toThrow(`holds it as a ${kind}: `);
            expect(await gom.count(LookupDateAsAny)).toEqual(1);
        };

        it('saves back onto its node, by save, from and a view', async () => {
            const [loaded] = await gom.loadAll(LookupDateAsDate);
            await gom.save(Object.assign(loaded, { name: 'resaved' }));
            await stillHeld();
            const [again] = await gom.loadAll(LookupDateAsDate);
            await gom.save(Object.assign(new LookupDateAsDate(), again, { name: 'copied' }), { from: again });
            await stillHeld();
            const view = (await gom.load(OwnedDate, 'o'))!;
            view.keyed[0].name = 'related';
            await gom.save(view, { replace: ['keyed'] });
            await stillHeld();
            expect((await gom.load(OwnedDate, 'o'))!.keyed.map((it) => it.name)).toEqual(['related']);
        });

        it('updates, patches, relates and deletes by the loaded id', async () => {
            const [loaded] = await gom.loadAll(LookupDateAsDate);
            expect(
                (
                    await gom.update(LookupDateAsDate, loaded.id, (it) => {
                        it.name = 'updated';
                    })
                )?.name
            ).toEqual('updated');
            expect((await gom.patch(LookupDateAsDate, loaded.id, { set: { name: 'patched' } })).found).toBe(true);
            expect(await gom.edges.relate(nodeRef(Owner, 'o'), nodeRef(LookupDateAsDate, loaded.id), 'LIKES')).toBe(
                true
            );
            await stillHeld();
            expect(await gom.delete(LookupDateAsDate, loaded.id)).toEqual(1);
            expect(await gom.count(LookupDateAsAny)).toEqual(0);
        });
    });

    /** Only a load's record tells a node whose id is a date from one whose id is the date's text (#815). */
    it('saves each of a date id and its text, loaded, onto its own node', async () => {
        await reset("date('2026-01-05')");
        await gom.save(Object.assign(new LookupDateAsAny(), { id: '2026-01-05', name: 'text' }));
        const loaded = await gom.loadAll(LookupDateAsAny);
        expect(loaded.map((it) => it.id)).toEqual(['2026-01-05', '2026-01-05']);
        for (const it of loaded) {
            await gom.save(Object.assign(it, { name: `${it.name}, saved` }));
        }
        expect(await gom.count(LookupDateAsAny)).toEqual(2);
        const texts = await gom.loadAll(LookupDateAsText, (q) => ({ where: q.name.eq('text, saved') }));
        expect(texts.map((it) => it.id)).toEqual(['2026-01-05']);
        expect((await gom.loadAll(LookupDateAsAny)).map((it) => it.name).sort()).toEqual(['text, saved', 'x, saved']);
    });
    /**
     * The owner, owning a date's node and the date's text's, and a number's node and the number's text's, made by
     * Cypher.
     */
    const ownedAlike = async (): Promise<void> => {
        await clearLabels(pm, store, 'IdKindTest');
        await pm.execute(
            new QuerySpecification({
                text:
                    "CREATE (o:IdKindTest:Owner {id: 'o', name: 'owner'}), " +
                    "(d:IdKindTest:Keyed {id: date('2026-01-05'), name: 'date'}), " +
                    "(t:IdKindTest:Keyed {id: '2026-01-05', name: 'text'}), (n:IdKindTest:Keyed {id: 1, name: 'number'}), " +
                    "(s:IdKindTest:Keyed {id: '1', name: 'one'}) " +
                    'CREATE (o)-[:OWNS]->(d), (o)-[:OWNS]->(t), (o)-[:OWNS]->(n), (o)-[:OWNS]->(s)',
                language: 'CYPHER'
            })
        );
    };

    /** The names of the nodes the owner owns. */
    const owned = async (): Promise<string[]> =>
        values("MATCH (:IdKindTest:Owner {id: 'o'})-[:OWNS]->(k) RETURN k.name ORDER BY k.name");

    /** The owner, owning the nodes whose ids are the texts '2026-01-05' and '1'. */
    const texts = (): Owned =>
        Object.assign(new Owned(), {
            owner: Object.assign(new Owner(), { id: 'o', name: 'owner' }),
            keyed: [
                Object.assign(new LookupDateAsText(), { id: '2026-01-05', name: 'text' }),
                Object.assign(new LookupDateAsText(), { id: '1', name: 'one' })
            ]
        });

    /**
     * A write plan keys a related node by its id, a text id apart from a date or a number that reads alike
     * (drivine-cypher-spec#391): a `replace` that keeps the text's node drops the date's relationship, and the
     * number's. Before, the plan keyed the text '2026-01-05' and the date 2026-01-05 alike, and '1' and 1, so it kept
     * all four, with no error.
     */
    it("drops, by a replace that keeps a text id's node, the relationship to a date or a number whose text it is", async () => {
        await ownedAlike();
        await gom.save(texts(), { replace: ['keyed'] });
        expect(await owned()).toEqual(['one', 'text']);
        // A replace that keeps removed targets deletes none.
        expect(Number((await values('MATCH (n:IdKindTest) RETURN count(n)'))[0])).toEqual(5);
    });

    /** As a `replace` keys them, DELETE_UNREFERENCED deletes the date's and the number's nodes, not the texts' it holds. */
    it("deletes, by DELETE_UNREFERENCED, the date's node and the number's, not the text ids' nodes the view holds", async () => {
        await ownedAlike();
        await gom.save(texts(), { replace: ['keyed'], removedTargets: RemovedTargets.DELETE_UNREFERENCED });
        expect(await owned()).toEqual(['one', 'text']);
        expect(await values('MATCH (n:IdKindTest:Keyed) RETURN n.name ORDER BY n.name')).toEqual(['one', 'text']);
    });
});
