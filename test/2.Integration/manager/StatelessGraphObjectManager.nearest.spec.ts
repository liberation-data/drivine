import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    Root,
    SchemaCatalog,
    SchemaManager,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    VectorIndex,
    vectorIndex
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

@NodeFragment({ labels: ['NearestTest', 'Proposition'] })
class Proposition {
    @NodeId() id: string;
    text?: string;
    contextId?: string;
    @VectorIndex({ dimensions: 3 }) embedding?: number[];
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['NearestTest', 'Point'] })
class Point {
    @NodeId() id: string;
    @VectorIndex({ dimensions: 2, similarity: 'EUCLIDEAN' }) position?: number[];
}

@NodeFragment({ labels: ['NearestTest', 'Entity'] })
class Entity {
    @NodeId() id: string;
}

@GraphView()
class PropositionView {
    @Root() proposition: Proposition;
    @GraphRelationship({ type: 'MENTIONS', target: () => Entity, required: true }) mentions: Entity[];
}

const proposition = (id: string, embedding: number[], contextId = 'a'): Proposition =>
    Object.assign(new Proposition(), { id, text: id, contextId, embedding });

describe.each(allStores())('loadNearest on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const specs = [vectorIndex('NearestTest', 'embedding', 3), vectorIndex('NearestTest', 'position', 2, 'EUCLIDEAN')];

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await clearLabels(pm, engine, 'NearestTest');
        if (engine.type === DatabaseType.MEMGRAPH) {
            // Memgraph's vector search returns nodes deleted since its last garbage collection, and fails on them.
            await pm.execute(new QuerySpecification('FREE MEMORY'));
        }
        const factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
        await new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, Proposition, Point).forDatabase(engine.name)]
        }).enforce();
        await gom.saveAll([
            proposition('north', [1, 0, 0]),
            proposition('north-east', [0.8, 0.6, 0]),
            proposition('east', [0, 1, 0], 'b'),
            proposition('up', [0, 0, 1], 'b'),
            Object.assign(new Point(), { id: 'origin', position: [0, 0] }),
            Object.assign(new Point(), { id: 'far', position: [3, 4] })
        ]);
        await gom.save(
            Object.assign(new PropositionView(), {
                proposition: proposition('east', [0, 1, 0], 'b'),
                mentions: [Object.assign(new Entity(), { id: 'e1' })]
            })
        );
        if (engine.type === DatabaseType.NEO4J) {
            await pm.execute(new QuerySpecification('CALL db.awaitIndexes(30)'));
        }
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'NearestTest');
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await closeGraphEngines();
    });

    it('should store embeddings so the index finds them, and load them back', async () => {
        const loaded = (await gom.load(Proposition, 'north-east'))!;
        expect(loaded.embedding!.map((it) => Math.round(it * 10) / 10)).toEqual([0.8, 0.6, 0]);
    });

    it('should rank the nearest first, scored as one similarity on every engine', async () => {
        const hits = await gom.loadNearest(Proposition, [1, 0, 0], { topK: 2 });
        expect(hits.map((it) => it.value.id)).toEqual(['north', 'north-east']);
        expect(hits[0].value).toBeInstanceOf(Proposition);
        expect(hits[0].score).toBeCloseTo(1, 2);
        expect(hits[1].score).toBeCloseTo((1 + 0.8) / 2, 2);
    });

    it('should score euclidean similarity as 1 / (1 + d²)', async () => {
        const hits = await gom.loadNearest(Point, [0, 0], { topK: 2 });
        expect(hits.map((it) => it.value.id)).toEqual(['origin', 'far']);
        expect(hits[0].score).toBeCloseTo(1, 2);
        expect(hits[1].score).toBeCloseTo(1 / 26, 2);
    });

    it('should filter by threshold, and by where with a wider search', async () => {
        const close = await gom.loadNearest(Proposition, [1, 0, 0], { topK: 4, threshold: 0.85 });
        expect(close.map((it) => it.value.id)).toEqual(['north', 'north-east']);
        // east and up are both in context b; the query leans towards east, so they don't tie.
        const scoped = await gom.loadNearest(Proposition, [1, 0.1, 0], {
            topK: 1,
            searchK: 4,
            where:
                engine.type === DatabaseType.ORACLE
                    ? "JSON_VALUE(n.props, '$.contextId') = $context"
                    : engine.type === DatabaseType.POSTGRES
                    ? "(n.props ->> 'contextId') = $context"
                    : 'n.contextId = $context',
            bindings: { context: 'b' }
        });
        expect(scoped.map((it) => it.value.id)).toEqual(['east']);
        // Written as Cypher writes it, on every store: a SQL store reads n.contextId as that property.
        const written = await gom.loadNearest(Proposition, [1, 0.1, 0], {
            topK: 1,
            searchK: 4,
            where: 'n.contextId = $context',
            bindings: { context: 'b' }
        });
        expect(written.map((it) => it.value.id)).toEqual(['east']);
        const typed = await gom.loadNearest(Proposition, [1, 0.1, 0], {
            topK: 1,
            searchK: 4,
            where: (q) => q.contextId.eq('b')
        });
        expect(typed.map((it) => it.value.id)).toEqual(['east']);
        await expect(gom.loadNearest(Proposition, [1, 0, 0], { topK: 3, searchK: 2 })).rejects.toThrow(
            /searchK must be/
        );
    });

    it('should search a view by its root, keeping only roots with its required relationships', async () => {
        const hits = await gom.loadNearest(PropositionView, [1, 0, 0], { topK: 4 });
        expect(hits.map((it) => it.value.proposition.id)).toEqual(['east']);
        expect(hits[0].value.mentions.map((it) => it.id)).toEqual(['e1']);
    });

    it('should keep the stamp when a vector is saved unchanged', async () => {
        const loaded = (await gom.load(Proposition, 'north'))!;
        const before = loaded.stamp;
        await gom.save(loaded);
        expect((await gom.load(Proposition, 'north'))!.stamp).toEqual(before);
    });
});

