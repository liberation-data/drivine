import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';
import { sqlStores } from '../support/SqlStores';

jest.setTimeout(120_000);

const LABELS = ['CyBesideN1', 'CyBesideN2', 'CyBesideN3'];

/** Neo4j, the default connection, where it is configured, and the SQL stores, on which each statement is compiled to SQL. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...sqlStores()];
}

/**
 * Properties of a node read beside another node's table give the rows of the pattern, and that node's values, as Neo4j
 * gives them. On Oracle the JSON table transformation lost a node's label test where the query read two of its
 * properties, or one two ways, beside another node's table, and gave a row for each two nodes (liberation-data/drivine#435,
 * liberation-data/drivine4j#415): see `OracleCypherCompiler.planned`. drivine4j's `CypherQueryContract`.
 */
describe.each(stores())('Properties of a node beside another node on $type', (store) => {
    let pm: PersistenceManager;
    const query = async (cypher: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }));

    beforeAll(() => {
        pm = persistenceManagerFor(store);
    });

    beforeEach(async () => {
        await clearLabels(pm, store, ...LABELS);
    });

    afterAll(async () => {
        await clearLabels(pm, store, ...LABELS);
        await closeGraphEngines();
    });

    it("should give the rows of the pattern, and that node's values", async () => {
        await query(
            "CREATE (a:CyBesideN1 {n: 1, m: 10, s: 'x', l: [1]}) CREATE (b:CyBesideN2 {n: 2, m: 20, s: 'y', l: [2]}) " +
                "CREATE (c:CyBesideN3 {n: 3, m: 30, s: 'z', l: [3]}) CREATE (a)-[:R]->(b), (a)-[:R]->(c)"
        );
        // A row of two columns or more comes back as a list of its values.
        const cases: [string, any[]][] = [
            ['MATCH (a:CyBesideN1), (b:CyBesideN2) RETURN a.n + b.n AS sum, a.n - b.n AS diff', [[3, -1]]],
            ['MATCH (a:CyBesideN1), (b:CyBesideN2) RETURN a.n + b.n, a.n * b.n', [[3, 2]]],
            ['MATCH (a:CyBesideN1) MATCH (b:CyBesideN2) RETURN a.n + b.n, a.n - b.n', [[3, -1]]],
            ['MATCH (a:CyBesideN1), (b:CyBesideN2) RETURN a.n + b.n, a.n < b.n, a.n = b.n', [[3, true, false]]],
            ['MATCH (a:CyBesideN1), (b:CyBesideN2) RETURN CASE WHEN a.n > 0 THEN a.n + b.n ELSE a.n - b.n END', [3]],
            ['MATCH (a:CyBesideN1), (b:CyBesideN2) RETURN a.s + b.s, a.l + b.l, a.l + b.n', [['xy', [1, 2], [1, 2]]]],
            ['MATCH (a:CyBesideN1), (b:CyBesideN2) RETURN a.n - a.m, [a.n, a.m]', [[-9, [1, 10]]]],
            ['MATCH (a:CyBesideN1), (b:CyBesideN2) RETURN toUpper(a.s), size(a.s), toString(a.n)', [['X', 1, '1']]],
            ["MATCH (a:CyBesideN1), (b:CyBesideN2) WHERE a.s STARTS WITH 'x' RETURN a.n - b.n", [-1]],
            ['MATCH (a:CyBesideN1), (b:CyBesideN2) RETURN sum(a.n + b.n)', [3]],
            ['MATCH (a:CyBesideN1)-->(b:CyBesideN2) RETURN b.n + 1, b.n - 1', [[3, 1]]],
            ['MATCH (b:CyBesideN2) WITH b MATCH (a:CyBesideN1) RETURN a.n - a.m, b.n', [[-9, 2]]],
            [
                'MATCH (a:CyBesideN1), (b:CyBesideN2) RETURN a.n + b.n AS s UNION ALL ' +
                    'MATCH (a:CyBesideN2), (b:CyBesideN3) RETURN a.n + b.n AS s',
                [3, 5]
            ]
        ];
        for (const [cypher, rows] of cases) {
            expect([cypher, await query(cypher)]).toEqual([cypher, rows]);
        }
    });

    it('should give the rows of the pattern beside a node of no label that a property filters, and between two nodes of one label', async () => {
        await query(
            "CREATE (a:CyBesideN1 {n: 1, m: 10, s: 'x', l: [1]}) CREATE (b:CyBesideN2 {n: 2, m: 20, s: 'y', l: [2]}) " +
                "CREATE (c:CyBesideN3 {n: 3, m: 30, s: 'z', l: [3]}) CREATE (d:CyBesideN2 {n: 4, m: 40, s: 'w', l: [4]}) " +
                'CREATE (a)-[:R {w: 1}]->(b), (a)-[:R {w: 2}]->(c), (b)-[:R {w: 3}]->(d), (c)-[:R {w: 4}]->(d)'
        );
        // The node of no label is any node of the graph: the filter on n and m, which no other suite's node has, keeps these.
        const cases: [string, any[]][] = [
            [
                'MATCH (a:CyBesideN1), (b) WHERE b.n > 1 AND b.m < 35 RETURN a.n - a.m, b.n ORDER BY b.n',
                [
                    [-9, 2],
                    [-9, 3]
                ]
            ],
            ['MATCH (a:CyBesideN2)-[r:R]->(b:CyBesideN2) RETURN a.n - a.m, b.n - b.m, r.w', [[-18, -36, 3]]]
        ];
        for (const [cypher, rows] of cases) {
            expect([cypher, await query(cypher)]).toEqual([cypher, rows]);
        }
    });

    it("should write to the nodes of the pattern, and give that node's values, in a statement that writes", async () => {
        await query(
            "CREATE (a:CyBesideN1 {n: 1, m: 10, s: 'x', l: [1]}) CREATE (b:CyBesideN2 {n: 2, m: 20, s: 'y', l: [2]}) " +
                "CREATE (c:CyBesideN3 {n: 3, m: 30, s: 'z', l: [3]}) CREATE (a)-[:R]->(b), (a)-[:R]->(c)"
        );
        // A write reads its rows by a SELECT … INTO, a MERGE its match by a loop, and the rows it returns by a cursor. The
        // first, unhinted, gave a row for each two nodes, and set x and y on the N2 and the N3 too.
        const cases: [string, any[]][] = [
            [
                'MATCH (a:CyBesideN1), (b:CyBesideN2) WITH a, b, a.n + b.n AS s, a.n - b.n AS d SET a.x = s, a.y = d RETURN s, d',
                [[3, -1]]
            ],
            ['MATCH (a:CyBesideN1) MERGE (a)-[:R]->(b:CyBesideN2) RETURN b.n - b.m, b.s', [[-18, 'y']]],
            ['MATCH (a:CyBesideN1), (b:CyBesideN2) SET a.z = 1 RETURN a.n + b.n, a.n - b.n', [[3, -1]]],
            [
                'MATCH (a) WHERE a:CyBesideN1 OR a:CyBesideN2 OR a:CyBesideN3 RETURN a.n, a.x, a.y, a.z ORDER BY a.n',
                [
                    [1, 3, -1, 1],
                    [2, null, null, null],
                    [3, null, null, null]
                ]
            ]
        ];
        for (const [cypher, rows] of cases) {
            expect([cypher, await query(cypher)]).toEqual([cypher, rows]);
        }
    });
});
