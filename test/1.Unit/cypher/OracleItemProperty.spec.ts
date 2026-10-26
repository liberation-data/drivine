import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, a property that is an item of a `RETURN` or a `WITH` is read through its text, as extended JSON: Oracle
 * crashed the session where a statement took a text past 32 KB from the properties as JSON for each of two rows
 * (liberation-data/drivine#320). Elsewhere a property is read as it was. drivine4j's `OracleItemPropertyTest`.
 */
describe('A property an item of a RETURN or a WITH gives in compiled Cypher', () => {
    const long =
        "JSON(JSON_QUERY(JSON_SERIALIZE(JSON_TRANSFORM(n1.props, KEEP '$.a') RETURNING CLOB EXTENDED), '$.a' RETURNING CLOB) EXTENDED)";
    const oracle = (cypher: string): string => new OracleCypherCompiler('g').compile(cypher).sql;
    const count = (sql: string, of: string): number => sql.split(of).length - 1;

    it('should be read on Oracle through its text where an item returns or passes it on, and as it was where sorted, tested or nested in an item', () => {
        const returned = oracle('MATCH (n:Doc) WHERE n.b = 1 RETURN n.a ORDER BY n.id');
        expect(returned).toContain(`${long} AS c1`);
        expect(returned).toContain(`JSON_QUERY(n1.props, '$.id' RETURNING JSON) AS s1`);
        expect(returned).toContain(`JSON_QUERY(n1.props, '$.b' RETURNING JSON)`);
        expect(count(oracle('MATCH (n:Doc) WITH n.a AS a RETURN [a]'), long)).toBe(1);
        expect(oracle('MATCH (n:Doc) RETURN [n.a, n {.a}]')).not.toContain('RETURNING CLOB');
        const sorted = oracle('MATCH (n:Doc) RETURN n.a ORDER BY n.a');
        expect(sorted).toContain(`${long} AS c1`);
        expect(sorted).toContain(`${long} AS s1`);
    });

    it('should be read on Oracle as elsewhere beside a variable-length walk', () => {
        const sql = oracle('MATCH (:Doc {id: 1})-[:R*]->(n) RETURN n.a');
        expect(sql).not.toContain('RETURNING CLOB');
        expect(sql).toContain(".a' RETURNING JSON)");
    });

    it("should be read on Oracle through its text where it is a relationship's", () => {
        expect(oracle('MATCH ()-[r:R]->() RETURN r.a')).toContain(
            "KEEP '$.a') RETURNING CLOB EXTENDED), '$.a' RETURNING CLOB) EXTENDED)"
        );
    });

    it("should be read on Oracle as elsewhere where it is a map's value", () => {
        const sql = oracle('WITH {a: 1} AS m RETURN m.a');
        expect(sql).not.toContain('KEEP');
        expect(sql).toContain("'$.a' RETURNING JSON)");
    });

    it("should be read on Oracle from its column where it is a node's stamp", () => {
        const sql = oracle('MATCH (n) RETURN n.`__drivine.stamp`');
        expect(sql).toContain('JSON_SCALAR(n1.stamp) AS c1');
        expect(sql).not.toContain('KEEP');
    });

    it('should be read on Oracle through its text where an item groups by it or makes it distinct', () => {
        expect(oracle('MATCH (n:Doc) RETURN n.a, count(*)')).toContain(long);
        expect(oracle('MATCH (n:Doc) RETURN DISTINCT n.a')).toContain(long);
    });

    it('should be read on Oracle through its text where a write returns it', () => {
        expect(oracle('MATCH (n:Doc) SET n.b = 1 RETURN n.a')).toContain(
            "KEEP '$.a') RETURNING CLOB EXTENDED), '$.a' RETURNING CLOB) EXTENDED) AS c1"
        );
    });

    it('should be read on Oracle through its text where an OPTIONAL MATCH, a CALL, a UNION or a list gives the node', () => {
        const kept = "KEEP '$.a') RETURNING CLOB EXTENDED)";
        expect(count(oracle('MATCH (n:Doc) OPTIONAL MATCH (n)-[r:R]->(m) RETURN m.a, r.a'), kept)).toBe(2);
        expect(oracle('MATCH (n) CALL { WITH n MATCH (n)-->(m) RETURN m.a AS x } RETURN x')).toContain(
            "KEEP '$.a') RETURNING CLOB EXTENDED), '$.a' RETURNING CLOB) EXTENDED) AS c1"
        );
        expect(count(oracle('MATCH (n:Doc) RETURN n.a AS a UNION MATCH (n:Doc) RETURN n.a AS a'), kept)).toBe(2);
        expect(oracle('MATCH (n:Doc) WITH collect(n) AS ns RETURN ns[0].a')).toContain(
            "KEEP '$.a') RETURNING CLOB EXTENDED), '$.a' RETURNING CLOB) EXTENDED) AS c1"
        );
    });

    it('should be read on Postgres as elsewhere', () => {
        expect(new PostgresCypherCompiler('g').compile('MATCH (n:Doc) RETURN n.a').sql).toContain("(n1.props -> 'a')");
    });
});
