import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';

const GRAPH = 'undirected';

/**
 * A relationship of either direction is compiled to read the relationship table both ways round and join on
 * equalities on Postgres and Oracle (#588, liberation-data/drivine4j#570), a relationship from a node to itself kept
 * once by a condition of the join, not a `WHERE` of either half. It joined with an OR across the two directions, which
 * Postgres can't hash-join on, so it compared every pair of nodes, and which Oracle's recursive walk didn't expand, so
 * it read every relationship at each step. SQLite keeps the OR, which it probes by index. The rows are pinned by the
 * Cypher spec's undirected cases and `CypherUndirected.spec.ts`; this pins the shape of the join.
 */
describe('A relationship of either direction, compiled', () => {
    const bothWays = [new PostgresCypherCompiler(GRAPH), new OracleCypherCompiler(GRAPH)];
    const sqlite = new SqliteCypherCompiler(GRAPH);

    const undirected = [
        'MATCH (n)-[r]-(m) RETURN n, r, m',
        'MATCH (n {k: 1})-[r:KNOWS]-(m) RETURN r.since, m',
        'MATCH (a {k: 1}), (b {k: 2}) MATCH (a)-[r]-(b) RETURN r',
        'MATCH (n {k: 1})-[*1..3]-(m) RETURN m',
        'MATCH p = (n)-[:KNOWS*1..2]-(m) RETURN nodes(p), relationships(p)',
        'MATCH (m)-[*1..2]-(n {k: 1}) RETURN m',
        'MATCH (n {k: 1}) ((x)-[:KNOWS]-(y)-[]-(z)){1,2} (m) RETURN m',
        'MATCH (a {k: 1}), (b {k: 2}) MATCH p = shortestPath((a)-[*]-(b)) RETURN nodes(p)'
    ];

    /**
     * An end of a relationship row compared as stored: how a step either way round was joined, with an OR across the
     * two directions, and how its walk found the node it reached, `CASE WHEN e.src = at THEN e.dst ELSE e.src END`. A
     * relationship row's alias is `e` and a number; Oracle's walk has a `src` column of its own, the node it set out from.
     */
    const endCompared = /\be\d+\.(src|dst) = /;

    it.each(bothWays.map((compiler) => [compiler.constructor.name, compiler] as const))(
        'joins on the ends read both ways round, with no OR across them, on %s',
        (_, compiler) => {
            undirected.forEach((cypher) => {
                const sql = compiler.compile(cypher).sql;
                expect([cypher, sql]).toEqual([
                    cypher,
                    expect.stringContaining(
                        `UNION ALL SELECT eid, src, dst, type, props, dst AS a, src AS b, 1 AS back FROM ${GRAPH}_edge)`
                    )
                ]);
                expect([cypher, sql]).toEqual([
                    cypher,
                    expect.stringMatching(/\(e\d+\.back = 0 OR e\d+\.src <> e\d+\.dst\)/)
                ]);
                expect([cypher, sql]).toEqual([cypher, expect.not.stringMatching(endCompared)]);
            });
        }
    );

    it('still joins with an OR on SQLite, read from the relationship table', () => {
        undirected.forEach((cypher) => {
            const sql = sqlite.compile(cypher).sql;
            expect([cypher, sql]).toEqual([cypher, expect.not.stringContaining('AS back')]);
            expect([cypher, sql]).toEqual([
                cypher,
                expect.stringMatching(/\be\d+\.src = \S+ OR \be\d+\.dst = |\) OR \(e\d+\.dst = /)
            ]);
        });
    });

    it('reads the relationship table once for a directed relationship', () => {
        [...bothWays, sqlite].forEach((compiler) => {
            ['MATCH (n)-[r]->(m) RETURN r', 'MATCH (n)<-[*1..2]-(m) RETURN m'].forEach((cypher) => {
                const sql = compiler.compile(cypher).sql;
                expect([compiler.constructor.name, cypher, sql]).toEqual([
                    compiler.constructor.name,
                    cypher,
                    expect.not.stringContaining('dst AS a')
                ]);
                expect(sql).toMatch(endCompared);
            });
        });
    });
});
