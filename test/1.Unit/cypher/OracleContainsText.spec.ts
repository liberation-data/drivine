import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, CONTAINS looks for a text with `INSTR`, as `VARCHAR2`s first, and where that gives null as CLOBs. `INSTR`
 * refuses to look for a text past 32,767 UTF-16 units (ORA-22828), so a longer one is compared with `DBMS_LOB.COMPARE`
 * where it is as long as the text, and else at each place its first 1,000 units are, carried from one to the next by
 * `MODEL` (liberation-data/drivine#457). drivine4j's `OracleContainsTextTest`.
 */
describe('CONTAINS of a text in compiled Cypher', () => {
    const oracle = (cypher: string, parameters: Record<string, any> = { t: 'abc', x: 'b' }): string =>
        new OracleCypherCompiler('g').compile(cypher, parameters).sql;
    const count = (sql: string, of: string): number => sql.split(of).length - 1;

    it('should look for a text on Oracle by INSTR as a VARCHAR2, and as a CLOB by INSTR, DBMS_LOB.COMPARE or a search by its first units', () => {
        const sql = oracle('WITH $t AS t, $x AS x RETURN t CONTAINS x');
        const short = 'COALESCE((INSTR(CASE WHEN';
        expect(sql).toContain(short);
        const after = (text: string, of: string): string => text.substring(text.indexOf(of) + of.length);
        const long = after(after(sql, short), '(SELECT (CASE WHEN ');
        const sides = /^(sh\d+\.v1) IS NULL OR (sh\d+\.v2) IS NULL THEN NULL /.exec(long);
        expect(sides).not.toBeNull();
        const [, t, x] = sides!;
        // The CLOBs, bound once.
        expect(long).toContain("JSON_VALUE(w2.c1, '$' RETURNING CLOB) END AS v1");
        // Each a number, and only the CASE compared with 1: Oracle found (SELECT … MODEL …) = 1 false where the
        // subquery gave 1.
        expect(long).toContain(`WHEN LENGTH(${x}) <= 32767 THEN SIGN(INSTR(${t}, ${x})) `);
        expect(long).toContain(
            `WHEN LENGTH(${x}) >= LENGTH(${t}) THEN CASE WHEN LENGTH(${x}) = LENGTH(${t}) AND DBMS_LOB.COMPARE(${t}, ${x}) = 0 THEN 1 ELSE 0 END `
        );
        const search =
            `ELSE (SELECT cs_found FROM DUAL MODEL DIMENSION BY (0 cs_i) MEASURES (INSTR(${t}, SUBSTR(${x}, 1, 1000)) cs_at, 0 cs_found) ` +
            `RULES ITERATE (4294967295) UNTIL (cs_found[0] <> 0) (cs_found[0] = CASE WHEN cs_at[0] = 0 OR cs_at[0] > LENGTH(${t}) - LENGTH(${x}) + 1 THEN -1 ` +
            `WHEN DBMS_LOB.COMPARE(${t}, ${x}, LENGTH(${x}), cs_at[0], 1) = 0 THEN 1 ELSE 0 END, ` +
            `cs_at[0] = CASE WHEN cs_found[0] = 0 THEN INSTR(${t}, SUBSTR(${x}, 1, 1000), cs_at[0] + 1) ELSE cs_at[0] END)) END = 1)`;
        expect(long).toContain(search);
        // A short text's VARCHAR2 is looked for as before, and only by INSTR.
        expect(count(sql, 'MODEL DIMENSION BY')).toBe(1);
        expect(sql.split(', (SELECT (CASE WHEN')[0]).not.toContain('DBMS_LOB');
    });

    it('should bind a stored text on Oracle by its own path for its CLOB, and look for a text on Postgres as it did', () => {
        const stored = oracle('MATCH (n:Doc) RETURN n.t CONTAINS n.x');
        // Read inside the bound subquery, as liberation-data/drivine#411 has a property beside one read.
        expect(stored).toContain("JSON_VALUE(n1.props, '$.t' RETURNING CLOB) END AS v1");
        expect(stored).toContain("JSON_VALUE(n1.props, '$.x' RETURNING CLOB) END AS v2");
        expect(stored).toContain(
            "(INSTR(CASE WHEN JSON_VALUE(n1.props, '$.t.type()') = 'string' THEN JSON_VALUE(n1.props, '$.t') END"
        );
        const postgres = new PostgresCypherCompiler('g').compile('WITH $t AS t, $x AS x RETURN t CONTAINS x', {
            t: 'abc',
            x: 'b'
        }).sql;
        expect(postgres).toContain('strpos(');
        expect(postgres).not.toContain('MODEL');
    });

    it('should take the same search on Oracle in a write, a WHERE and beside a long value', () => {
        expect(oracle('MATCH (n:Doc) SET n.r = n.t CONTAINS $x', { x: 'b' })).toContain('MODEL DIMENSION BY (0 cs_i)');
        expect(oracle('MATCH (n:Doc) WHERE n.t CONTAINS $x RETURN n')).toContain('MODEL DIMENSION BY (0 cs_i)');
        const beside = oracle(
            'MATCH (n:Doc), (m:Doc) WHERE n.t CONTAINS toLower(trim(coalesce($p.q, m.name))) RETURN count(*)',
            { p: { q: null } }
        );
        expect(beside).toContain('MODEL DIMENSION BY (0 cs_i)');
        expect(beside).toMatch(/JSON_VALUE\(n1\.props, '\$\.t' RETURNING CLOB\) END AS v\d/);
    });

    it("should take the same search on Oracle in an aggregate's argument, and INSTR alone over an aggregate's result", () => {
        // An aggregate's argument is read from each row, where the CLOBs may be bound.
        expect(
            count(oracle('MATCH (n:Doc) RETURN count(CASE WHEN n.t CONTAINS n.x THEN 1 END)'), 'MODEL DIMENSION BY')
        ).toBe(1);
        // Past an aggregate's argument, and past an item that aggregates, the CLOBs are bound again.
        expect(
            count(
                oracle(
                    'MATCH (n:Doc) RETURN count(CASE WHEN n.t CONTAINS n.x THEN 1 END) > 0 AND head(collect(n.t)) CONTAINS head(collect(n.x))'
                ),
                'MODEL DIMENSION BY'
            )
        ).toBe(1);
        expect(count(oracle('MATCH (n:Doc) RETURN count(*) AS m, n.t CONTAINS n.x AS c'), 'MODEL DIMENSION BY')).toBe(
            1
        );
        // Oracle reads no aggregate of the query it is in from a subquery (ORA-00937), so over one the CLOBs are looked
        // for as before, until liberation-data/drivine#414 works the aggregates out first.
        for (const cypher of [
            'MATCH (n:Doc) RETURN head(collect(n.t)) CONTAINS head(collect(n.x))',
            'MATCH (n:Doc) RETURN n.k AS k, head(collect(n.t)) CONTAINS last(collect(n.x)) AS c',
            "MATCH (n:Doc) RETURN n.k AS k, count(*) AS c ORDER BY head(collect(n.t)) CONTAINS 'x'"
        ]) {
            const sql = oracle(cypher);
            expect([cypher, sql.includes('MODEL'), sql.includes('NO_MERGE */ CASE')]).toEqual([cypher, false, false]);
            expect(sql).toContain('RETURNING CLOB) END) > 0)');
        }
    });
});
