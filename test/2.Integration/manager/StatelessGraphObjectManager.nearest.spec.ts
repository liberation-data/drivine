import {
    CypherBackend,
    cypherGrammarFor,
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
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

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

describe.each(graphEngines())('loadNearest on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const specs = [vectorIndex('NearestTest', 'embedding', 3), vectorIndex('NearestTest', 'position', 2, 'EUCLIDEAN')];

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await pm.execute(new QuerySpecification('MATCH (n:NearestTest) DETACH DELETE n'));
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
        await pm.execute(new QuerySpecification('MATCH (n:NearestTest) DETACH DELETE n'));
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
            where: 'n.contextId = $context',
            bindings: { context: 'b' }
        });
        expect(scoped.map((it) => it.value.id)).toEqual(['east']);
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
