import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    fullTextIndex,
    FullTextIndex,
    GraphObjectManagerFactory,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    Root,
    SchemaCatalog,
    SchemaManager,
    StatelessGraphObjectManager,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

@NodeFragment({ labels: ['MatchTest', 'Chunk'] })
class Chunk {
    @NodeId() id: string;
    @FullTextIndex() body?: string;
    sectionId?: string;
}

@NodeFragment({ labels: ['MatchArticle'] })
@FullTextIndex({ properties: ['title', 'summary'] })
class Article {
    @NodeId() id: string;
    title?: string;
    summary?: string;
}

@NodeFragment({ labels: ['MatchTest', 'Section'] })
class Section {
    @NodeId() id: string;
}

@GraphView()
class ChunkInSection {
    @Root() chunk: Chunk;
    @GraphRelationship({ type: 'IN', target: () => Section, required: true }) section: Section;
}

const chunk = (id: string, body: string, sectionId = 's1'): Chunk =>
    Object.assign(new Chunk(), { id, body, sectionId });

describe.each(allStores())('loadMatching on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const specs = [fullTextIndex('MatchTest', 'body'), fullTextIndex('MatchArticle', ['title', 'summary'])];

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await clearLabels(pm, engine, 'MatchTest', 'MatchArticle');
        const factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
        await new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, Chunk, Article).forDatabase(engine.name)]
        }).enforce();
        await gom.saveAll([
            chunk('c1', 'graph databases store relationships natively'),
            chunk('c2', 'graph databases and graph queries', 's2'),
            chunk('c3', 'relational tables'),
            Object.assign(new Article(), { id: 'a1', title: 'Moon Girl', summary: 'a genius inventor' }),
            Object.assign(new Article(), { id: 'a2', title: 'Devil', summary: 'a dinosaur' })
        ]);
        await gom.save(
            Object.assign(new ChunkInSection(), {
                chunk: chunk('c1', 'graph databases store relationships natively'),
                section: Object.assign(new Section(), { id: 's1' })
            })
        );
        if (engine.type === DatabaseType.NEO4J) {
            await pm.execute(new QuerySpecification('CALL db.awaitIndexes(30)'));
        }
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'MatchTest', 'MatchArticle');
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await closeGraphEngines();
    });

    it('should find matches by a field’s index, scaled so the best hit is 1', async () => {
        const hits = await gom.loadMatching(Chunk, 'graph', { topK: 10 });
        expect(hits.map((it) => it.value.id).sort()).toEqual(['c1', 'c2']);
        expect(hits[0].score).toBeCloseTo(1, 5);
        expect(hits.every((it) => it.score > 0 && it.score <= 1)).toBe(true);
        expect(hits[0].value).toBeInstanceOf(Chunk);
        expect(hits.map((it) => it.score)).toEqual([...hits.map((it) => it.score)].sort((a, b) => b - a));
    });

    it('should search a class-level index over several properties', async () => {
        const hits = await gom.loadMatching(Article, 'inventor', { topK: 5 });
        expect(hits.map((it) => it.value.id)).toEqual(['a1']);
    });

    it('should limit to topK, and filter by threshold and where', async () => {
        expect((await gom.loadMatching(Chunk, 'graph', { topK: 1 })).length).toEqual(1);
        const scoped = await gom.loadMatching(Chunk, 'graph', {
            topK: 10,
            where:
                engine.type === DatabaseType.ORACLE
                    ? "JSON_VALUE(n.props, '$.sectionId') = $s"
                    : engine.type === DatabaseType.POSTGRES
                    ? "(n.props ->> 'sectionId') = $s"
                    : 'n.sectionId = $s',
            bindings: { s: 's2' }
        });
        expect(scoped.map((it) => it.value.id)).toEqual(['c2']);
        const typed = await gom.loadMatching(Chunk, 'graph', { topK: 10, where: (q) => q.sectionId.eq('s2') });
        expect(typed.map((it) => it.value.id)).toEqual(['c2']);
        expect((await gom.loadMatching(Chunk, 'graph', { topK: 10, threshold: 1.01 })).length).toEqual(0);
    });

    it('should search a view by its root, keeping only roots with its required relationships', async () => {
        const hits = await gom.loadMatching(ChunkInSection, 'graph', { topK: 10 });
        expect(hits.map((it) => it.value.chunk.id)).toEqual(['c1']);
        expect(hits[0].value.section.id).toEqual('s1');
    });
});