/** A document whose embedding has 4 dimensions, as the index made for it has, but for W's 3. */
@NodeFragment({ labels: ['SizedTest'] })
class SizedDoc {
    @NodeId() id: string;
    title?: string;
    @VectorIndex({ dimensions: 4 }) embedding?: number[];
}

/** A document of a partition no index is made for, so a search partitioned by it measures every node, on a SQL store. */
@NodeFragment({ labels: ['SizedTest', 'SizedCorpus'] })
class PartitionedDoc extends SizedDoc {}

@NodeFragment({ labels: ['SizedTest', 'SizedAuthor'] })
class SizedAuthor {
    @NodeId() id: string;
}

@GraphView()
class SizedDocView {
    @Root() doc: SizedDoc;
    @GraphRelationship({ type: 'WRITTEN_BY', target: () => SizedAuthor, required: true }) authors: SizedAuthor[];
}

/** The vector searched by: A's own embedding, of the index's 4 dimensions. */
const SIZED_QUERY = [1, 0, 0, 0];

/** W's own embedding, of 3 dimensions. */
const MIS_SIZED_QUERY = [1, 0, 0];

/** Wide enough that every store, approximate or not, sees every node. */
const SIZED_WIDE = 10;

/**
 * Each store with the index made for the documents, and each SQL store also without it, where it measures every node.
 * Memgraph refuses to write an embedding of another size than its index's, so it has no such node to leave out.
 */
const sizedStores = allStores().flatMap((engine) =>
    engine.type === DatabaseType.MEMGRAPH
        ? []
        : [
              { ...engine, indexed: true },
              ...(engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES
                  ? [{ ...engine, indexed: false }]
                  : [])
          ]
);

/**
 * W, whose embedding has 3 dimensions where the others and the index have 4, is left out of a search by a vector of 4
 * on every store rather than failing it: Oracle refuses to measure two sizes against each other (ORA-51808). W has an
 * author, so that a view leaves it out for its size and not for a missing relationship. W and A are in a partition, so
 * that a search partitioned by it has one node of each size to measure. Ported from drivine4j's
 * NearestAmongCrossEngineTest.
 */
describe.each(sizedStores)('loadNearest with an embedding of another size on $type, indexed: $indexed', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const spec = vectorIndex('SizedTest', 'embedding', 4);
    const sql = engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES;

    const ids = (hits: { value: SizedDoc }[]): string[] => hits.map((it) => it.value.id);

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        await gom.indexes.drop(spec);
        await clearLabels(pm, engine, 'SizedTest');
        if (engine.indexed) {
            await gom.indexes.ensure(spec);
        }
        const doc = (id: string, title: string, embedding: number[], type = SizedDoc): SizedDoc =>
            Object.assign(new type(), { id, title, embedding });
        const author = Object.assign(new SizedAuthor(), { id: 'au1' });
        const written = (it: SizedDoc): SizedDocView =>
            Object.assign(new SizedDocView(), { doc: it, authors: [author] });
        await gom.saveAll([
            written(doc('A', 'Alpha', [1, 0, 0, 0], PartitionedDoc)),
            written(doc('B', 'Beta', [0.8, 0.6, 0, 0])),
            written(doc('C', 'Gamma', [0.6, 0, 0.8, 0])),
            written(doc('W', 'Wrong size', MIS_SIZED_QUERY, PartitionedDoc))
        ]);
        await gom.save(doc('D', 'Delta', [0, 0, 0, 1]));
        if (engine.type === DatabaseType.NEO4J) {
            await pm.execute(new QuerySpecification('CALL db.awaitIndexes(30)'));
        }
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'SizedTest');
        await gom.indexes.drop(spec);
        await closeGraphEngines();
    });

    it('should leave out a node whose embedding is of another size, plain, filtered or as a view', async () => {
        const options = { topK: SIZED_WIDE, searchK: SIZED_WIDE };
        expect(ids(await gom.loadNearest(SizedDoc, SIZED_QUERY, options))).toEqual(['A', 'B', 'C', 'D']);
        const filtered = await gom.loadNearest(SizedDoc, SIZED_QUERY, {
            ...options,
            where: (q) => q.title.neq('Alpha')
        });
        expect(ids(filtered)).toEqual(['B', 'C', 'D']);
        // W has an author, as A, B and C do; D has none, so a view leaves it out.
        const viewed = await gom.loadNearest(SizedDocView, SIZED_QUERY, options);
        expect(viewed.map((it) => it.value.doc.id)).toEqual(['A', 'B', 'C']);
    });

    it("should find only the nodes of a vector's size when the index is of another, or refuse it", async () => {
        const search = gom.loadNearest(SizedDoc, MIS_SIZED_QUERY, { topK: SIZED_WIDE, searchK: SIZED_WIDE });
        if (!sql) {
            // A graph engine searches only through its index, which refuses a vector of another size.
            await expect(search).rejects.toThrow();
            return;
        }
        // A SQL store with an index of another size measures every node instead, as one with none does.
        expect(ids(await search)).toEqual(['W']);
    });

    it('should leave out a node whose embedding is of another size from a search partitioned with no index', async () => {
        if (!sql) {
            // A graph engine searches a partition only through an index made for it.
            return;
        }
        const found = await gom.loadNearest(SizedDoc, SIZED_QUERY, {
            topK: SIZED_WIDE,
            partitionLabel: 'SizedCorpus'
        });
        expect(ids(found)).toEqual(['A']);
    });
});
