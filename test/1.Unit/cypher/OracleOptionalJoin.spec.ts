import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, an `OPTIONAL CALL` or an `OPTIONAL MATCH` is a lateral join on `1 = 1`: in a scalar subquery, as a
 * `COUNT { … }` is, Oracle refused a join on `TRUE` followed by `WHERE … AND …` (ORA-00907), and crashed the session on
 * one without (#377). See drivine4j's docs/oracle-on-true-in-scalar-subquery-crash.md. Postgres joins on `TRUE`
 * still. drivine4j's `OracleOptionalJoinTest`.
 */
describe('An optional lateral join in compiled Cypher', () => {
    const statements = [
        "MATCH (n:CyOpt {id: 1}) RETURN COUNT { OPTIONAL CALL { MATCH (z:Nope) RETURN z.k AS u } MATCH (y:CyOpt) WHERE y.k = 'q' RETURN y }",
        'MATCH (n:CyOpt {id: 1}) RETURN COUNT { OPTIONAL CALL { MATCH (z:Nope) RETURN z.k AS u } RETURN u }',
        'MATCH (n:CyOpt {id: 1}) RETURN COUNT { OPTIONAL MATCH (z:Nope) RETURN z }',
        'OPTIONAL CALL { MATCH (z:Nope) RETURN z.k AS u } RETURN u',
        'UNWIND $ts AS t MATCH (n {id: t.id}) SET n.a = COUNT { OPTIONAL CALL { WITH t MATCH (z:Nope) RETURN t AS u } RETURN u }'
    ];

    it('should be on 1 = 1 on Oracle, not on TRUE', () => {
        for (const cypher of statements) {
            const sql = new OracleCypherCompiler('g').compile(cypher, { ts: [] }).sql;
            expect(sql).toMatch(/LEFT JOIN LATERAL \(\n(.*\n)*?\s*\) [co]\d+ ON 1 = 1\n/);
            expect(sql).not.toContain('ON TRUE');
        }
    });

    it('should leave a CALL that is not optional a cross join, and Postgres joining on TRUE', () => {
        const called = new OracleCypherCompiler('g').compile(
            'MATCH (n:CyOpt) RETURN COUNT { CALL { MATCH (z:Nope) RETURN z.k AS u } RETURN u }'
        ).sql;
        expect(called).toMatch(/CROSS JOIN LATERAL \(\n(.*\n)*?\s*\) c\d+\n/);
        expect(called).not.toContain(' ON ');
        expect(new PostgresCypherCompiler('g').compile(statements[1]).sql).toMatch(/\) c\d+ ON TRUE/);
    });
});
