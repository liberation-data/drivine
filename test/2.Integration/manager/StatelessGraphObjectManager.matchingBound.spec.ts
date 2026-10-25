import {
    backendFor,
    DatabaseType,
    FULL_TEXT_FILTERED_OVER_FETCH,
    fullTextIndex,
    FullTextIndex,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    Scored,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(60_000);

@NodeFragment({ labels: ['MatchBound'] })
class Zebra {
    @NodeId() id: string;
    title?: string;
    @FullTextIndex() body?: string;
}

const LABEL = 'MatchBound';
const spec = fullTextIndex(LABEL, 'body');

/** A manager over an empty `MatchBound` label with its full-text index, seeded by `seed`. */
async function seeded(
    engine: GraphEngine,
    // Counts are written in, not bound: a JS number goes over Bolt as a float, which range() refuses.
    seed: string,
    params: Record<string, any>
): Promise<{ pm: PersistenceManager; gom: StatelessGraphObjectManager }> {
    const pm = persistenceManagerFor(engine);
    const gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
    await clearLabels(pm, engine, LABEL);
    await gom.indexes.drop(spec);
    await gom.indexes.ensure(spec);
    await pm.execute(new QuerySpecification(seed).bind(params));
    if (engine.type === DatabaseType.NEO4J) {
        await pm.execute(new QuerySpecification('CALL db.awaitIndexes(30)'));
    }
    return { pm, gom };
}

async function cleared(engine: GraphEngine, seededWith: { pm: PersistenceManager; gom: StatelessGraphObjectManager }) {
    await clearLabels(seededWith.pm, engine, LABEL);
    await seededWith.gom.indexes.drop(spec);
    await closeGraphEngines();
}

/**
 * The hits are cut to the best before they are collected, and a fragment's rows are limited without a sort of their
 * own, so both rely on the hits coming best first. Twelve articles match "zebra", each longer than the last, so each
 * scores below the last; the even ones are titled "keep". They are stored worst first, so the order they are stored in
 * is not the order they rank in.
 */
describe.each(graphEngines())('loadMatching’s index bound on $type', (engine) => {
    let seededWith: { pm: PersistenceManager; gom: StatelessGraphObjectManager };
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        seededWith = await seeded(
            engine,
            `UNWIND range(12, 1, -1) AS i
             CREATE (:${LABEL} {
                 id: 'z' + toString(i),
                 title: CASE WHEN i % 2 = 0 THEN 'keep' ELSE 'drop' END,
                 body: 'zebra' + reduce(s = '', j IN range(1, i) | s + ' grass')
             })`,
            {}
        );
        gom = seededWith.gom;
    });

    afterAll(async () => cleared(engine, seededWith));

    it('should return the best topK of the whole ranking when the cut bites', async () => {
        const ranked = await gom.loadMatching(Zebra, 'zebra', { topK: 20 });
        expect(ranked).toHaveLength(12);
        expect(ranked.map((it) => it.score)).toEqual([...ranked.map((it) => it.score)].sort((a, b) => b - a));
        // FalkorDB's call takes no limit: only the cut keeps the best, not the first the call yields.
        const top = await gom.loadMatching(Zebra, 'zebra', { topK: 3 });
        expect(top.map((it) => it.value.id)).toEqual(ranked.slice(0, 3).map((it) => it.value.id));
        expect(top[0].score).toBeCloseTo(1, 9);
    });

    it('should keep the best of the hits a filter passes, not the first it is given', async () => {
        const ranked = await gom.loadMatching(Zebra, 'zebra', { topK: 20 });
        const bestKept = ranked.filter((it) => it.value.title === 'keep').slice(0, 2);
        const kept = await gom.loadMatching(Zebra, 'zebra', { topK: 2, where: (q) => q.title.eq('keep') });
        expect(kept.map((it) => it.value.id)).toEqual(bestKept.map((it) => it.value.id));
        kept.forEach((it, i) => expect(it.score).toBeCloseTo(bestKept[i].score, 9));
    });

    it('should return every hit for a topK as large as a JS number holds exactly', async () => {
        expect(await gom.loadMatching(Zebra, 'zebra', { topK: Number.MAX_SAFE_INTEGER })).toHaveLength(12);
        const allKept = await gom.loadMatching(Zebra, 'zebra', {
            topK: Number.MAX_SAFE_INTEGER,
            where: (q) => q.title.eq('keep')
        });
        expect(allKept).toHaveLength(6);
    });

    it('should refuse a topK of 0, or one too large for a JS number to hold exactly', async () => {
        await expect(gom.loadMatching(Zebra, 'zebra', { topK: 0 })).rejects.toThrow(/topK must be a whole number/);
        await expect(gom.loadMatching(Zebra, 'zebra', { topK: 1e300 })).rejects.toThrow(/topK must be a whole number/);
    });
});

