import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, a value in a map parameter, `$p.text`, is read with one path from the text the parameter is bound as, and
 * not from the parameter read as JSON first: Oracle crashed the session where a statement read a value from a
 * parameter past 32 KB, taken as JSON, for each of two rows (liberation-data/drivine#321). drivine4j's
 * `OracleParameterTextTest`.
 */
describe('A value in a map parameter in compiled Cypher', () => {
    const p = { p: { text: 'x', m: { b: 1 }, l: [1] }, q: { text: 'y' } };

    it('should be read on Oracle with one path from the parameter, in a read', () => {
        const sql = new OracleCypherCompiler('g').compile('RETURN [$p.text, $p.m.b, $q.text, $p.`a.b`]', p).sql;
        expect(sql).toContain(`JSON_QUERY($_cy_p, '$.text' RETURNING JSON)`);
        expect(sql).toContain(`JSON_QUERY($_cy_p, '$.m.b' RETURNING JSON)`);
        expect(sql).toContain(`JSON_QUERY($_cy_q, '$.text' RETURNING JSON)`);
        expect(sql).toContain(`JSON_QUERY($_cy_p, '$."a.b"' RETURNING JSON)`);
        expect(sql).not.toContain('JSON($_cy_');
    });

    it('should be read on Oracle with one path from the parameter, where a key is a subscript of known text', () => {
        const given = { ...p, k: 'text' };
        const sql = new OracleCypherCompiler('g').compile(
            "RETURN [$p['text'], $p['m'].b, $p.m['b'], $p[$k]]",
            given
        ).sql;
        expect(sql).toContain(`JSON_QUERY($_cy_p, '$.text' RETURNING JSON)`);
        expect(sql).toContain(`JSON_QUERY($_cy_p, '$.m.b' RETURNING JSON)`);
        expect(sql).not.toContain('JSON($_cy_p)');
        const write = new OracleCypherCompiler('g').compile("MATCH (n) SET n.b = $p['m']['b']", p).sql;
        expect(write).toContain(`JSON_QUERY(cy_params, '$.p.m.b' RETURNING JSON)`);
    });

    it('should be read on Oracle with one path up to a subscript that is a number or not known, then as it was', () => {
        const given = { p: { m: { b: 1 }, l: [{ x: 1 }] }, i: 0 };
        const sql = new OracleCypherCompiler('g').compile(
            "RETURN [$p.l[0].x, $p.l[$i], $p.m[toLower('B')]]",
            given
        ).sql;
        expect(sql).toContain(`JSON_QUERY(JSON_QUERY($_cy_p, '$.l' RETURNING JSON), '$[$i]' PASSING`);
        expect(sql).toContain(`JSON_QUERY(JSON_QUERY($_cy_p, '$.m' RETURNING JSON), '$[$i]' PASSING`);
        expect(sql).not.toContain('JSON($_cy_p)');
    });

    it('should be read on Oracle with one path from the parameters, in a write', () => {
        const sql = new OracleCypherCompiler('g').compile('MATCH (n) SET n.t = $p.text, n.b = $p.m.b', p).sql;
        expect(sql).toContain(`JSON_QUERY(cy_params, '$.p.text' RETURNING JSON)`);
        expect(sql).toContain(`JSON_QUERY(cy_params, '$.p.m.b' RETURNING JSON)`);
        expect(sql).not.toContain(`'$.p' RETURNING`);
    });

    it('should be read on Oracle with one path from the parameter, in a UNION', () => {
        const sql = new OracleCypherCompiler('g').compile('RETURN $p.text AS t UNION RETURN $p.m.b AS t', p).sql;
        expect(sql).toContain(`JSON_QUERY($_cy_p, '$.text' RETURNING JSON)`);
        expect(sql).toContain(`JSON_QUERY($_cy_p, '$.m.b' RETURNING JSON)`);
        expect(sql).not.toContain('JSON($_cy_');
    });

    it('should be read on Oracle from the parameter as JSON, as it was, past a list or a date, or in a reduce() step', () => {
        // A list or a date on the way to the key is no map to take one path into, and a reduce() step reads its
        // parameters from the map its function is given, not from the text they are bound as.
        // An instance of a class is read as it was too, as drivine4j reads one. The map before a list is still read
        // with one path.
        const given = {
            ...p,
            d: new Date(Date.UTC(2020, 0, 2)),
            b: new (class Box {
                text = 'z';
            })(),
            // A map of its own that is iterable is bound as the list of its items.
            i: {
                text: 'w',
                *[Symbol.iterator]() {
                    yield 1;
                }
            }
        };
        const sql = new OracleCypherCompiler('g').compile('RETURN [$p.l.x, $d.year, $b.text, $i.text]', given).sql;
        expect(sql).toContain(`JSON_QUERY(JSON_QUERY($_cy_p, '$.l' RETURNING JSON), '$.x' RETURNING JSON)`);
        expect(sql).toContain('EXTRACT(YEAR FROM');
        expect(sql).toContain('JSON($_cy_d)');
        expect(sql).toContain(`JSON_QUERY(JSON($_cy_b), '$.text' RETURNING JSON)`);
        expect(sql).toContain(`JSON_QUERY(JSON($_cy_i), '$.text' RETURNING JSON)`);
        const write = new OracleCypherCompiler('g').compile('MATCH (n) SET n.x = $p.l.x', p).sql;
        expect(write).toContain(`JSON_QUERY(JSON_QUERY(cy_params, '$.p.l' RETURNING JSON), '$.x' RETURNING JSON)`);
        const reduced = new OracleCypherCompiler('g').compile(
            "RETURN reduce(s = '', x IN [1, 2] | s + $p.text)",
            p
        ).sql;
        expect(reduced).toContain(
            `JSON_QUERY(JSON_QUERY(cy_context, '$."$p"' RETURNING JSON), '$.text' RETURNING JSON)`
        );
        expect(reduced).not.toContain(`JSON_QUERY($_cy_p, '$.text'`);
    });

    it('should be refused on Oracle where a key on the path is empty, in a read and in a write', () => {
        const compiler = new OracleCypherCompiler('g');
        const empty = 'A property name is empty: an empty name is no property a statement can read.';
        expect(() => compiler.compile('RETURN $p.``', p)).toThrow(empty);
        expect(() => compiler.compile('RETURN $p.m.``', p)).toThrow(empty);
        expect(() => compiler.compile('MATCH (n) SET n.b = $p.m.``', p)).toThrow(empty);
    });

    it('should be read on Postgres from the parameter as JSON, then each key, as it was', () => {
        const read = new PostgresCypherCompiler('g').compile('RETURN [$p.text, $p.m.b]', p).sql;
        expect(read).toContain(`(CAST($_cy_p AS jsonb) -> 'text'), ((CAST($_cy_p AS jsonb) -> 'm') -> 'b')`);
        // The procedure's body is declared before the statement runs.
        const write = new PostgresCypherCompiler('g').compile('MATCH (n) SET n.t = $p.text', p).setup.join('\n');
        expect(write).toContain(`(NULLIF((cy_params -> 'p'), 'null'::jsonb) -> 'text')`);
    });
});
