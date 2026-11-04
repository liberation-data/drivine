import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';

/**
 * A node equal to a node is their keys compared, through the store's own comparison of two keys
 * ({@link SqlCypherCompiler.sameKey}). On Oracle that is `+ 0` on one side, both ways round, so either is read by its
 * key: compared column to column, Oracle 23 dropped the later node's join and tested its label in a form that misses a
 * node with more than one label, so `MATCH (p)-[:KNOWS]->(q) MATCH (c:Person) WHERE c = q` gave no rows (#598,
 * liberation-data/drivine4j#576). The rows and plans are pinned by `CypherNodeEquality.spec.ts` and
 * `OracleNodeEqualityPlan.spec.ts`; this pins the shape on each store. drivine4j's `NodeEqualityTest`.
 */
describe('A node equal to a node, compiled', () => {
    const q = "MATCH (p {name: 'Keanu'})-[:KNOWS]->(q)";
    const later = `${q} MATCH (c:Person) WHERE c = q RETURN c.name`;
    const earlier = `${q} MATCH (c:Person) WHERE q = c RETURN c.name`;
    const sql = (compiler: { compile: (cypher: string) => { sql: string } }, cypher: string): string =>
        compiler.compile(cypher).sql;

    it('compares the keys with + 0 on one side, both ways round, on Oracle', () => {
        expect(sql(new OracleCypherCompiler('g'), later)).toContain('(n4.nid = n2.nid + 0 AND n2.nid = n4.nid + 0)');
        expect(sql(new OracleCypherCompiler('g'), earlier)).toContain('(n2.nid = n4.nid + 0 AND n4.nid = n2.nid + 0)');
    });

    it('compares the keys with + 0 by NOT =, <>, IN, a list, a map, CASE or in a subquery too, on Oracle', () => {
        [
            `${q} MATCH (c:Person) WHERE c <> q RETURN c.name`,
            `${q} MATCH (c:Person) WHERE NOT c = q RETURN c.name`,
            `${q} MATCH (c:Person) WHERE c IN [q] RETURN c.name`,
            `${q} MATCH (c:Person) WHERE [c] = [q] RETURN c.name`,
            `${q} MATCH (c:Person) WHERE {x: c} = {x: q} RETURN c.name`,
            `${q} MATCH (c:Person) WHERE CASE c WHEN q THEN true ELSE false END RETURN c.name`,
            `${q} OPTIONAL MATCH (c:Person) WHERE c = q RETURN c.name`,
            `${q} WHERE EXISTS { MATCH (c:Person) WHERE c = q } RETURN q.name`,
            `${q} RETURN COUNT { MATCH (c:Person) WHERE c = q }`
        ].forEach((cypher) => {
            const compiled = sql(new OracleCypherCompiler('g'), cypher);
            expect([cypher, compiled]).toEqual([cypher, expect.stringMatching(/\bn\d+\.nid = n\d+\.nid \+ 0\b/)]);
            expect([cypher, compiled]).toEqual([cypher, expect.not.stringMatching(/\bn\d+\.nid = n\d+\.nid(?! \+ 0)/)]);
        });
    });

    it('compares the keys as they are, on Postgres and SQLite', () => {
        for (const compiled of [sql(new PostgresCypherCompiler('g'), later), sql(new SqliteCypherCompiler('g'), later)]) {
            expect(compiled).toContain('n4.nid = n2.nid');
            expect(compiled).not.toContain('+ 0');
        }
    });

    it('still compares a relationship with a relationship by the keys as they are, on Oracle too', () => {
        const compiled = sql(
            new OracleCypherCompiler('g'),
            'MATCH (a)-[r]->(b) MATCH (a)-[s]->(b) WHERE s = r RETURN count(*)'
        );
        expect(compiled).toMatch(/\be\d+\.eid = e\d+\.eid\b(?! \+ 0)/);
    });
});
