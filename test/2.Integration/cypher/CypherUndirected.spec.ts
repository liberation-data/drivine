import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { closeGraphEngines, GraphEngine, graphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { cypherSqlStores } from '../support/SqlStores';

jest.setTimeout(120_000);

/** Neo4j, the default connection, where it is configured, and the SQL stores, on which each statement is compiled to SQL. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...cypherSqlStores()];
}

/**
 * A relationship of either direction is found each way round, and one from a node to itself once (#588,
 * liberation-data/drivine4j#570). On Postgres and Oracle it is read both ways round and joined on equalities, where it
 * joined with an OR; SQLite keeps the OR. These are drivine4j's `CypherQueryContract` and `CypherWriteContract` cases;
 * the rows are Neo4j's.
 */
describe.each(stores())('A relationship of either direction on $type', (store) => {
    let pm: PersistenceManager;
    const query = async (cypher: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }));

    beforeAll(() => {
        pm = persistenceManagerFor(store);
    });

    beforeEach(async () => {
        await query('MATCH (n) WHERE n:CyUn OR n:CyUnW DETACH DELETE n');
    });

    afterAll(async () => {
        await query('MATCH (n) WHERE n:CyUn OR n:CyUnW DETACH DELETE n');
        await closeGraphEngines();
    });

    it('is found each way round, and one from a node to itself once', async () => {
        await query(
            'CREATE (a:CyUn {k: 1}), (b:CyUn {k: 2}), (c:CyUn {k: 3}), ' +
                '(a)-[:CY_UN {i: 1}]->(b), (b)-[:CY_UN {i: 2}]->(a), (a)-[:CY_UN {i: 3}]->(a), (b)-[:CY_UN {i: 4}]->(c)'
        );
        const cases: [string, any[]][] = [
            [
                'MATCH (n:CyUn)-[r:CY_UN]-(m) RETURN [r.i, n.k, m.k, type(r)] ORDER BY r.i, n.k',
                [
                    [1, 1, 2, 'CY_UN'],
                    [1, 2, 1, 'CY_UN'],
                    [2, 1, 2, 'CY_UN'],
                    [2, 2, 1, 'CY_UN'],
                    [3, 1, 1, 'CY_UN'],
                    [4, 2, 3, 'CY_UN'],
                    [4, 3, 2, 'CY_UN']
                ]
            ],
            ['MATCH (:CyUn)-[:CY_UN]-() RETURN count(*)', [7]],
            ['MATCH (a:CyUn {k: 1}), (b:CyUn {k: 2}) MATCH (a)-[r:CY_UN]-(b) RETURN r.i ORDER BY r.i', [1, 2]],
            ['MATCH (a:CyUn {k: 1})-[r:CY_UN]-(a) RETURN r.i', [3]],
            // Its stored direction still reads as stored: the one undirected step found, then matched directed.
            [
                'MATCH (:CyUn {k: 3})-[r:CY_UN]-(b) WITH r.i AS i MATCH (s)-[:CY_UN {i: i}]->(e) RETURN [i, s.k, e.k]',
                [[4, 2, 3]]
            ],
            // A variable-length walk: each step either way, a relationship from a node to itself once.
            ['MATCH (n:CyUn {k: 1})-[:CY_UN*1..2]-(m) RETURN m.k ORDER BY m.k', [1, 1, 1, 2, 2, 2, 2, 3, 3]],
            ['MATCH (:CyUn)-[:CY_UN*1]-() RETURN count(*)', [7]],
            ['MATCH (a:CyUn {k: 1})-[:CY_UN*1]-(a) RETURN count(*)', [1]],
            [
                'MATCH p = (:CyUn {k: 3})-[:CY_UN*1..2]-() RETURN [[x IN nodes(p) | x.k], [r IN relationships(p) | r.i]] ' +
                    'ORDER BY length(p), last(relationships(p)).i',
                [
                    [[3, 2], [4]],
                    [
                        [3, 2, 1],
                        [4, 1]
                    ],
                    [
                        [3, 2, 1],
                        [4, 2]
                    ]
                ]
            ],
            // Walked from its far node, the only one pinned.
            ['MATCH (m:CyUn)-[:CY_UN*1]-(:CyUn {k: 3}) RETURN m.k', [2]],
            // A quantified path pattern's step, of one hop or two, no relationship twice in it.
            ['MATCH (:CyUn {k: 1}) ((x)-[:CY_UN]-(y)){1} (m) RETURN m.k ORDER BY m.k', [1, 2, 2]],
            ['MATCH (:CyUn {k: 3}) ((x)-[:CY_UN]-(y)-[:CY_UN]-(z)){1} (m) RETURN m.k ORDER BY m.k', [1, 1]],
            // In a subquery, a pattern predicate and an OPTIONAL MATCH.
            [
                'MATCH (n:CyUn) RETURN [n.k, COUNT { (n)-[:CY_UN]-() }] ORDER BY n.k',
                [
                    [1, 3],
                    [2, 3],
                    [3, 1]
                ]
            ],
            ['MATCH (n:CyUn) WHERE (n)-[:CY_UN]-(:CyUn {k: 3}) RETURN n.k', [2]],
            [
                'MATCH (n:CyUn) OPTIONAL MATCH (n)-[:CY_UN {i: 4}]-(m) RETURN [n.k, m.k] ORDER BY n.k',
                [
                    [1, null],
                    [2, 3],
                    [3, 2]
                ]
            ]
        ];
        for (const [cypher, rows] of cases) {
            expect([cypher, await query(cypher)]).toEqual([cypher, rows]);
        }
    });

    it('is set and deleted, one from a node to itself once', async () => {
        await query(
            'CREATE (a:CyUnW {k: 1}), (b:CyUnW {k: 2}), (a)-[:UN {i: 1}]->(b), (b)-[:UN {i: 2}]->(a), (a)-[:UN {i: 3}]->(a)'
        );
        expect(await query('MATCH (:CyUnW {k: 1})-[r:UN]-() SET r.seen = true RETURN r.i ORDER BY r.i')).toEqual([
            1, 2, 3
        ]);
        expect(await query('MATCH (:CyUnW)-[r:UN]-() WHERE r.seen RETURN r.i ORDER BY r.i')).toEqual([1, 1, 2, 2, 3]);
        await query('MATCH (:CyUnW {k: 2})-[r:UN]-(:CyUnW {k: 1}) DELETE r');
        expect(await query('MATCH (:CyUnW)-[r:UN]->() RETURN [r.i, r.seen]')).toEqual([[3, true]]);
    });

    it('is found by a MERGE stored the other way round, one from a node to itself once', async () => {
        await query('CREATE (a:CyUnW {k: 1}), (b:CyUnW {k: 2}), (b)-[:UN {i: 1}]->(a), (a)-[:UN {i: 2}]->(a)');
        expect(
            await query(
                'MATCH (a:CyUnW {k: 1}), (b:CyUnW {k: 2}) MERGE (a)-[r:UN {i: 1}]-(b) ON MATCH SET r.seen = true RETURN r.i'
            )
        ).toEqual([1]);
        expect(
            await query('MATCH (a:CyUnW {k: 1}) MERGE (a)-[r:UN]-(a) ON MATCH SET r.seen = true RETURN r.i')
        ).toEqual([2]);
        expect(await query('MATCH (:CyUnW)-[r:UN]->() RETURN [r.i, r.seen] ORDER BY r.i')).toEqual([
            [1, true],
            [2, true]
        ]);
    });
});
