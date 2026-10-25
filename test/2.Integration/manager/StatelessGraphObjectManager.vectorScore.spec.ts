import {
    backendFor,
    DatabaseType,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    StatelessGraphObjectManager,
    VectorIndex,
    vectorIndex
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

/**
 * The score of a known pair of vectors, the same on every store: `(1 + cos) / 2` for cosine and `1 / (1 + d²)` for
 * Euclidean. Each node is measured from Q, at `[1, 0]`:
 *
 * | node | cosine embedding | cos  | score | euclidean embedding | d²  | score |
 * |------|------------------|------|-------|---------------------|-----|-------|
 * | Q    | [1, 0]           | 1    | 1     | [1, 0]              | 0   | 1     |
 * | P    | [0.6, 0.8]       | 0.6  | 0.8   | [0.6, 0.8]          | 0.8 | 1/1.8 |
 * | N    | [-0.6, 0.8]      | -0.6 | 0.2   | [3, 4]              | 20  | 1/21  |
 * | O    | [-1, 0]          | -1   | 0     | [1, 2]              | 4   | 0.2   |
 *
 * The negative cosines are there for Memgraph, whose `similarity` is the absolute value of `1 - distance`, so N and O
 * would score as P and Q do were it read (memgraph/memgraph#5199). Ported from drivine4j's VectorScoreCrossEngineTest.
 */
@NodeFragment({ labels: ['ScoredPair'] })
class ScoredPair {
    @NodeId() id: string;
    @VectorIndex({ dimensions: 2, similarity: 'COSINE' }) cosine?: number[];
    @VectorIndex({ dimensions: 2, similarity: 'EUCLIDEAN' }) euclidean?: number[];
}

const QUERY = [1, 0];
const COSINE: [string, number][] = [
    ['Q', 1],
    ['P', 0.8],
    ['N', 0.2],
    ['O', 0]
];
const EUCLIDEAN: [string, number][] = [
    ['Q', 1],
    ['P', 1 / 1.8],
    ['O', 0.2],
    ['N', 1 / 21]
];

/** Wide enough that every store, approximate or not, sees every node. */
const WIDE = 10;

/** A quantizing Neo4j index reports 0.7998811 for an exact 0.8. */
const TOLERANCE = 1e-3;

const pair = (id: string, cosine: number[], euclidean: number[]): ScoredPair =>
    Object.assign(new ScoredPair(), { id, cosine, euclidean });

describe.each(allStores())('vector scores on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const specs = [
        vectorIndex('ScoredPair', 'cosine', 2, 'COSINE'),
        vectorIndex('ScoredPair', 'euclidean', 2, 'EUCLIDEAN')
    ];

    const nearest = async (property: string, options: { topK?: number; threshold?: number; searchK?: number } = {}) =>
        (await gom.loadNearest(ScoredPair, QUERY, { topK: WIDE, property, ...options })).map((it): [string, number] => [
            it.value.id,
            it.score
        ]);

    const expectScored = (actual: [string, number][], expected: [string, number][]): void => {
        // A score within the tolerance is shown as the one expected, so a failure lists each node with what it scored.
        const shown = actual.map(([id, score], i) => [
            id,
            expected[i] && Math.abs(score - expected[i][1]) < TOLERANCE ? expected[i][1] : score
        ]);
        expect(shown).toEqual(expected);
    };

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await clearLabels(pm, engine, 'ScoredPair');
        if (engine.type === DatabaseType.MEMGRAPH) {
            // Memgraph's vector search returns nodes deleted since its last garbage collection, and fails on them.
            await pm.execute(new QuerySpecification('FREE MEMORY'));
        }
        for (const spec of specs) {
            await gom.indexes.ensure(spec);
        }
        await gom.saveAll([
            pair('Q', [1, 0], [1, 0]),
            pair('P', [0.6, 0.8], [0.6, 0.8]),
            pair('N', [-0.6, 0.8], [3, 4]),
            pair('O', [-1, 0], [1, 2])
        ]);
        if (engine.type === DatabaseType.NEO4J) {
            // A vector index is filled in the background; it must hold the nodes before it is searched.
            await pm.execute(new QuerySpecification('CALL db.awaitIndexes(30)'));
        }
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'ScoredPair');
        for (const spec of specs) {
            await gom.indexes.drop(spec);
        }
        await closeGraphEngines();
    });

    it('should score a cosine pair (1 + cos) / 2, a negative cosine below one half', async () => {
        expectScored(await nearest('cosine'), COSINE);
    });

    it('should score a euclidean pair 1 / (1 + d²)', async () => {
        expectScored(await nearest('euclidean'), EUCLIDEAN);
    });

    it('should give the same scores when fewer are asked for than searched', async () => {
        expectScored(await nearest('cosine', { topK: 2, searchK: WIDE }), COSINE.slice(0, 2));
        expectScored(await nearest('euclidean', { topK: 2, searchK: WIDE }), EUCLIDEAN.slice(0, 2));
    });

    it('should compare a threshold with that score', async () => {
        expectScored(await nearest('cosine', { threshold: 0.5 }), COSINE.slice(0, 2));
        expectScored(await nearest('cosine', { threshold: 0.1 }), COSINE.slice(0, 3));
        expectScored(await nearest('euclidean', { threshold: 0.1 }), EUCLIDEAN.slice(0, 3));
    });
});
