import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

const sql = (cypher: string): string => new OracleCypherCompiler('g').compile(cypher, { t: 'abc' }).sql;

/**
 * On Oracle, `reverse()` reverses a text as a `VARCHAR2` with `LISTAGG`, and where that gives null, a text past 4,000
 * bytes, reads it as a CLOB and reverses it in pieces, put together as JSON (liberation-data/drivine#363). drivine4j's
 * `OracleReverseTextTest`.
 */
describe('reverse() in compiled Cypher on Oracle', () => {
    it('should reverse a text as a VARCHAR2 first, and where that gives null as a CLOB in pieces put together as JSON', () => {
        const compiled = sql('WITH $t AS t RETURN reverse(t)');
        const short = 'COALESCE(JSON_SCALAR((SELECT LISTAGG(SUBSTR(';
        expect(compiled).toContain(short);
        const long = compiled.substring(compiled.indexOf(short) + short.length);
        // The CLOB, bound once, cut at each 1,000th UTF-16 unit, or one past it where a character past U+FFFF starts there.
        expect(long).toContain('TO_CLOB(CASE WHEN');
        expect(long).toContain("JSON_VALUE(w2.c1, '$' RETURNING CLOB) END) AS v1");
        expect(long).toContain('CONNECT BY LEVEL <= CEIL(LENGTH(sh');
        expect(long).toContain('CASE WHEN LENGTH(REGEXP_SUBSTR(sh');
        expect(long).toContain(".v1, '.', LEVEL * 1000, 1, 'n')) = 2 THEN 1 ELSE 0 END");
        expect(long).toContain('DBMS_LOB.SUBSTR(sh');
        // Each piece reversed as a short text is, and the pieces put together last to first, written in ASCII and read as JSON.
        expect(long).toContain(
            '(SELECT LISTAGG(SUBSTR(rv_piece.s, LEVEL, 1)) WITHIN GROUP (ORDER BY LEVEL DESC) FROM DUAL CONNECT BY LEVEL <= LENGTH(rv_piece.s)) r'
        );
        const joined =
            "JSON_SERIALIZE(JSON_ARRAYAGG('x' || rv_reversed.r ORDER BY rv_reversed.n DESC RETURNING JSON) RETURNING CLOB ASCII)";
        expect(long).toContain(
            `(SELECT JSON_QUERY(JSON(REPLACE(REPLACE(${joined}, '","x'), '["x', '["')), '$[0]' RETURNING JSON)`
        );
        // Worked out once, and not made JSON again.
        expect(compiled.split("JSON_ARRAYAGG('x'").length - 1).toBe(1);
        expect(long).not.toContain('JSON_SCALAR(CASE WHEN LENGTH((SELECT JSON_QUERY');
    });

    it('should read a stored text reversed by its own path, and on Postgres reverse a text as it did', () => {
        const stored = sql('MATCH (n:Doc) RETURN reverse(n.a)');
        expect(stored).toContain("JSON_VALUE(n1.props, '$.a')");
        expect(stored).toContain("JSON_VALUE(n1.props, '$.a' RETURNING CLOB)");
        const postgres = new PostgresCypherCompiler('g').compile('WITH $t AS t RETURN reverse(t)', { t: 'abc' }).sql;
        expect(postgres).toContain(
            "THEN to_jsonb(reverse(CASE WHEN jsonb_typeof(w2.c1) = 'string' THEN w2.c1 #>> '{}' END))"
        );
    });
});
