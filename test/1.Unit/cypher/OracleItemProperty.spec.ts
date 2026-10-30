import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, a property that is an item of a `RETURN` or a `WITH` is read through its text, as extended JSON: Oracle
 * crashed the session where a statement took a text past 32 KB from the properties as JSON for each of two rows
 * (liberation-data/drivine#320). So is a text a write takes from the row it is writing, to work out what it writes
 * (liberation-data/drivine#356), an unwound item's value a `RETURN` or a `WITH` gives (liberation-data/drivine#366),
 * and an item of a list read by its place (liberation-data/drivine#455). Elsewhere a property is read as it was.
 * drivine4j's `OracleItemPropertyTest`.
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

    it("should read an unwound item's value an item returns or passes on through the item's text on Oracle where it is a text", () => {
        // Oracle crashed the session where such a value, a text past 32 KB, was read as JSON for each of two rows (#366).
        const read = (json: string): string =>
            `CASE WHEN JSON_VALUE(${json}, '$.a.type()') = 'string' THEN JSON(JSON_QUERY(JSON_SERIALIZE(${json} RETURNING CLOB), '$.a' RETURNING CLOB)) ` +
            `ELSE JSON_QUERY(${json}, '$.a' RETURNING JSON) END`;
        const compiled = (cypher: string): string => new OracleCypherCompiler('g').compile(cypher, { ts: [] }).sql;
        expect(compiled('UNWIND $ts AS t RETURN t.a')).toContain(`${read('u1.item')} AS c1`);
        expect(compiled('UNWIND $ts AS t WITH t.a AS a CREATE (:Doc {a: a})')).toContain(`${read('u1.item')} AS c1`);
        expect(compiled('UNWIND $ts AS t WITH t RETURN t.a')).toContain(`${read('w3.c1')} AS c1`);
        expect(compiled('UNWIND $ts AS t MATCH (n:Doc {id: t.id}) SET n.b = 1 RETURN t.a')).toContain(
            `${read("JSON_QUERY(r4.item, '$.v1' RETURNING JSON)")} AS c1`
        );
        // Tested, sorted, nested in an item, or matched by a pattern, as it was.
        const other = compiled('UNWIND $ts AS t WITH t WHERE t.b = 1 RETURN [t.a] ORDER BY t.c');
        expect(other).not.toContain('SERIALIZE');
        expect(other).toContain("JSON_QUERY(w3.c1, '$.a' RETURNING JSON)");
        expect(compiled('UNWIND $ts AS t MERGE (n:Doc {a: t.a})')).toContain(
            "= JSON_QUERY(JSON_QUERY(cy_row, '$.v1' RETURNING JSON), '$.a' RETURNING JSON)"
        );
        const throughText = (cypher: string): void => {
            const sql = compiled(cypher);
            expect(sql).toContain('JSON_SERIALIZE(');
            expect(sql).toContain("'$.a.type()'");
        };
        // A UNION whose every query returns an unwound item gives one, read so too.
        throughText('CALL { UNWIND $ts AS m RETURN m UNION ALL UNWIND $ts AS m RETURN m } RETURN m.a');
        // A map made of a node's properties and carried past a write is read from the write's rows, so read so too.
        throughText('MATCH (n:Doc) WITH n, n {.a} AS m SET n.b = 1 RETURN m.a');
        // So does a CALL that returns one, an OPTIONAL one among them.
        throughText('CALL { UNWIND $ts AS m RETURN m } RETURN m.a');
        throughText('OPTIONAL CALL { UNWIND $ts AS m RETURN m } RETURN m.a');
        // A temporal value's field, or a key that may name one, is read as a temporal field is.
        for (const cypher of ['UNWIND $ts AS t RETURN t.year', "UNWIND [date('2020-01-02')] AS t RETURN t.year"]) {
            expect(compiled(cypher)).not.toContain("'$.year.type()'");
        }
    });

    it("should read a value of a map made of a node's properties, or written, as elsewhere on Oracle", () => {
        // Only a value read from an unwound item is read through its text: a CASE on a node's properties made Oracle
        // drop a label test.
        for (const cypher of [
            'MATCH (n:Doc) RETURN properties(n).a',
            'MATCH (n:Doc) WITH n {.a} AS m RETURN m.a',
            'MATCH (n:Doc) WITH {a: n.a} AS m RETURN m.a',
            'MATCH (n:Doc) CALL { WITH n RETURN n {.a} AS m UNION ALL UNWIND [{a: 1}] AS m RETURN m } RETURN m.a'
        ]) {
            expect(oracle(cypher)).not.toContain('SERIALIZE');
        }
    });

    it("should read an unwound item's value returned on Postgres as elsewhere", () => {
        const compiled = (cypher: string): string => new PostgresCypherCompiler('g').compile(cypher, { ts: [] }).sql;
        expect(compiled('UNWIND $ts AS t RETURN t.a')).toContain("SELECT (u1.item -> 'a') AS c1");
        expect(compiled('UNWIND $ts AS t WITH t RETURN t.a')).toContain("SELECT (w3.c1 -> 'a') AS c1");
        // A statement that writes is a function on Postgres, made by the compiled statement's setup.
        const made = new PostgresCypherCompiler('g')
            .compile('UNWIND $ts AS t MATCH (n:Doc {id: t.id}) SET n.b = 1 RETURN t.a', { ts: [] })
            .setup.join('\n');
        expect(made).toContain("SELECT ((r4.item -> 'v1') -> 'a') AS c1");
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

    describe('beside a long value, which is bound in a subquery', () => {
        // A value past SHARED_ABOVE's length is bound in a subquery. A property beside it was bound there as JSON, and read
        // as a CLOB from that; left where it is read, its CLOB was read beside the subquery. On two rows or more, a text
        // past 32 KB so closed the session either way (liberation-data/drivine4j#370).
        const long = 'toLower(trim(coalesce($p.q, m.name)))';

        /** `cypher`, whose long value is bound, compiled; its property `a` is not bound as JSON, and the nodes' labels are tested. */
        const compiledBeside = (cypher: string): string => {
            const sql = new OracleCypherCompiler('g').compile(cypher, { p: { q: null } }).sql;
            expect([cypher, / AS v1\b/.test(sql)]).toEqual([cypher, true]);
            expect([cypher, /JSON_QUERY\([\w.]+props, '\$.[ab]' RETURNING JSON\) AS v/.test(sql)]).toEqual([
                cypher,
                false
            ]);
            expect([cypher, /JSON_VALUE\(JSON_QUERY\([\w.]+props, '\$.[ab]' RETURNING JSON\)/.test(sql)]).toEqual([
                cypher,
                false
            ]);
            expect([cypher, count(sql, 'JSON_EXISTS(')]).toEqual([cypher, 2]);
            return sql;
        };

        it('should bind the texts of a property a text function reads on Oracle beside it, by its own path', () => {
            const shapes = [
                'n.a CONTAINS #',
                '# CONTAINS n.a',
                'n.a STARTS WITH #',
                'n.a ENDS WITH #',
                'split(n.a, #)',
                "replace(n.a, #, 'x')",
                "replace(n.a, 'x', #)",
                'replace(n.a, n.b, #)'
            ];
            for (const shape of shapes) {
                const term = shape.replace('#', long);
                for (const cypher of [
                    `MATCH (n:Doc), (m:Doc) RETURN ${term}`,
                    `MATCH (n:Doc), (m:Doc) WITH n, m WHERE ${term} IS NOT NULL RETURN 1`
                ]) {
                    const sql = compiledBeside(cypher);
                    expect([cypher, /JSON_VALUE\([\w.]+props, '\$.a'\) END AS v\d+/.test(sql)]).toEqual([cypher, true]);
                    expect([cypher, /JSON_VALUE\([\w.]+props, '\$.a' RETURNING CLOB\) END AS v\d+/.test(sql)]).toEqual([
                        cypher,
                        true
                    ]);
                    expect([
                        cypher,
                        /THEN JSON_VALUE\([\w.]+props, '\$.a' RETURNING CLOB\) END(?! AS v)/.test(sql)
                    ]).toEqual([cypher, false]);
                }
            }
        });

        it('should bind the kind and the CLOB of a property a sum reads on Oracle beside it, by its own path', () => {
            // Bound beside the long value as JSON and read as a CLOB from that, a text past 32 KB closed the session; left
            // where it is read beside the subquery, a sum of short texts closed it on one row, `a.id + '->' + b.id`.
            for (const shape of [
                'n.a + #',
                '# + n.a',
                'size(n.a + #)',
                'n.a + duration(#)',
                'duration(#) + n.a',
                'n.a - duration(#)'
            ]) {
                const sql = compiledBeside(`MATCH (n:Doc), (m:Doc) RETURN ${shape.replace('#', long)}`);
                expect([shape, sql]).toEqual([
                    shape,
                    expect.stringContaining("JSON_VALUE(n1.props, '$.a.type()') AS v")
                ]);
                expect([shape, sql]).toEqual([
                    shape,
                    expect.stringContaining("JSON_VALUE(n1.props, '$.a' RETURNING CLOB) AS v")
                ]);
                expect([shape, sql]).toEqual([
                    shape,
                    expect.stringContaining(
                        "CASE WHEN JSON_VALUE(n1.props, '$.a.length()' RETURNING NUMBER) > 32767 THEN NULL ELSE JSON_QUERY(n1.props, '$.a' RETURNING JSON) END AS v"
                    )
                ]);
                // Read nowhere else: its length, its JSON, its kind and its CLOB.
                expect([shape, count(sql, "n1.props, '$.a")]).toEqual([shape, 4]);
                // Its kind and its CLOB are read from their own columns, not from its JSON, which is null past 32,767 characters.
                const [, json, kindColumn] = /END AS (v\d+), JSON_VALUE\(n1.props, '\$.a.type\(\)'\) AS (v\d+)/.exec(
                    sql
                )!;
                const view = new RegExp(`(sh\\d+)\\.${kindColumn}\\b`).exec(sql)![1];
                const fromJson = new RegExp(
                    `JSON_VALUE\\(${view}\\.${json}, '\\$(\\.type\\(\\)'\\)|' RETURNING CLOB\\))`
                );
                expect([shape, fromJson.test(sql)]).toEqual([shape, false]);
            }
            const sum = oracle("MATCH (a)-[:R]->(b) RETURN a.id + '->' + b.id");
            expect(sum).toContain("JSON_VALUE(n2.props, '$.id.type()') AS v");
            expect(count(sum, "n2.props, '$.id")).toBe(4);
        });

        it('should work out first an aggregate of a text function a property is read by beside it, its texts bound there', () => {
            // An aggregate's argument binds no value; one that would is worked out first, for each row (drivine4j#333), which the
            // texts' binding says as shared's does, so the property's texts are bound beside the long value there too. A
            // long literal binds nothing of its own, so only the texts' binding says the argument binds a value.
            const literal = `'${'y'.repeat(250)}'`;
            for (const aggregate of [
                `count(CASE WHEN n.a CONTAINS ${literal} THEN 1 END)`,
                `collect(split(n.a, ${literal}))`
            ]) {
                const cypher = `MATCH (n:Doc), (m:Doc) RETURN ${aggregate}`;
                const sql = compiledBeside(cypher);
                expect([cypher, /JSON_VALUE\([\w.]+props, '\$.a' RETURNING CLOB\) END AS v\d+/.test(sql)]).toEqual([
                    cypher,
                    true
                ]);
            }
        });
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

    it("should read an item of a list read by its place on Oracle through the list's text where it is a text", () => {
        // Taken out of the list as JSON, a text past 32 KB closed the session from the second run on, given two rows
        // (#455). So the item's kind is read first, and only an item of another kind is taken out as JSON, in the
        // CASE's ELSE.
        const shapes = [
            "RETURN size(split(n.a, 'x')[0])",
            "WITH split(n.a, 'x') AS parts RETURN size(parts[0])",
            "RETURN split(n.a, 'x')[0]",
            "WITH split(n.a, 'x') AS parts RETURN parts[-1]",
            "RETURN size(split(n.a, 'x')[n.i])",
            "RETURN size(split(n.a, 'x')[0..1][0])",
            'RETURN n.tags[0]',
            'RETURN [x IN range(0, 1) | toUpper(n.tags[x])]'
        ];
        for (const shape of shapes) {
            const sql = oracle(`MATCH (n:Doc) ${shape}`);
            // Each read of the item is its kind's, its text's, and in the ELSE, its JSON's.
            const [kinds, texts, all] = [
                "'$[$i].type()' PASSING ",
                "RETURNING CLOB), '$[$i]' PASSING ",
                "'$[$i]' PASSING "
            ].map((it) => count(sql, it));
            expect([shape, kinds > 0, texts, all]).toEqual([shape, true, kinds, 2 * kinds]);
            expect([shape, count(sql, 'ELSE JSON_QUERY(') >= kinds]).toEqual([shape, true]);
            // The node's label test stays.
            expect([shape, count(sql, 'JSON_EXISTS(')]).toEqual([shape, 1]);
        }
        // By head and last; of a stored list, its kind read by the property's own path (see direct).
        const ends = oracle("MATCH (n:Doc) RETURN [size(head(split(n.a, 'x'))), last(split(n.a, 'x')), head(n.tags)]");
        expect(ends).toContain("'$[0].type()') = 'string'");
        expect(ends).toContain("'$[last].type()') = 'string'");
        expect(ends).toContain("RETURNING CLOB), '$[0]' RETURNING CLOB)");
        expect(ends).toContain("RETURNING CLOB), '$[last]' RETURNING CLOB)");
        expect(ends).toContain("JSON_VALUE(n1.props, '$.tags[0].type()') = 'string'");
        for (const end of ['0', 'last']) {
            const [texts, all] = [`RETURNING CLOB), '$[${end}]' RETURNING CLOB)`, `'$[${end}]' RETURNING`].map((it) =>
                count(ends, it)
            );
            expect([end, texts > 0, all]).toEqual([end, true, 2 * texts]);
        }
        // An unwound item is read as it was: JSON_TABLE's item did not close the session.
        expect(oracle("MATCH (n:Doc) UNWIND split(n.a, 'x') AS p RETURN size(p)")).not.toContain(
            "RETURNING CLOB), '$["
        );
        // Postgres reads an item as before.
        const postgres = new PostgresCypherCompiler('g').compile(
            "MATCH (n:Doc) RETURN [split(n.a, 'x')[0], head(n.tags), last(n.tags)]"
        ).sql;
        expect(postgres).toContain('-> 0)');
        expect(postgres).toContain('-> -1)');
        expect(postgres).not.toContain('CLOB');
    });

    it('should be read on Postgres as elsewhere', () => {
        expect(new PostgresCypherCompiler('g').compile('MATCH (n:Doc) RETURN n.a').sql).toContain("(n1.props -> 'a')");
    });
});
