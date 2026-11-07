import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';

/** The statement compiled for Postgres: the function it makes, where it writes, and the statement. */
function compiled(cypher: string): string {
    const it = new PostgresCypherCompiler('g').compile(cypher);
    return [...it.setup, it.sql].join('\n');
}

const NODE_PROBE = /LEFT JOIN LATERAL \(\s*SELECT \* FROM g_node (\w+) WHERE \1\.nid = .* OFFSET 0\s*\) \1 ON TRUE/;
const EDGE_PROBE = /LEFT JOIN LATERAL \(\s*SELECT \* FROM g_edge (\w+) WHERE \1\.eid = .* OFFSET 0\s*\) \1 ON TRUE/;
const PLAIN = /LEFT JOIN g_(node|edge) \w+ ON/;

/**
 * On Postgres, a row of a write's or a list's rows reads its node or relationship back by its id through a probe of the
 * table's key, `LEFT JOIN LATERAL (… WHERE nid = … OFFSET 0)`, not a plain join, which is planned by the table's
 * statistics (#655, liberation-data/drivine4j#644): see `PostgresCypherCompiler.keyJoin`. The plans are
 * `PostgresKeyProbePlan.spec.ts`'s. drivine4j's `PostgresKeyProbeTest`.
 */
describe('A row read back by its id on Postgres', () => {
    it.each([
        // A write's rows, read back for the statement after its loop.
        ['MATCH (n:CyLoop) FOREACH (x IN [1] | CREATE (n)-[r:CY_SELF]->(n) SET r.w = x)', false],
        ['MATCH ()-[r:CY_SELF]->() FOREACH (x IN [1] | SET r.w = x)', true],
        // A list of nodes or relationships unwound.
        ['MATCH (n:CyLoop) WITH collect(n) AS ns UNWIND ns AS m RETURN m.i', false],
        ['MATCH ()-[r:CY_SELF]->() WITH collect(r) AS rs UNWIND rs AS x RETURN x.w', true],
        // A list of nodes or relationships returned whole, and read item by item.
        ['MATCH (n:CyLoop) WITH collect(n) AS ns RETURN ns', false],
        ['MATCH ()-[r:CY_SELF]->() WITH collect(r) AS rs RETURN rs', true],
        ['MATCH (n:CyLoop) WITH collect(n) AS ns RETURN [m IN ns WHERE m.i > 1 | m.i]', false],
        ['MATCH ()-[r:CY_SELF]->() WITH collect(r) AS rs RETURN [x IN rs WHERE x.w > 1 | x.w]', true]
    ])('reads it by a probe of the key, and by no plain join: %s', (cypher: string, relationships: boolean) => {
        const text = compiled(cypher);
        expect([(relationships ? EDGE_PROBE : NODE_PROBE).test(text), text]).toEqual([true, text]);
        expect([PLAIN.test(text), text]).toEqual([false, text]);
    });

    it('is joined on Oracle and SQLite as it was', () => {
        const cypher = 'MATCH (n:CyLoop) WITH collect(n) AS ns UNWIND ns AS m RETURN m.i';
        for (const sql of [
            new OracleCypherCompiler('g').compile(cypher).sql,
            new SqliteCypherCompiler('g').compile(cypher).sql
        ]) {
            expect([/LATERAL \(\s*SELECT \* FROM/.test(sql), sql]).toEqual([false, sql]);
            expect([/LEFT JOIN \S*g_node\S* \w+ ON/i.test(sql), sql]).toEqual([true, sql]);
        }
    });
});
