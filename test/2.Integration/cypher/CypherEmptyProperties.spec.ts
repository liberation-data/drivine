import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';
import { cypherSqlStores } from '../support/SqlStores';

jest.setTimeout(120_000);

/** Neo4j, the default connection, where it is configured, and the SQL stores, on which each statement is compiled to SQL. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...cypherSqlStores()];
}

/**
 * An empty map of properties in a pattern, `(a {})` or `[r {}]`, which every node and relationship meets: it matches as
 * the pattern without it does, and written it sets nothing (#605, liberation-data/drivine4j#583). drivine4j's
 * `CypherQueryContract` case, not in the spec yet. Its third node has a label of its own, so the suite clears it, and
 * reads no node of a suite beside it on the same store.
 */
describe.each(stores())('An empty map of properties in a pattern on $type', (store) => {
    let pm: PersistenceManager;

    const rows = async (cypher: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }));

    const clear = async (): Promise<void> => clearLabels(pm, store, 'CyEm', 'CyEmOther', 'CyEmNew');

    beforeAll(async () => {
        pm = persistenceManagerFor(store);
        await clear();
        await rows('CREATE (a:CyEm {k: 1})-[:CY_EM {w: 1}]->(b:CyEm {k: 2})-[:CY_EM]->(c:CyEmOther {k: 3})');
    });

    afterAll(async () => {
        await clear();
        await closeGraphEngines();
    });

    it('matches as the pattern without it', async () => {
        const ours = 'WHERE a:CyEm OR a:CyEmOther';
        for (const [empty, without] of [
            [`MATCH (a {}) ${ours} RETURN a.k ORDER BY a.k`, `MATCH (a) ${ours} RETURN a.k ORDER BY a.k`],
            ['MATCH (a:CyEm {}) RETURN a.k ORDER BY a.k', 'MATCH (a:CyEm) RETURN a.k ORDER BY a.k'],
            [
                'MATCH (a)-[r:CY_EM {}]->(b {}) RETURN [a.k, b.k] ORDER BY a.k',
                'MATCH (a)-[r:CY_EM]->(b) RETURN [a.k, b.k] ORDER BY a.k'
            ],
            [
                'MATCH (a:CyEm {k: 1})-[:CY_EM*1..2 {}]->(b) RETURN b.k ORDER BY b.k',
                'MATCH (a:CyEm {k: 1})-[:CY_EM*1..2]->(b) RETURN b.k ORDER BY b.k'
            ],
            [
                'MATCH (a:CyEm {k: 1})-[:CY_EM*1..2]->(b {}) RETURN b.k ORDER BY b.k',
                'MATCH (a:CyEm {k: 1})-[:CY_EM*1..2]->(b) RETURN b.k ORDER BY b.k'
            ],
            [
                'MATCH (a:CyEm {k: 1}) ((x {})-[:CY_EM {}]->(y)){1,2} (b) RETURN b.k ORDER BY b.k',
                'MATCH (a:CyEm {k: 1}) ((x)-[:CY_EM]->(y)){1,2} (b) RETURN b.k ORDER BY b.k'
            ],
            [
                'MATCH (a:CyEm) WHERE EXISTS { (a)-[:CY_EM {}]->({}) } RETURN a.k ORDER BY a.k',
                'MATCH (a:CyEm) WHERE EXISTS { (a)-[:CY_EM]->() } RETURN a.k ORDER BY a.k'
            ]
        ]) {
            const expected = await rows(without);
            expect([without, expected.length > 0]).toEqual([without, true]);
            expect([empty, await rows(empty)]).toEqual([empty, expected]);
        }
    });

    it('sets nothing written, and a MERGE finds what is there', async () => {
        await rows('MERGE (n:CyEm {}) RETURN count(n)');
        expect((await rows('MATCH (n:CyEm) RETURN count(n)')).map(Number)).toEqual([2]);
        await rows('CREATE (:CyEmNew {})');
        expect(await rows('MATCH (n:CyEmNew) RETURN keys(n)')).toEqual([[]]);
    });
});
