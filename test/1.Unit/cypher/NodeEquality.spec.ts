import { holdsLabel as oracleHoldsLabel } from '@/backend/oracle/OracleGraph';
import { holdsLabel as sqliteHoldsLabel } from '@/backend/sqlite/SqliteGraph';
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

/**
 * On Oracle, a node with a label whose key a condition the row must pass sets equal to the key of a node found some other
 * way tests its labels by their text ({@link SqlCypherCompiler.keyedLabels}), which the index over labels can't answer, so
 * Oracle reads it by its primary key (#606, liberation-data/drivine4j#578). With the index's form, Oracle read that index
 * again for each row of the other node, and `MATCH (a:Big) MATCH (b:Big) WHERE a = b` grew with the square of the label's
 * nodes. The plans are pinned by `OracleKeyedLabelPlan.spec.ts`, the rows by `CypherNodeEquality.spec.ts`. drivine4j's
 * `NodeEqualityTest`.
 */
describe('A node set equal to a node, its labels tested, compiled', () => {
    const oracle = (statement: string, parameters: Record<string, any> = {}): string =>
        new OracleCypherCompiler('g').compile(statement, parameters).sql;

    /** The two nodes `sql` compares by their keys, both ways round, the earlier first, as their aliases are numbered. */
    const compared = (sql: string): [string, string] => {
        const m = /\((n(\d+))\.nid = (n(\d+))\.nid \+ 0 AND n\d+\.nid = n\d+\.nid \+ 0\)/.exec(sql);
        expect([sql, m !== null]).toEqual([sql, true]);
        const [, a, an, b, bn] = m!;
        return Number(an) < Number(bn) ? [a, b] : [b, a];
    };

    /** That on Oracle `statement` tests the labels of the later node it compares, `labels`, by their text, and those of the earlier through the index. */
    const assertKeyedLabels = (statement: string, labels: string[] = ['Big'], earlierScanned: boolean = true): void => {
        const sql = oracle(statement, { id: 5 });
        const [a, b] = compared(sql);
        const where = `${statement}\n${sql}`;
        expect([where, sql.includes(`JSON_EXISTS(${a}.labels, `)]).toEqual([where, earlierScanned]);
        expect([where, sql.includes(`JSON_EXISTS(${b}.labels, `)]).toEqual([where, false]);
        labels.forEach((it) =>
            expect([where, sql.includes(oracleHoldsLabel(`${b}.labels`, it))]).toEqual([where, true])
        );
    };

    /** That on Oracle `statement`, which matches a label on each of `labelled` nodes, tests each through the index over labels, as before. */
    const assertScannedLabels = (statement: string, labelled: number = 2): void => {
        const sql = oracle(statement);
        const where = `${statement}\n${sql}`;
        expect([where, [...sql.matchAll(/JSON_EXISTS\(\w+\.labels, '\$\[\*]\?\(@ == "Big"\)'\)/g)].length]).toEqual([
            where,
            labelled
        ]);
        expect([where, sql.includes('INSTR(')]).toEqual([where, false]);
    };

    it("on Oracle, a node whose key is set equal to an earlier node's tests its labels so the index can't answer them", () => {
        assertKeyedLabels('MATCH (a:Big) MATCH (b:Big) WHERE a = b RETURN count(*)');
        assertKeyedLabels('MATCH (a:Big) MATCH (b:Big) WHERE b = a RETURN count(*)');
        assertKeyedLabels('MATCH (a:Big) MATCH (b:Big) WHERE id(b) = id(a) RETURN count(*)');
        assertKeyedLabels('MATCH (a:Big) MATCH (b:Big) WHERE id(a) = id(b) RETURN count(*)');
        assertKeyedLabels('MATCH (a:Big), (b:Big) WHERE a = b RETURN count(*)');
        assertKeyedLabels('MATCH (a:Big) WHERE a.k = 1 MATCH (b:Big) WHERE a = b RETURN count(*)');
        assertKeyedLabels('MATCH (a:Big) MATCH (b:Big) WHERE a = b AND b.k > 0 RETURN count(*)');
        assertKeyedLabels('MATCH (a:Big) MATCH (b:Big) WHERE b.k > 0 AND (a = b AND b.k < 9) RETURN count(*)');
        assertKeyedLabels('MATCH (a:Big) OPTIONAL MATCH (b:Big) WHERE a = b RETURN count(b)');
        assertKeyedLabels('MATCH (a:Big) WHERE EXISTS { MATCH (b:Big) WHERE a = b } RETURN count(*)');
        assertKeyedLabels('MATCH (a:Big) RETURN COUNT { MATCH (b:Big) WHERE b = a }');
        assertKeyedLabels('MATCH (a:Big) RETURN [(x)-[:R]->(b:Big) WHERE b = a | b.k]');
        assertKeyedLabels('MATCH (a:Big) MATCH p = shortestPath((b:Big)-[*]-(c:Big)) WHERE b = a RETURN length(p)');
        assertKeyedLabels('MATCH (a:Big:Other) MATCH (b:Big:Other) WHERE a = b RETURN count(*)', ['Big', 'Other']);
        // Each test of the later node's labels, where a pattern names it again.
        assertKeyedLabels('MATCH (a:Big) MATCH (b:Big) MATCH (b:Other) WHERE a = b RETURN count(*)', ['Big', 'Other']);
        // The earlier node found by its properties, a relationship it ends, or its id, with no label.
        assertKeyedLabels('MATCH (a {k: 1}) MATCH (b:Big) WHERE a = b RETURN b', ['Big'], false);
        assertKeyedLabels('MATCH (x)-[:R]->(a) MATCH (b:Big) WHERE a = b RETURN count(*)', ['Big'], false);
        assertKeyedLabels('MATCH (a) WHERE id(a) = $id MATCH (b:Big) WHERE a = b RETURN b', ['Big'], false);
        assertKeyedLabels('MATCH (a) WHERE $id = id(a) MATCH (b:Big) WHERE a = b RETURN b', ['Big'], false);
        assertKeyedLabels('MATCH (a), (b:Big) WHERE id(a) IN [1, 2] AND id(b) = id(a) RETURN b', ['Big'], false);
        // The node found by its properties bound after the node with the label: that node, the earlier, is read by its key.
        const later = oracle('MATCH (b:Big) MATCH (a {k: 1}) WHERE a = b RETURN b');
        expect([
            later,
            later.includes(oracleHoldsLabel('n1.labels', 'Big')),
            later.includes('JSON_EXISTS(n1.labels')
        ]).toEqual([later, true, false]);
        // Three nodes set equal in a chain, either order: each after the first is read by its key, the first through the index.
        for (const test of ['a = b AND b = c', 'c = b AND b = a']) {
            const chain = oracle(`MATCH (a:Big) MATCH (b:Big) MATCH (c:Big) WHERE ${test} RETURN count(*)`);
            expect([
                test,
                chain,
                chain.includes('JSON_EXISTS(n1.labels'),
                chain.includes('JSON_EXISTS(n2.labels'),
                chain.includes('JSON_EXISTS(n3.labels'),
                ...['n2', 'n3'].map((it) => chain.includes(oracleHoldsLabel(`${it}.labels`, 'Big')))
            ]).toEqual([test, chain, true, false, false, true, true]);
        }
    });

    it("on Oracle, a node equal to a node under NOT, beside an OR, as a value, or to a node found by nothing else, keeps its labels' test", () => {
        assertScannedLabels('MATCH (a:Big) MATCH (b:Big) WHERE NOT a = b RETURN count(*)');
        assertScannedLabels('MATCH (a:Big) MATCH (b:Big) WHERE a = b OR b.k = 1 RETURN count(*)');
        assertScannedLabels('MATCH (a:Big) MATCH (b:Big) WHERE a = b XOR b.k = 1 RETURN count(*)');
        assertScannedLabels('MATCH (a:Big) MATCH (b:Big) WHERE (a = b) = true RETURN count(*)');
        assertScannedLabels('MATCH (a:Big) MATCH (b:Big) WHERE CASE WHEN a = b THEN true END RETURN count(*)');
        assertScannedLabels('MATCH (a:Big), (b:Big) RETURN count(CASE WHEN a = b THEN 1 END)');
        // Found by nothing but the key: the index over labels is the way in, to b, and the earlier node is read by its key.
        assertScannedLabels('MATCH (a) MATCH (b:Big) WHERE a = b RETURN count(*)', 1);
        // An empty map of properties finds a node by nothing, as no map does (#605, drivine4j#583).
        assertScannedLabels('MATCH (a {}) MATCH (b:Big) WHERE a = b RETURN count(*)', 1);
        assertScannedLabels('MATCH (a) WHERE EXISTS { MATCH (b:Big) WHERE a = b } RETURN count(*)', 1);
        // Nor does a subquery find the node around it, by its id or a relationship it ends there: it reads a's rows.
        assertScannedLabels('MATCH (a) WHERE EXISTS { MATCH (b:Big) WHERE id(a) = 5 AND a = b } RETURN count(*)', 1);
        assertScannedLabels(
            'MATCH (a) WHERE EXISTS { MATCH (a)-[:R]->(x) } AND EXISTS { MATCH (b:Big) WHERE a = b } RETURN count(*)',
            1
        );
        // Passed through a WITH, the earlier node is a column of that query, whose finding the condition doesn't see.
        assertScannedLabels('MATCH (a:Big) WITH a MATCH (b:Big) WHERE a = b RETURN count(*)');
        // An aggregate's argument compiled first only to see whether it binds a value: what it finds by a label, in the
        // names it takes, doesn't make the node an argument compiled after it takes under the same name found by more
        // than its key. Each EXISTS is written twice, for its count to be of the values that aren't null.
        assertScannedLabels(
            'MATCH (z) RETURN count(EXISTS { MATCH (u) MATCH (v:Big) WHERE u = v }) AS c, count(EXISTS { MATCH (p:Big) }) AS d',
            4
        );
        // The same of an operation over aggregates, compiled first to see whether it binds a value in a subquery.
        assertScannedLabels(
            'MATCH (z) RETURN count(EXISTS { MATCH (u) MATCH (v:Big) WHERE u = v }) + count(EXISTS { MATCH (p:Big) }) AS c',
            4
        );
        // A node equal to itself is the only node there is.
        assertScannedLabels('MATCH (a:Big) WHERE a = a RETURN count(*)', 1);
    });

    it("on Postgres and SQLite, a node set equal to a node tests its labels as any node's", () => {
        const statement = 'MATCH (a:Big) MATCH (b:Big) WHERE a = b RETURN count(*)';
        const postgres = sql(new PostgresCypherCompiler('g'), statement);
        expect(postgres).toContain(`n1.labels @> '["Big"]'`);
        expect(postgres).toContain(`n2.labels @> '["Big"]'`);
        const sqlite = sql(new SqliteCypherCompiler('g'), statement);
        expect(sqlite).toContain(sqliteHoldsLabel('n1.labels', 'Big'));
        expect(sqlite).toContain(sqliteHoldsLabel('n2.labels', 'Big'));
    });
});

function sql(compiler: { compile: (cypher: string) => { sql: string } }, cypher: string): string {
    return compiler.compile(cypher).sql;
}
