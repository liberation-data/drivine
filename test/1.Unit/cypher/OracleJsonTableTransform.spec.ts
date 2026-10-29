import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, a query that reads the graph's tables twice or more turns the JSON table transformation off, which lost a
 * node's label test beside another node's table (liberation-data/drivine#435, liberation-data/drivine4j#415); the
 * hint is the statement's, so its outermost query holds it. A query of one table is written as it was. drivine4j's
 * `OracleJsonTableTransformTest`.
 */
describe("Oracle's JSON table transformation in compiled Cypher", () => {
    const hint = 'NO_JSON_TABLE_TRANSFORM';
    const compiled = (cypher: string, graph = 'g'): string => new OracleCypherCompiler(graph).compile(cypher).sql;
    const count = (sql: string, of: string): number => sql.split(of).length - 1;

    it('should open a query of two tables with the hint, once', () => {
        const sql = compiled('MATCH (a:N1), (b:N2) RETURN a.n + b.n, a.n - b.n');
        expect(sql.startsWith(`SELECT /*+ ${hint} */ `)).toBe(true);
        expect(count(sql, hint)).toBe(1);
        expect(compiled('MATCH (a:N1)-->(b:N2) RETURN b.n + 1').startsWith(`SELECT /*+ ${hint} */ `)).toBe(true);
    });

    it('should give a query of one table no hint', () => {
        for (const cypher of [
            'MATCH (a:N1) RETURN a.n + 1, a.n - 1',
            'UNWIND [1, 2] AS x MATCH (a:N1) RETURN a.n - a.m, x',
            'RETURN 1'
        ]) {
            expect([cypher, compiled(cypher)]).toEqual([cypher, expect.not.stringContaining(hint)]);
        }
    });

    it("should put the hint in a UNION's outermost query, after a query's declared function", () => {
        const union = compiled('MATCH (a:N1), (b:N2) RETURN a.n + b.n AS s UNION ALL MATCH (a:N2) RETURN a.n AS s');
        expect(union.startsWith(`SELECT /*+ ${hint} */ u.result`)).toBe(true);
        const declared = compiled('MATCH (a:N1), (b:N2) RETURN reduce(t = 0, x IN [a.n, b.n] | t + x)');
        expect(declared.startsWith('WITH\nFUNCTION ')).toBe(true);
        expect(declared).toContain(`\nSELECT /*+ ${hint} */ `);
    });

    it('should put the hint in each query of a statement that writes that reads two tables', () => {
        const sql = compiled('MATCH (a:N1), (b:N2) SET a.x = a.n + b.n RETURN a.x');
        expect(sql.startsWith('DECLARE')).toBe(true);
        expect(sql).toMatch(new RegExp(`SELECT /\\*\\+ ${hint} \\*/ [^;]*INTO`));
        // A MERGE's match of two tables loops over the query, which holds the hint.
        expect(compiled('MATCH (a:N1) MERGE (a)-[:R]->(b:N2) RETURN b.n')).toMatch(
            new RegExp(`FOR \\w+ IN \\(\\s*SELECT /\\*\\+ ${hint} \\*/`)
        );
    });

    it("should count the graph's own tables, its name read as it is, and join the hints a query opens with", () => {
        expect(compiled('MATCH (a:N1), (b:N2) RETURN a.n + b.n', 'g.x')).toContain(hint);
        // A graph whose name a regular expression would read otherwise, `g.x`, counts no other graph's table.
        expect(
            new OracleCypherCompiler('g.x').planned('SELECT 1 FROM gyx_node n1 CROSS JOIN gyx_node n2')
        ).not.toContain(hint);
        expect(new OracleCypherCompiler('g').planned('SELECT /*+ NO_MERGE */ * FROM g_node n1, g_edge e2')).toBe(
            `SELECT /*+ NO_MERGE ${hint} */ * FROM g_node n1, g_edge e2`
        );
    });

    it('should write the same query on Postgres as before: no hint', () => {
        const sql = new PostgresCypherCompiler('g').compile('MATCH (a:N1), (b:N2) RETURN a.n + b.n').sql;
        expect(sql).not.toContain(hint);
        expect(sql.startsWith('SELECT ')).toBe(true);
    });
});
