import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { closeGraphEngines, GraphEngine, graphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { sqlStores } from '../support/SqlStores';

jest.setTimeout(120_000);

/** Neo4j, the default connection, where it is configured, and the SQL stores, on which each statement is compiled to SQL. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...sqlStores()];
}

/**
 * An item that aggregates over a key that is a variable's property is grouped by the property, not by its variable, as
 * Neo4j groups it (#494, drivine4j#491). The spec's "Implicit grouping key" holds the most of these; those here are
 * drivine4j's `CypherQueryContract` cases it does not hold, written over UNWIND. The rows are Neo4j's (2026.10).
 */
describe.each(stores())('An aggregating item over a key that is a property on $type', (store) => {
    let pm: PersistenceManager;
    const query = async (cypher: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }));

    beforeAll(() => {
        pm = persistenceManagerFor(store);
    });

    afterAll(async () => {
        await closeGraphEngines();
    });

    it('should group by the property', async () => {
        // A row of two columns or more comes back as a list of its values.
        const cases: [string, any[]][] = [
            // A null key is one group. Each is missing, as drivine4j's tagline is: a null written in a map groups apart
            // from a missing key on the SQL stores still (#497).
            [
                "UNWIND [{t: 'a'}, {u: 2}, {u: 1}] AS m RETURN m.t AS t, {t: m.t, n: count(*)} AS n ORDER BY t",
                [
                    ['a', { t: 'a', n: 1 }],
                    [null, { t: null, n: 2 }]
                ]
            ],
            // Two keys of one variable group by both, not by the variable: two rows have a = 1, b = 1.
            [
                'UNWIND [{a: 1, b: 1, c: 1}, {a: 1, b: 1, c: 2}, {a: 1, b: 2, c: 1}, {a: 2, b: 2, c: 1}] AS x ' +
                    'RETURN x.a AS a, x.b AS b, x.a * 10 + x.b + count(*) AS n ORDER BY a, b',
                [
                    [1, 1, 13],
                    [1, 2, 13],
                    [2, 2, 23]
                ]
            ],
            // In a comprehension's WHERE inside another's WHERE, the key too.
            [
                "UNWIND [{r: 'N', t: 'Neo'}, {r: 'N', t: 'Nix'}, {r: 'M', t: 'Neo'}] AS x " +
                    'RETURN x.r AS role, size([t IN collect(x.t) WHERE size([u IN [t] WHERE u STARTS WITH x.r]) > 0]) AS n ORDER BY role',
                [
                    ['M', 0],
                    ['N', 2]
                ]
            ],
            // Not where a comprehension binds the key's variable again.
            [
                'UNWIND [{a: 1}, {a: 2}, {a: 2}] AS x RETURN x.a AS a, size([x IN [{a: 5}] WHERE x.a > 1]) + count(*) AS n ORDER BY a',
                [
                    [1, 2],
                    [2, 3]
                ]
            ]
        ];
        for (const [cypher, rows] of cases) {
            expect([cypher, await query(cypher)]).toEqual([cypher, rows]);
        }
    });
});
