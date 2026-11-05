import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';

/**
 * On Oracle, a query that reads the rows of a `CALL { … }` or a `FOREACH` written for each row alone is planned for one
 * row of them, `CARDINALITY(r 1)` in its own query's hint: Oracle estimated 8,168 rows of the `JSON_TABLE`, and read
 * every node by a hash join for each row (#624, liberation-data/drivine4j#588). A query of the statement's rows, before
 * or after the loop, is planned as it was. drivine4j's `OracleOneRowPlanTest`.
 */
describe('A per-row write body, as Oracle plans it', () => {
    const compiled = (cypher: string): string => new OracleCypherCompiler('g').compile(cypher).sql;

    /** The aliases of the rows each hinted query is told hold one. */
    const hinted = (sql: string): string[] =>
        [...sql.matchAll(/SELECT \/\*\+ [^*]*CARDINALITY\((r\d+) 1\)[^*]*\*\//g)].map((it) => it[1]);

    it("should read a CALL's projection of each row as one row, in the query that reads it", () => {
        const sql = compiled('MATCH (n:CyLoop) CALL (n) { SET n.y = n.i RETURN n.i AS j } RETURN count(j)');
        const projection =
            /SELECT \/\*\+ CARDINALITY\((r\d+) 1\) \*\/ JSON\(JSON_QUERY\(JSON_SERIALIZE\(JSON_TRANSFORM\(n\d+\.props, KEEP '\$\.i'\)[^\n]*\n\s*r\d+\.item_no AS o1\n\s*FROM JSON_TABLE\(cy_rows, '\$\[\*\]' COLUMNS \(item_no FOR ORDINALITY, item JSON PATH '\$'\)\) (r\d+)\n/.exec(
                sql
            );
        expect([projection?.[1], sql]).toEqual([projection?.[2] ?? 'a projection hinted for its own rows', sql]);
        // The loop over the call's rows, and the query of all the statement's rows after it, read them as before.
        expect(sql).toContain('FOR cy_record IN (SELECT r2.item FROM JSON_TABLE(cy_saved1,');
        const returned = sql.slice(sql.indexOf('OPEN cy_cursor FOR'));
        expect([returned, returned]).toEqual([
            expect.stringMatching(/\n\s*SELECT p\d+\.c1 AS result\n/),
            expect.not.stringContaining('CARDINALITY')
        ]);
        expect(new Set(hinted(sql)).size).toBe(hinted(sql).length);
    });

    it("should read past a text before the rows read, with a bracket, a quote or SELECT in it, to the query's own SELECT", () => {
        const plain = hinted(
            compiled('MATCH (n:CyLoop) CALL (n) { SET n.y = n.i RETURN toString(n.i) AS j } RETURN j')
        );
        const sql = compiled(
            "MATCH (n:CyLoop) CALL (n) { SET n.y = n.i RETURN toString(n.i) + ') SELECT \\'(' AS j } RETURN j"
        );
        expect(sql).toContain(") SELECT ''(");
        expect(hinted(sql)).toHaveLength(plain.length);
    });

    it("should read a FOREACH's rows alone as one row, and plan a statement with neither as it was", () => {
        expect(
            hinted(compiled('UNWIND [1, 2] AS k FOREACH (x IN [k] | CREATE (:CyWrite {f: x})) RETURN k'))
        ).not.toEqual([]);
        for (const cypher of [
            'UNWIND range(1, 3) AS i CREATE (:CyLoop {i: i})',
            'MATCH (n:CyLoop) SET n.x = n.i RETURN n.x',
            'MATCH (n:CyLoop) RETURN n.i'
        ]) {
            expect([cypher, compiled(cypher)]).toEqual([cypher, expect.not.stringContaining('CARDINALITY')]);
        }
    });
});