/**
 * On a real Neo4j: the index yields no more hits than the search's limit. Thirty articles match "zebra"; the one under
 * test is by far the longest, so BM25 ranks it last. A filtered search for it wanting one row asks the index for ten
 * hits, which don't reach it; wanting three asks for thirty, which do. That is the bound and the trade it makes, seen
 * in the rows rather than read off the statement.
 */
describe.each(graphEngines().filter((it) => it.type === DatabaseType.NEO4J))(
    'loadMatching’s index bound on a real $type',
    (engine) => {
        const MATCHING = 30;
        const LAST = 'z-last';
        let seededWith: { pm: PersistenceManager; gom: StatelessGraphObjectManager };
        let gom: StatelessGraphObjectManager;

        beforeAll(async () => {
            seededWith = await seeded(
                engine,
                `UNWIND range(1, ${MATCHING - 1}) AS i
                 CREATE (:${LABEL} {id: 'z' + toString(i), title: 'short', body: 'zebra ' + reduce(s = '', j IN range(1, i) | s + 'grass ')})
                 WITH count(*) AS made
                 CREATE (:${LABEL} {id: $last, title: 'long', body: 'zebra ' + reduce(s = '', j IN range(1, 400) | s + 'savannah ')})`,
                { last: LAST }
            );
            gom = seededWith.gom;
        });

        afterAll(async () => cleared(engine, seededWith));

        const onlyTheLast = async (topK: number): Promise<Scored<Zebra>[]> =>
            gom.loadMatching(Zebra, 'zebra', { topK, where: (q) => q.id.eq(LAST) });

        it('should let a filtered search see only the best topK times the over-fetch', async () => {
            expect(FULL_TEXT_FILTERED_OVER_FETCH).toBeLessThan(MATCHING - 1);
            expect((await onlyTheLast(1)).map((it) => it.value.id)).toEqual([]);
        });

        it('should find the hit once the over-fetch reaches it', async () => {
            expect((await onlyTheLast(3)).map((it) => it.value.id)).toEqual([LAST]);
        });

        it('should return the best topK of an unfiltered search, best first', async () => {
            const found = await gom.loadMatching(Zebra, 'zebra', { topK: 5 });
            expect(found).toHaveLength(5);
            expect(found[0].score).toBeCloseTo(1, 9);
            expect(found.map((it) => it.score)).toEqual([...found.map((it) => it.score)].sort((a, b) => b - a));
            expect(found.map((it) => it.value.id)).not.toContain(LAST);
        });
    }
);

/**
 * Memgraph's `text_search` yields its best 1,000 hits unless its call is given a limit, so the limit a search asks for
 * has to reach the call there, not only the cut after it.
 */
describe.each(graphEngines().filter((it) => it.type === DatabaseType.MEMGRAPH))(
    'loadMatching past 1,000 hits on $type',
    (engine) => {
        const MATCHING = 1_100;
        let seededWith: { pm: PersistenceManager; gom: StatelessGraphObjectManager };

        beforeAll(async () => {
            seededWith = await seeded(
                engine,
                `UNWIND range(1, ${MATCHING}) AS i CREATE (:${LABEL} {id: 'm' + toString(i), title: 't', body: 'zebra ' + toString(i)})`,
                {}
            );
        });

        afterAll(async () => cleared(engine, seededWith));

        it('should return more than a thousand hits when asked for them', async () => {
            expect(await seededWith.gom.loadMatching(Zebra, 'zebra', { topK: MATCHING })).toHaveLength(MATCHING);
        });
    }
);
