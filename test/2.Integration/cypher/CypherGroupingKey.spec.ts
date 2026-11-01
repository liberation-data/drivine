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
            // Inside a list comprehension's WHERE, a quantifier's WHERE, a reduce's step and a comprehension's projection
            // read the key too.
            [
                "UNWIND [{r: 'N', t: 'Neo'}, {r: 'N', t: 'Nix'}, {r: 'M', t: 'Neo'}] AS x " +
                    'RETURN x.r AS role, size([t IN collect(x.t) WHERE any(u IN [t] WHERE u STARTS WITH x.r)]) AS n ORDER BY role',
                [
                    ['M', 0],
                    ['N', 2]
                ]
            ],
            [
                "UNWIND [{r: 'N', t: 'Neo'}, {r: 'N', t: 'Nix'}, {r: 'M', t: 'Neo'}] AS x " +
                    'RETURN x.r AS role, size([t IN collect(x.t) WHERE reduce(s = false, u IN [t] | s OR u STARTS WITH x.r)]) AS n ORDER BY role',
                [
                    ['M', 0],
                    ['N', 2]
                ]
            ],
            [
                "UNWIND [{r: 'N', t: 'Neo'}, {r: 'N', t: 'Nix'}, {r: 'M', t: 'Neo'}] AS x " +
                    'RETURN x.r AS role, size([t IN collect(x.t) WHERE [u IN [t] | u STARTS WITH x.r][0]]) AS n ORDER BY role',
                [
                    ['M', 0],
                    ['N', 2]
                ]
            ],
            // So does the body of a comprehension, a quantifier or a reduce that holds no aggregate.
            [
                'UNWIND [{a: 1, b: 1}, {a: 1, b: 2}, {a: 2, b: 1}] AS x RETURN x.a AS a, count(*) + [y IN [1] | x.a][0] AS n ORDER BY a',
                [
                    [1, 3],
                    [2, 3]
                ]
            ],
            [
                'UNWIND [{a: 1, b: 1}, {a: 1, b: 2}, {a: 2, b: 1}] AS x RETURN x.a AS a, count(*) + reduce(s = 0, y IN [1] | s + x.a) AS n ORDER BY a',
                [
                    [1, 3],
                    [2, 3]
                ]
            ],
            [
                'UNWIND [{a: 1, b: 1}, {a: 1, b: 2}, {a: 2, b: 1}] AS x RETURN x.a AS a, [count(*), any(y IN [0, 1] WHERE y > x.a)] AS n ORDER BY a',
                [
                    [1, [2, false]],
                    [2, [1, false]]
                ]
            ],
            // But a comprehension's projection over an aggregate is grouped by the key's variable, whatever it holds.
            [
                'UNWIND [{a: 1, b: 1}, {a: 1, b: 2}, {a: 2, b: 1}] AS x ' +
                    'RETURN x.a AS a, size([t IN collect(x.b) WHERE t >= x.a | [y IN [1] | x.a][0]]) AS n ORDER BY a, n',
                [
                    [1, 1],
                    [1, 1],
                    [2, 0]
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

    it('should read any(y IN list WHERE y = e) as e IN list, and an order term as an item, grouping by the property', async () => {
        // Two x share a = 1, so grouping by x gives a = 1 twice (#499, drivine4j#505).
        const x = 'UNWIND [{a: 1, b: 1}, {a: 1, b: 2}, {a: 2, b: 1}] AS x RETURN x.a AS a';
        const z = 'UNWIND [{b: 1}, {a: null, b: 2}, {a: 1, b: 1}, {a: 1, b: 3}] AS x RETURN x.a AS a';
        const cases: [string, any[]][] = [
            // Neo4j reads any(y IN list WHERE y = e) as e IN list, and none(…) as NOT e IN list; not all(…).
            [
                `${x}, any(y IN collect(x.b) WHERE y = x.a + 0) AS n ORDER BY a`,
                [
                    [1, true],
                    [2, false]
                ]
            ],
            [
                'UNWIND [{a: 1, b: 1}, {a: 1, b: 2}, {a: 2, b: 1}] AS x ' +
                    'WITH x.a AS a, any(y IN collect(x.b) WHERE y = x.a) AS n RETURN a, n ORDER BY a',
                [
                    [1, true],
                    [2, false]
                ]
            ],
            [
                `${x}, any(y IN collect(x.b) WHERE y = x.a OR y = 5) AS n ORDER BY a, n`,
                [
                    [1, false],
                    [1, true],
                    [2, false]
                ]
            ],
            // Nor single(…), y.p = e, y IN [e1, e2], or an e that reads y; e IN [y] is y = e. With a null in the list,
            // as e IN list.
            [
                `${x}, single(y IN collect(x.b) WHERE y = x.a) AS n ORDER BY a, n`,
                [
                    [1, false],
                    [1, true],
                    [2, false]
                ]
            ],
            [
                `${x}, any(y IN collect(x) WHERE y.b = x.a) AS n ORDER BY a, n`,
                [
                    [1, false],
                    [1, true],
                    [2, false]
                ]
            ],
            [
                `${x}, none(y IN collect(x.b) WHERE y IN [x.a, 5]) AS n ORDER BY a, n`,
                [
                    [1, false],
                    [1, true],
                    [2, true]
                ]
            ],
            [
                `${x}, any(y IN collect(x.b) WHERE y = x.a + y) AS n ORDER BY a, n`,
                [
                    [1, false],
                    [1, false],
                    [2, false]
                ]
            ],
            // An e that reads only a y it binds of its own reads no y of the quantifier's.
            [
                `${x}, any(y IN collect(x.b) WHERE y = [y IN [x.a] | y][0]) AS n ORDER BY a, n`,
                [
                    [1, true],
                    [2, false]
                ]
            ],
            [
                `${x}, none(y IN collect(x.b) WHERE reduce(s = 0, y IN [x.a] | s + y) = y) AS n ORDER BY a, n`,
                [
                    [1, false],
                    [2, true]
                ]
            ],
            [
                `${x}, any(y IN collect(x.b) WHERE x.a IN [y]) AS n ORDER BY a, n`,
                [
                    [1, true],
                    [2, false]
                ]
            ],
            [
                `${x}, any(y IN collect(x.b) + [null] WHERE y = x.a) AS n ORDER BY a, n`,
                [
                    [1, true],
                    [2, null]
                ]
            ],
            [
                `${x}, none(y IN collect(x.b) + [null] WHERE y = x.a + 1) AS n ORDER BY a, n`,
                [
                    [1, false],
                    [2, null]
                ]
            ],
            // A key that is a map's null and one that is missing are one null, read by its name in a body too (#497).
            [
                `${z}, any(y IN collect(x.b) WHERE y = x.a) AS n ORDER BY a, n`,
                [
                    [1, true],
                    [null, null]
                ]
            ],
            [
                `${z}, size([t IN collect(x.b) WHERE any(u IN [t] WHERE u > coalesce(x.a, 0))]) AS n ORDER BY a, n`,
                [
                    [1, 1],
                    [null, 2]
                ]
            ],
            [
                `${z}, count(*) + [y IN [1] | coalesce(x.a, 0)][0] AS n ORDER BY a, n`,
                [
                    [1, 3],
                    [null, 2]
                ]
            ],
            // An order term that aggregates reads the key as an item does; a reduce's step over an aggregate groups by x.
            [
                `${x}, count(*) AS n ORDER BY reduce(s = 0, y IN collect(x.b) | s + x.a), a`,
                [
                    [1, 1],
                    [1, 1],
                    [2, 1]
                ]
            ]
        ];
        for (const [cypher, rows] of cases) {
            expect([cypher, await query(cypher)]).toEqual([cypher, rows]);
        }
    });
});
