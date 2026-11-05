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
import * as fs from 'fs';
import * as path from 'path';
import { clearLabels, closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { sqlStores } from '../support/SqlStores';

jest.setTimeout(120_000);

/**
 * How closely a SQL store's full-text ranking agrees with Neo4j's, whose full-text index is Lucene's and scores by BM25
 * (drivine4j#604). Over a fixed corpus, the sections of drivine4j's docs at 3a8b0b12 (`fulltext/docs-corpus.json`, each
 * section a node, as drivine4j's FullTextRankingAgreementTest reads it), each query's top hit is compared with Neo4j's,
 * and the top five as sets. Scored by raw term counts, a store let common words outweigh the word a query is about, and
 * long texts win by holding more of everything: 6 of 21 top hits were Neo4j's, and are 17 now.
 */
@NodeFragment({ labels: ['RankArticle'] })
class RankArticle {
    @NodeId() id: string;
    title?: string;
    @FullTextIndex() body?: string;
}

const TOP = 5;

const CORPUS: { id: string; title: string; body: string }[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fulltext', 'docs-corpus.json'), 'utf8')
);

/** Queries a reader of the docs might ask, from a rare exact term to a few common words; and #604's own. */
const QUERIES = [
    'GraphObjectManager',
    'agent process persistence',
    'Jinja',
    'full-text search',
    'vector index',
    'transaction rollback',
    'optimistic locking stamp',
    'schema marker',
    'cascade delete',
    'Cypher on a relational database',
    'polymorphic subtype',
    'connection provider',
    'Spring Boot configuration',
    'query DSL',
    'Memgraph',
    'pgvector',
    'keyset pagination',
    'property bag',
    'relationship direction',
    'Oracle Text',
    'test containers',
    'save all atomically'
];

const neo4j = graphEngines().find((it) => it.type === DatabaseType.NEO4J);
const stores = neo4j ? sqlStores() : [];
const spec = fullTextIndex('RankArticle', 'body');

/** Each query's top hits on the store, by id, best first. */
async function ranked(gom: StatelessGraphObjectManager): Promise<Map<string, string[]>> {
    const hits = new Map<string, string[]>();
    for (const query of QUERIES) {
        hits.set(
            query,
            (await gom.loadMatching(RankArticle, query, { topK: TOP })).map((it) => it.value.id)
        );
    }
    return hits;
}

async function seeded(
    pm: PersistenceManager,
    engine: { name: string; type: DatabaseType }
): Promise<StatelessGraphObjectManager> {
    const gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
    await gom.indexes.drop(spec);
    await clearLabels(pm, engine, 'RankArticle');
    await gom.saveAll(CORPUS.map((it) => Object.assign(new RankArticle(), it)));
    return gom;
}

(stores.length ? describe : describe.skip)('Full-text ranking against Neo4j', () => {
    let reference: Map<string, string[]>;

    beforeAll(async () => {
        const pm = persistenceManagerFor(neo4j!);
        const gom = await seeded(pm, neo4j!);
        await gom.indexes.ensure(spec);
        await pm.execute(new QuerySpecification('CALL db.awaitIndexes(60)'));
        reference = await ranked(gom);
        await gom.indexes.drop(spec);
        await clearLabels(pm, neo4j!, 'RankArticle');
    });

    afterAll(async () => {
        await closeGraphEngines();
    });

    describe.each(
        stores.flatMap((it) =>
            it.type === DatabaseType.POSTGRES
                ? [
                      { ...it, indexed: false },
                      { ...it, indexed: true }
                  ]
                : [{ ...it, indexed: false }]
        )
    )('on $type (indexed: $indexed)', (store) => {
        it('should give the top hits Neo4j gives, as BM25 ranks them', async () => {
            const pm = persistenceManagerFor(store);
            const gom = await seeded(pm, store);
            if (store.indexed) {
                await gom.indexes.ensure(spec);
            }
            const hits = await ranked(gom);
            await gom.indexes.drop(spec);
            await clearLabels(pm, store, 'RankArticle');
            const asked = QUERIES.filter((it) => reference.get(it)!.length > 0);
            const sameTop = asked.filter((it) => hits.get(it)![0] === reference.get(it)![0]).length;
            const overlap =
                asked
                    .map((it) => hits.get(it)!.filter((id) => reference.get(it)!.includes(id)).length)
                    .reduce((a, b) => a + b, 0) / asked.length;
            // eslint-disable-next-line no-console
            console.log(
                `${store.type}${store.indexed ? ' indexed' : ''}: same top hit ${sameTop}/${
                    asked.length
                }, mean overlap of the top ${TOP} ${overlap.toFixed(2)}`
            );
            expect(sameTop).toBeGreaterThanOrEqual(Math.floor((asked.length * 3) / 4));
            expect(overlap).toBeGreaterThanOrEqual(3.5);
        });
    });
});
