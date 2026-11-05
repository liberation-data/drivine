import {
    backendFor,
    DatabaseType,
    fullTextIndex,
    FullTextIndex,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { B, K1, PREFIX } from '@/backend/sql/Bm25';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(60_000);

/**
 * Full-text search scores by BM25 on every store (drivine4j#604): Lucene's, on Neo4j, and bm25Ranked on the SQL stores
 * without a text index of their own. A rare term outweighs a common one, a short text outranks a long one that holds a
 * term as often, and a term's count adds less each time it is counted again. Memgraph and FalkorDB score by their own
 * measures, and are left out.
 */
@NodeFragment({ labels: ['Bm25Article'] })
class Bm25Article {
    @NodeId() id: string;
    @FullTextIndex() body?: string;
}

/** A text searched over two properties, either of which a node may lack. */
@NodeFragment({ labels: ['Bm25Paper'] })
@FullTextIndex({ properties: ['title', 'body'] })
class Bm25Paper {
    @NodeId() id: string;
    title?: string;
    body?: string;
}

const article = (id: string, body: string): Bm25Article => Object.assign(new Bm25Article(), { id, body });

/** drivine4j#612's texts, measured on Neo4j: a prefix that "rare" alone holds beside "melon". */
@NodeFragment({ labels: ['Bm25Fruit'] })
class Bm25Fruit {
    @NodeId() id: string;
    @FullTextIndex() body?: string;
}

const FRUITS: Record<string, string> = {
    one: 'kiwi',
    three: 'kiwi kiwis kiwifruit',
    long: 'a kiwi among a great many other words that make this text far longer than any of the others',
    rare: 'kiwano melon',
    other: 'nothing here'
};

/** With the twenty common ones, "graph" is in most texts, so it says little of any; "soup" is in one. */
const ARTICLES = [
    ...Array.from({ length: 20 }, (_, i) => article(`common${i + 1}`, 'a note on a graph and its nodes')),
    article('many', 'graph graph graph graph and more of the graph'),
    article('rare', 'a graph of soup'),
    article('short', 'zebra crossing'),
    article('long', 'zebra and a great many other words that make this text far longer than the one before it is'),
    article('once', 'kiwi bird'),
    article('often', 'kiwi kiwi kiwi kiwi kiwi kiwi kiwi kiwi kiwi kiwi'),
    article('none', 'nothing to see')
];

/** A missing property is no text, and its length none. */
const PAPERS = [
    Object.assign(new Bm25Paper(), { id: 'untitled', body: 'kiwi pie' }),
    Object.assign(new Bm25Paper(), { id: 'unbodied', title: 'kiwi' }),
    Object.assign(new Bm25Paper(), { id: 'both', title: 'kiwi', body: 'kiwi kiwi' }),
    Object.assign(new Bm25Paper(), { id: 'other', title: 'nothing', body: 'to see' })
];

const SCORED = [DatabaseType.NEO4J, DatabaseType.POSTGRES, DatabaseType.SQLITE, DatabaseType.ORACLE];

describe.each(allStores().filter((it) => SCORED.includes(it.type)))('BM25 full-text scoring on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const specs = [
        fullTextIndex('Bm25Article', 'body'),
        fullTextIndex('Bm25Paper', ['title', 'body']),
        fullTextIndex('Bm25Fruit', 'body')
    ];
    /** A text's length as the store measures it for BM25: in characters on the SQL stores, in tokens on Lucene. */
    const length = (text: string): number =>
        engine.type === DatabaseType.NEO4J ? text.split(' ').length : text.length;
    const search = async (text: string) => gom.loadMatching(Bm25Article, text, { topK: 50 });
    const awaitIndexes = async () => {
        if (engine.type === DatabaseType.NEO4J) {
            await pm.execute(new QuerySpecification('CALL db.awaitIndexes(30)'));
        }
    };

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await clearLabels(pm, engine, 'Bm25Article', 'Bm25Paper', 'Bm25Fruit');
        await gom.saveAll([
            ...ARTICLES,
            ...PAPERS,
            ...Object.entries(FRUITS).map(([id, body]) => Object.assign(new Bm25Fruit(), { id, body }))
        ]);
        // Neo4j searches through its index only; the SQL stores search without one, and Postgres compares the two below.
        if (engine.type === DatabaseType.NEO4J) {
            for (const spec of specs) {
                await gom.indexes.ensure(spec);
            }
        }
        await awaitIndexes();
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'Bm25Article', 'Bm25Paper', 'Bm25Fruit');
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await closeGraphEngines();
    });

    it('should weigh a rare term above a common one counted more often', async () => {
        const hits = await search('graph soup');
        expect(hits[0].value.id).toEqual('rare');
        expect(hits[0].score).toBeCloseTo(1, 9);
        expect(hits.every((it) => it.score > 0 && it.score <= 1)).toBe(true);
        if (engine.type !== DatabaseType.NEO4J) {
            // bm25Ranked's own figure, lengths in characters (Lucene's are in words): "graph" counted 3 times in 45
            // characters (back to back, the pattern counts every other one: drivine4j#607 moves this), against "graph" and
            // "soup" once each in 15, over 27 texts of 857 characters, "graph" in 22 and "soup" in 1.
            expect(hits.find((it) => it.value.id === 'many')!.score).toBeCloseTo(0.07864229315202613, 9);
        }
    });

    it('should rank a short text above a long one that holds the term as often', async () => {
        const hits = await search('zebra');
        expect(hits.map((it) => it.value.id)).toEqual(['short', 'long']);
        // Counted alone, the two tied.
        expect(hits[0].score).toBeGreaterThan(hits[1].score);
    });

    it('should add less for a term each time it is counted again', async () => {
        const hits = new Map((await search('kiwi')).map((it) => [it.value.id, it.score]));
        expect(hits.get('often')).toBeCloseTo(1, 9);
        // Ten times the count, as long again as the other's text: not ten times the score.
        expect(hits.get('once')).toBeGreaterThan(0.4);
    });

    it("should score every node a prefix term finds alike, as Lucene's prefix query does", async () => {
        // Lucene scores a prefix query by a constant, not by how often or how rare (drivine4j#612).
        const hits = await search('kiw*');
        expect(new Set(hits.map((it) => it.value.id))).toEqual(new Set(['once', 'often']));
        hits.forEach((it) => expect(it.score).toBeCloseTo(1, 9));
    });

    it('should add the same for a prefix term beside a word to each node that holds it', async () => {
        const hits = await search('kiw* bird');
        expect(hits.map((it) => it.value.id)).toEqual(['once', 'often']);
        expect(hits[1].score).toBeLessThan(hits[0].score);
    });

    it("should weigh a prefix term beside a rare word as Lucene's constant beside its BM25, as Neo4j measured", async () => {
        const fruit = async (query: string): Promise<Map<string, number>> =>
            new Map((await gom.loadMatching(Bm25Fruit, query, { topK: 50 })).map((it) => [it.value.id, it.score]));
        // On Neo4j, every hit of a prefix alone scored 1 (drivine4j#612).
        const prefix = await fruit('kiw*');
        const whole = await fruit('kiwi*');
        expect(new Set(prefix.keys())).toEqual(new Set(['one', 'three', 'long', 'rare']));
        expect(new Set(whole.keys())).toEqual(new Set(['one', 'three', 'long']));
        [...prefix.values(), ...whole.values()].forEach((it) => expect(it).toBeCloseTo(1, 6));
        // "melon" is in "rare" alone: its BM25 beside the prefix's constant, with the lengths the store measures.
        const lengths = Object.fromEntries(Object.entries(FRUITS).map(([id, body]) => [id, length(body)]));
        const average = Object.values(lengths).reduce((a, b) => a + b, 0) / Object.keys(lengths).length;
        const n = Object.keys(FRUITS).length;
        const idf = Math.log(1 + (n - 1 + 0.5) / (1 + 0.5));
        const melon = (idf * (K1 + 1)) / (1 + K1 * (1 - B + (B * lengths.rare) / average));
        const expected = PREFIX / (PREFIX + melon);
        for (const query of ['kiw* melon', '+kiw* melon']) {
            const hits = await fruit(query);
            expect(new Set(hits.keys())).toEqual(new Set(['one', 'three', 'long', 'rare']));
            expect(hits.get('rare')).toBeCloseTo(1, 6);
            ['one', 'three', 'long'].forEach((it) => expect(Math.abs(hits.get(it)! - expected)).toBeLessThan(1e-4));
        }
        // Neo4j gave 0.5409; the SQL stores, measuring length in characters, about 0.549.
        expect(Math.abs(expected - 0.5409)).toBeLessThan(0.01);
    });

    it('should still find the nodes of a common term, and keep required and excluded terms', async () => {
        expect((await search('graph')).length).toEqual(22);
        expect((await search('+soup graph')).map((it) => it.value.id)).toEqual(['rare']);
        expect((await search('zebra -longer')).map((it) => it.value.id)).toEqual(['short']);
        expect((await search('+zebra')).map((it) => it.value.id)).toEqual(['short', 'long']);
    });

    it('should measure a node that lacks one of several searched properties by the rest, and score it', async () => {
        const hits = await gom.loadMatching(Bm25Paper, 'kiwi', { topK: 50 });
        expect(new Set(hits.map((it) => it.value.id))).toEqual(new Set(['untitled', 'unbodied', 'both']));
        expect(hits.every((it) => it.score > 0)).toBe(true);
    });

    if (engine.type === DatabaseType.POSTGRES) {
        it('should score each node alike narrowed by the index and without it', async () => {
            const queries = [
                'graph soup',
                'zebra',
                'kiwi',
                'graph',
                '+soup graph',
                '"zebra crossing" kiwi',
                'zebra -longer',
                '+"of soup" graph'
            ];
            const scores = async () =>
                Promise.all(
                    queries.map(async (it) => new Map((await search(it)).map((hit) => [hit.value.id, hit.score])))
                );
            const bare = await scores();
            await gom.indexes.ensure(specs[0]);
            const narrowed = await scores();
            await gom.indexes.drop(specs[0]);
            queries.forEach((query, i) => {
                expect([...narrowed[i].keys()].sort()).toEqual([...bare[i].keys()].sort());
                bare[i].forEach((score, id) => expect(narrowed[i].get(id)).toBeCloseTo(score, 9));
            });
        });
    }
});
