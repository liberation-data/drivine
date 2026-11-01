import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, two texts are compared as `VARCHAR2`s, or as CLOBs by `DBMS_LOB.COMPARE` where either is past 4,000 bytes,
 * and not as JSON: `=` of JSON refused a text past about 32 KB (ORA-40180), and `<`, `>`, `<=` and `>=` of one taken out
 * of the store as JSON on two rows or more closed the session (ORA-03113, liberation-data/drivine#469). A property is
 * read by its own path. drivine4j's `OracleCompareTextTest`.
 */
describe('Comparison of texts on Oracle in compiled Cypher', () => {
    const sql = (cypher: string, parameters: Record<string, any> = { x: 'abc' }): string =>
        new OracleCypherCompiler('g').compile(cypher, parameters).sql;
    const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = (text: string, of: string): number => text.split(of).length - 1;

    /** The comparison `operator` of two texts as CLOBs, `cx` and `cy`, each made a CLOB by `TO_CLOB`. */
    const clobs = (cx: string, cy: string, operator: string): string =>
        `NVL(DBMS_LOB.COMPARE(TO_CLOB(${cx}), TO_CLOB(${cy})), SIGN(NVL(LENGTH(TO_CLOB(${cx})), 0) - NVL(LENGTH(TO_CLOB(${cy})), 0))) ${operator} 0`;

    /** The comparison `operator` of two texts as their `VARCHAR2`s `sx` and `sy`, where both are read so, else as their CLOBs `cx` and `cy`. */
    const texts = (sx: string, sy: string, cx: string, cy: string, operator: string): string =>
        `CASE WHEN ${sx} IS NOT NULL AND ${sy} IS NOT NULL THEN ${sx} ${operator} ${sy} ELSE ${clobs(
            cx,
            cy,
            operator
        )} END`;

    const property = (node: string, clob: boolean = false): string =>
        `JSON_VALUE(${node}.props, '$.t'${clob ? ' RETURNING CLOB' : ''})`;

    /**
     * The property tested once, read as a `VARCHAR2` or no text, and then compared with each item of a list as JSON, a
     * plain equality.
     */
    const item = new RegExp(
        `\\(${escaped(
            property('n1')
        )} IS NOT NULL OR NVL\\(JSON_VALUE\\(n1\\.props, '\\$\\.t\\.type\\(\\)'\\), 'null'\\) <> 'string'\\) AND EXISTS \\(SELECT 1 FROM .*? i\\d+ WHERE i\\d+\\.item = JSON_QUERY\\(n1\\.props, '\\$\\.t' RETURNING JSON\\)\\)`
    );

    /** An item of a list compared with the property as a text, each as a CLOB. */
    const clobItem =
        /DBMS_LOB\.COMPARE\(TO_CLOB\(JSON_VALUE\(i\d+\.item, '\$' RETURNING CLOB\)\), TO_CLOB\(JSON_VALUE\(n1\.props, '\$\.t' RETURNING CLOB\)\)\)/;

    it('should order and compare two stored texts as VARCHAR2s or CLOBs, each read by its own path, and other values as JSON', () => {
        const n = [property('n1'), property('n2'), property('n1', true), property('n2', true)];
        for (const operator of ['<', '>', '<=', '>=']) {
            const ordered = sql(`MATCH (n:Doc), (m:Doc) WHERE n.t ${operator} m.t RETURN count(*)`);
            const text = texts(n[0], n[1], n[2], n[3], operator);
            expect(ordered).toContain(
                `THEN CASE WHEN JSON_VALUE(n1.props, '$.t.type()') = 'string' THEN ${text} ELSE JSON_QUERY(n1.props, '$.t' RETURNING JSON) ${operator} JSON_QUERY(n2.props, '$.t' RETURNING JSON) END END`
            );
            expect(ordered).not.toContain('JSON_VALUE(JSON_QUERY(');
        }
        // Equal as JSON where both are read as VARCHAR2s, as is quicker than reading their kinds; else as CLOBs where
        // both are texts, null where either isn't there, and not equal where one is a text.
        const equal = sql('MATCH (n:Doc), (m:Doc) RETURN n.t = m.t, n.t <> m.t');
        const json = "JSON_QUERY(n1.props, '$.t' RETURNING JSON) = JSON_QUERY(n2.props, '$.t' RETURNING JSON)";
        const kinds = (and: string): string =>
            `JSON_VALUE(n1.props, '$.t.type()') = 'string' ${and} JSON_VALUE(n2.props, '$.t.type()') = 'string'`;
        const compared =
            `CASE WHEN ${n[0]} IS NOT NULL AND ${n[1]} IS NOT NULL THEN ${json} WHEN ${kinds('AND')} THEN ${clobs(
                n[2],
                n[3],
                '='
            )} ` +
            `WHEN JSON_VALUE(n1.props, '$.t.type()') IS NULL OR JSON_VALUE(n2.props, '$.t.type()') IS NULL THEN NULL WHEN ${kinds(
                'OR'
            )} THEN FALSE ELSE ${json} END`;
        expect(count(equal, compared)).toBe(2);
        expect(equal).not.toContain('JSON_VALUE(JSON_QUERY(');
        // A query of one table that compares a property is not rewritten by Oracle's JSON table transformation, which
        // lost the reads of a node's properties beside a quantifier's subquery; one that compares none is, as before.
        for (const cypher of [
            'MATCH (n:Doc) WHERE n.t > $x RETURN n',
            'MATCH (n:Doc) RETURN all(x IN [1] WHERE n.b > 1962) = true'
        ]) {
            expect([cypher, sql(cypher).startsWith('SELECT /*+ NO_JSON_TABLE_TRANSFORM */')]).toEqual([cypher, true]);
        }
        expect(sql('MATCH (n:Doc) RETURN n.t')).not.toContain('NO_JSON_TABLE_TRANSFORM');
    });

    it('should compare a stored text with a given one, the items of a list and a long value as texts, the property bound by its own path', () => {
        // A given text of at most 4,000 bytes is read as a VARCHAR2, and so is equal to no stored text that isn't, which
        // is longer or empty.
        const given = sql('MATCH (n:Doc) WHERE n.t = $x RETURN n');
        expect(given).toContain(
            `CASE WHEN ${property(
                'n1'
            )} IS NOT NULL OR NVL(JSON_VALUE(n1.props, '$.t.type()'), 'null') <> 'string' THEN JSON_QUERY(n1.props, '$.t' RETURNING JSON) = JSON($_cy_x) ELSE FALSE END`
        );
        const longer = sql('MATCH (n:Doc) WHERE n.t = $x RETURN n', { x: '€'.repeat(1_334) });
        expect(longer).toContain(
            `THEN ${clobs(property('n1', true), "JSON_VALUE(JSON($_cy_x), '$' RETURNING CLOB)", '=')}`
        );
        const number = sql('MATCH (n:Doc) WHERE n.t = 5 RETURN n');
        expect(number).toContain(
            "<> 'string' THEN JSON_QUERY(n1.props, '$.t' RETURNING JSON) = JSON('5') ELSE FALSE END"
        );
        const truth = sql('MATCH (n:Doc) WHERE n.t = true RETURN n');
        expect(truth).toContain(
            "<> 'string' THEN JSON_QUERY(n1.props, '$.t' RETURNING JSON) = JSON('true') ELSE FALSE END"
        );
        // A value a WITH passes on may be JSON's null, which is tested first, then compared as a stored one is.
        const passed = sql('MATCH (n:Doc) WITH n.t AS t WHERE t = $x RETURN t');
        const t = /CASE WHEN NOT NVL\(JSON_VALUE\((w\d+\.c1), '\$\.type\(\)'\), 'null'\) = 'null' THEN/.exec(
            passed
        )![1];
        expect(passed).toContain(
            `THEN CASE WHEN JSON_VALUE(${t}, '$') IS NOT NULL OR NVL(JSON_VALUE(${t}, '$.type()'), 'null') <> 'string' THEN ${t} = JSON($_cy_x) ELSE FALSE END END`
        );
        const empty = sql("MATCH (n:Doc) WHERE n.t = '' RETURN n");
        expect(empty).toContain(
            `THEN ${clobs(property('n1', true), `JSON_VALUE(JSON('""'), '$' RETURNING CLOB)`, '=')}`
        );
        expect(empty).not.toContain('ELSE FALSE END');
        // Items each read as a VARCHAR2, written or given, are compared as JSON with the property, where it is read as one
        // too or is no text, which is tested once, not for each item; a longer text is in none of them.
        for (const cypher of [
            'MATCH (n:Doc) WHERE n.t IN $xs RETURN n',
            'MATCH (n:Doc) RETURN n.t IN $xs',
            "MATCH (n:Doc) RETURN n.t IN ['a', 5, $x]"
        ]) {
            const listed = sql(cypher, { xs: ['a', 'b'], x: 'abc' });
            expect([cypher, item.test(listed), listed.includes('DBMS_LOB')]).toEqual([cypher, true, false]);
        }
        // So are those of a given list that holds a null, which is compared whole, not item by item. Where the property
        // is in no item, a RETURN is null, as the comparison with the null item is: no item is read for that, nor is the
        // property read for its nulls, which took a text past 32 KB out as JSON and closed the session.
        for (const cypher of ['MATCH (n:Doc) WHERE n.t IN $xs RETURN n', 'MATCH (n:Doc) RETURN n.t IN $xs']) {
            const listed = sql(cypher, { xs: ['a', null] });
            expect([cypher, item.test(listed), clobItem.test(listed), listed.includes('JSON_SERIALIZE')]).toEqual([
                cypher,
                true,
                false,
                false
            ]);
        }
        expect(sql('MATCH (n:Doc) RETURN n.t IN $xs', { xs: ['a', null] })).toContain(') THEN TRUE ELSE NULL END');
        // Where none is null, or there is none, it is false, a value that holds a null too, which is not read for it.
        for (const [cypher, xs] of [
            ['MATCH (n:Doc) RETURN n.t IN $xs', []],
            ['MATCH (n:Doc) RETURN [n.t, null] IN $xs', ['a', 5]]
        ] as [string, unknown[]][]) {
            const listed = sql(cypher, { xs });
            expect([
                cypher,
                listed.includes(') THEN TRUE ELSE FALSE END'),
                /JSON_SERIALIZE|nulls_equal/.test(listed)
            ]).toEqual([cypher, true, false]);
        }
        expect(sql('MATCH (n:Doc) RETURN [n.t, null] IN $xs', { xs: ['a', null] })).toContain(
            ') THEN TRUE ELSE NULL END'
        );
        expect(
            /JSON_SERIALIZE\(w\d+\.c1/.test(sql('MATCH (n:Doc) WITH n.t AS t RETURN t IN $xs', { xs: ['a', null] }))
        ).toBe(false);
        // A list written out that holds a null is compared item by item, each item as equality compares it: the
        // written ones, the null among them, as a given text or number is.
        const itemwise = sql("MATCH (n:Doc) RETURN n.t IN ['a', 5, null, $x]");
        expect(count(itemwise, "NVL(JSON_VALUE(n1.props, '$.t.type()'), 'null') <> 'string' THEN")).toBe(4);
        expect(itemwise).not.toContain('DBMS_LOB');
        // An empty item, or one past 4,000 bytes, isn't, and both sides are compared as texts.
        for (const xs of [
            ['a', ''],
            ['a', '€'.repeat(1_334)]
        ]) {
            const listed = sql('MATCH (n:Doc) WHERE n.t IN $xs RETURN n', { xs });
            expect([clobItem.test(listed), item.test(listed)]).toEqual([true, false]);
        }
        // The issue's: beside a value too long to write twice, which is bound, the property is bound by its own path,
        // its JSON only where it is no text past 32,767 characters, and its kind and CLOB from columns of their own.
        const beside = sql('MATCH (n:Doc), (m:Doc) WHERE n.t > toLower(trim(coalesce($p.q, m.name))) RETURN count(*)', {
            p: { q: null }
        });
        expect(beside).toContain(
            "CASE WHEN JSON_VALUE(n1.props, '$.t.length()' RETURNING NUMBER) > 32767 THEN NULL ELSE JSON_QUERY(n1.props, '$.t' RETURNING JSON) END AS v1, JSON_VALUE(n1.props, '$.t.type()') AS v2, JSON_VALUE(n1.props, '$.t' RETURNING CLOB) AS v3"
        );
        const alias = /(sh\d+)\.v3/.exec(beside)![1];
        expect(beside).toContain(
            `THEN CASE WHEN ${alias}.v2 = 'string' THEN ${texts(
                `JSON_VALUE(${alias}.v1, '$')`,
                `JSON_VALUE(${alias}.v4, '$')`,
                `${alias}.v3`,
                `JSON_VALUE(${alias}.v4, '$' RETURNING CLOB)`,
                '>'
            )} ELSE ${alias}.v1 > ${alias}.v4 END`
        );
        const inBeside = sql('MATCH (n:Doc), (m:Doc) RETURN n.t IN [toLower(trim(coalesce($p.q, m.name)))]', {
            p: { q: null }
        });
        expect(inBeside).toContain("JSON_VALUE(n1.props, '$.t' RETURNING CLOB) AS v3");
        expect(inBeside).toContain('DBMS_LOB.COMPARE(');
        // A value bound beside the list, which may be a text past 32 KB, and one a WITH passes on, which may be JSON's
        // null, are tested once too, beside the EXISTS, which compares each item with the bound name as JSON.
        const tested = (v: string): string =>
            `(JSON_VALUE(${v}, '$') IS NOT NULL OR NVL(JSON_VALUE(${v}, '$.type()'), 'null') <> 'string') AND EXISTS (`;
        const boundValue = sql(
            "MATCH (n:Doc), (m:Doc) WHERE toLower(trim(coalesce($p.q, m.name))) IN ['a', 'b'] RETURN n",
            { p: { q: null } }
        );
        const v = /WHERE i\d+\.item = (sh\d+\.v\d+)\)/.exec(boundValue)![1];
        expect(boundValue).toContain(tested(v));
        const passedIn = sql('MATCH (n:Doc) WITH n.t AS t WHERE t IN $xs RETURN t', { xs: ['a', null] });
        const w = /WHERE i\d+\.item = (w\d+\.c1)\)/.exec(passedIn)![1];
        expect(passedIn).toContain(`(${tested(w)}`);
        expect(passedIn).toContain(`AND NOT NVL(JSON_VALUE(${w}, '$.type()'), 'null') = 'null')`);
    });

    it('should compare a stored text as a text with each item of a list a subquery works out for each row', () => {
        // The list worked out in a derived table inside a lateral view (#466), and the property read by its own path.
        const filtered = sql('MATCH (n:Doc) WHERE n.t IN [(n)-->(q) | q.t] RETURN n');
        expect(/LATERAL \(SELECT i\d+_v\.list FROM \(SELECT \(SELECT/.test(filtered)).toBe(true);
        expect(clobItem.test(filtered)).toBe(true);
        expect(filtered).not.toContain('JSON_VALUE(JSON_QUERY(');
        // Beside such a list, too long to write twice and so bound, the property is bound by its own path, as beside a
        // sum.
        const returned = sql('MATCH (n:Doc), (m:Doc) RETURN n.t IN keys(m)');
        const alias = /JSON_VALUE\(n1\.props, '\$\.t' RETURNING CLOB\) AS v4\) (sh\d+)/.exec(returned)![1];
        expect(
            new RegExp(
                `DBMS_LOB\\.COMPARE\\(TO_CLOB\\(JSON_VALUE\\(i\\d+\\.item, '\\$' RETURNING CLOB\\)\\), TO_CLOB\\(${alias}\\.v4\\)\\)`
            ).test(returned)
        ).toBe(true);
    });

    it('should compare the items of a list that holds a list or a map, written or given, with a stored text as texts', () => {
        const lists: [string, Record<string, any>][] = [
            ["MATCH (n:Doc) WHERE n.t IN ['a', $m] RETURN n", { m: { k: 1 } }],
            ["MATCH (n:Doc) WHERE n.t IN ['a', ['b']] RETURN n", {}],
            ['MATCH (n:Doc) WHERE n.t IN $xs RETURN n', { xs: ['a', ['b']] }]
        ];
        for (const [cypher, parameters] of lists) {
            const listed = sql(cypher, parameters);
            expect([cypher, item.test(listed), listed.includes('DBMS_LOB.COMPARE(')]).toEqual([cypher, false, true]);
        }
    });

    it('should compare two values the statement writes as JSON, and test only the other side beside one', () => {
        // Each item of a list written out that holds a null and values of several kinds is compared with the value
        // alone: in a few hundred characters each, as before, where Oracle ran out of memory reading more (#406).
        const literals = sql("RETURN [7 IN [0, 's1', null, 3.5, true, [5, 'n'], {k: 6}], 'a' = 'a', [1] = [1, null]]");
        expect(literals).not.toContain('DBMS_LOB');
        expect(literals).not.toContain("<> 'string'");
        expect(literals).toContain(`JSON('7') = JSON_SCALAR(TO_BINARY_DOUBLE('3.5'))`);
        // Beside a written value that is no text or a short text, the other side alone is tested; beside an empty text,
        // which Oracle reads as null, or one past 4,000 bytes, both are, as texts.
        const one =
            "CASE WHEN JSON_VALUE(n1.props, '$.t') IS NOT NULL OR NVL(JSON_VALUE(n1.props, '$.t.type()'), 'null') <> 'string' THEN JSON_QUERY(n1.props, '$.t' RETURNING JSON) = ";
        for (const [written, value] of [
            ["'a'", `JSON('"a"')`],
            ['[1, 2]', 'JSON_ARRAY('],
            ['{k: 1}', 'JSON_OBJECT('],
            ['1.5', 'JSON_SCALAR(TO_BINARY_DOUBLE(']
        ]) {
            const compared = sql(`MATCH (n:Doc), (m:Doc) RETURN m.t = n.t, ${written} = n.t`);
            expect([written, compared.includes(one + value), compared.includes('DBMS_LOB')]).toEqual([
                written,
                true,
                true
            ]);
        }
        // A float worked out, unlike one written, may be SQL's null, so is compared as any other value: null beside a
        // long text, not false.
        const worked = sql('MATCH (n:Doc) RETURN toFloat(n.y) = n.t');
        expect([worked.includes(one), worked.includes('IS NULL THEN NULL WHEN')]).toEqual([false, true]);
        for (const written of ["''", `'${'x'.repeat(4_001)}'`]) {
            const compared = sql(`MATCH (n:Doc) RETURN ${written} = n.t`);
            expect([written.length, compared.includes(one), compared.includes('DBMS_LOB')]).toEqual([
                written.length,
                false,
                true
            ]);
        }
    });

    it('should compare two texts the statement makes or is given as texts, and on Postgres write a comparison as it was', () => {
        const made = sql('WITH $t AS t, $x AS x RETURN substring(t, 0, 32768) = x', { t: 'abc', x: 'a' });
        expect(made).toContain('DBMS_LOB.COMPARE(');
        expect(/THEN sh\d+\.v1 = sh\d+\.v2 END/.test(made)).toBe(false);
        const compiled = new PostgresCypherCompiler('g').compile(
            'MATCH (n:Doc), (m:Doc) WHERE n.t > m.t AND n.t = $x RETURN n.t IN [m.t, $x]',
            { x: 'abc' }
        ).sql;
        expect(compiled).not.toContain('DBMS_LOB');
        expect(compiled).not.toContain('RETURNING CLOB');
    });

    it('should compare two values as JSON, as before, in a statement that writes and in the step of a reduce, which run as PL/SQL', () => {
        // There a CLOB read from an unwound row's JSON closed the session, where the JSON is refused (ORA-40180).
        const written = sql(
            'UNWIND $items AS t MERGE (n:Doc {a: t.a}) WITH n WHERE n.t > $x AND n.t IN $xs SET n.y = 1',
            { items: [{ a: 'x' }], x: 'abc', xs: ['a'] }
        );
        expect(written).not.toContain('DBMS_LOB.COMPARE');
        expect(written).toContain("THEN JSON_QUERY(w7.c1_props, '$.t' RETURNING JSON) > CASE WHEN");
        const folded = sql("WITH ['a', 'b'] AS l RETURN reduce(acc = [], s IN l | acc + [s = $x, s < $x])");
        expect(folded).not.toContain('DBMS_LOB.COMPARE');
    });
});
