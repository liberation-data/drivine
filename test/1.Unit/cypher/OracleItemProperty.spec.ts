import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, a property that is an item of a `RETURN` or a `WITH` is read through its text, as extended JSON: Oracle
 * crashed the session where a statement took a text past 32 KB from the properties as JSON for each of two rows
 * (liberation-data/drivine#320). So is a text a write takes from the row it is writing, to work out what it writes
 * (liberation-data/drivine#356). Elsewhere a property is read as it was. drivine4j's `OracleItemPropertyTest`.
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

    it("should read a text a write takes from its row through the row's text on Oracle, and match its pattern as it was", () => {
        const read = (at: string): string =>
            `CASE WHEN JSON_VALUE(cy_row, '${at}.type()') = 'string' THEN JSON(JSON_QUERY(JSON_SERIALIZE(cy_row RETURNING CLOB), '${at}' RETURNING CLOB)) ` +
            `ELSE JSON_QUERY(cy_row, '${at}' RETURNING JSON) END`;
        const compile = (cypher: string): string => new OracleCypherCompiler('g').compile(cypher, { ts: [] }).sql;
        const set = compile('UNWIND $ts AS t MATCH (n:Doc {id: t.id}) SET n.a = t.a, n.b = t, n.c = t.m.`k.j`');
        expect(set).toContain(`SELECT ${read('$.v1.a')} INTO cy_value`);
        expect(set).toContain(`SELECT ${read('$.v1')} INTO cy_value`);
        expect(set).toContain(`SELECT ${read('$.v1.m."k.j"')} INTO cy_value`);
        expect(set).not.toContain('JSON_QUERY(JSON_QUERY(cy_row');
        const merged = compile('UNWIND $ts AS t MERGE (n:Doc {id: t.id}) ON CREATE SET n.a = t.a');
        expect(merged).toContain("= JSON_QUERY(JSON_QUERY(cy_row, '$.v1' RETURNING JSON), '$.id' RETURNING JSON)");
        expect(merged).toContain(
            `JSON_OBJECT('id' VALUE ${read('$.v1.id')} NULL ON NULL RETURNING JSON) INTO cy_value`
        );
        expect(merged).toContain(`SELECT ${read('$.v1.a')} INTO cy_value`);
        // A FOREACH's write reads its own variable and the rows' alike, each from the row it is writing.
        const each = compile('UNWIND $ts AS t MATCH (n:Doc {id: t.id}) FOREACH (x IN t.xs | SET n.a = x.a, n.b = t.a)');
        expect(each).toContain(`SELECT ${read('$.v3.a')} INTO cy_value`);
        expect(each).toContain(`SELECT ${read('$.v1.a')} INTO cy_value`);
    });

    it("should read a value a UNION in a write's subquery takes from its row in each query from what the UNION gives", () => {
        // x is t.m in one query and t.l in the other: read from the row at the first's keys, the other's rows read t.m.a.
        const sql = new OracleCypherCompiler('g').compile(
            'UNWIND $ts AS t MATCH (n {id: t.id}) SET n.a = COUNT { CALL { WITH t RETURN t.m AS x UNION ALL ' +
                'WITH t RETURN t.l AS x } MATCH (y) WHERE y.k = x.a RETURN y }',
            { ts: [] }
        ).sql;
        expect(sql).not.toContain("'$.v1.m.a'");
        expect(sql).not.toContain("'$.v1.l.a'");
    });

    it("should read a value an OPTIONAL CALL in a write's subquery returns from its row from what the call gives", () => {
        // u is null where the call finds nothing: read from the row, it would be t, and y.k compared with t.a.
        const cypher =
            'UNWIND $ts AS t MATCH (n {id: t.id}) SET n.a = COUNT { OPTIONAL CALL { WITH t MATCH (y:Nope) RETURN t AS u } ' +
            'MATCH (y) WHERE y.k = u.a RETURN y }';
        expect(new OracleCypherCompiler('g').compile(cypher, { ts: [] }).sql).not.toContain("'$.v1.a'");
        const made = new PostgresCypherCompiler('g').compile(cypher, { ts: [] }).setup.join('\n');
        expect(made).toContain('cy_row');
        expect(made).not.toContain("((cy_row -> 'v1') -> 'a')");
    });

    it('should read a value a write takes from its row on Postgres as elsewhere', () => {
        // A statement that writes is a function on Postgres, made by the compiled statement's setup.
        const made = new PostgresCypherCompiler('g')
            .compile('UNWIND $ts AS t MATCH (n:Doc {id: t.id}) SET n.a = t.a, n.c = t.m.k', { ts: [] })
            .setup.join('\n');
        expect(made).toContain("SELECT ((cy_row -> 'v1') -> 'a') INTO cy_value");
        expect(made).toContain("SELECT (((cy_row -> 'v1') -> 'm') -> 'k') INTO cy_value");
    });

    it('should be read on Oracle from the properties by its own path where a text function or a sum reads it, and not taken out as JSON first', () => {
        // Taken out with JSON_QUERY and read as a CLOB or summed, a text past 32 KB closed the session, one row a
        // statement, and a later statement lost its rows (#347).
        const sql = oracle(
            "MATCH (n:Doc) RETURN [toUpper(n.a), size(n.a), substring(n.a, 1), n.a STARTS WITH 'x', n.a + 'x', toString(n.a)]"
        );
        expect(sql).not.toContain("JSON_VALUE(JSON_QUERY(n1.props, '$.a' RETURNING JSON)");
        expect(sql).toContain("JSON_VALUE(n1.props, '$.a' RETURNING CLOB)");
        expect(sql).toContain("JSON_VALUE(n1.props, '$.a.type()')");
        expect(sql).toContain("JSON_VALUE(n1.props, '$.a.size()' RETURNING NUMBER)");
    });

    it('should be read on Oracle by its own path where its key is quoted in its path, or by its path in a map', () => {
        const read = (cypher: string): string => {
            const sql = oracle(cypher);
            expect(sql).not.toContain(`JSON_VALUE(JSON_QUERY(n1.props, '$."`);
            return sql;
        };
        const quoted = read("MATCH (n:Doc) RETURN [size(n.`it's`), toUpper(n.`a b`), size(n.`x' RETURNING JSON) y`)]");
        expect(quoted).toContain(`JSON_VALUE(n1.props, '$."it''s".size()' RETURNING NUMBER)`);
        expect(quoted).toContain(`JSON_VALUE(n1.props, '$."a b"' RETURNING CLOB)`);
        expect(quoted).toContain(`JSON_VALUE(n1.props, '$."x'' RETURNING JSON) y".type()')`);
        // A key in a map is read by its path in the map, the map taken out of the properties as it was.
        expect(read('MATCH (n:Doc) RETURN size(n.m.a)')).toContain(
            "JSON_VALUE(JSON_QUERY(n1.props, '$.m' RETURNING JSON), '$.a.size()' RETURNING NUMBER)"
        );
    });

    it('should be read on Postgres as elsewhere', () => {
        expect(new PostgresCypherCompiler('g').compile('MATCH (n:Doc) RETURN n.a').sql).toContain("(n1.props -> 'a')");
    });
});
