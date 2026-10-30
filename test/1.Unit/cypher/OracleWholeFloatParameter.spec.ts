import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * A whole JavaScript number past a whole number's range, such as 1e20, given as a parameter, is a float, as the Neo4j
 * driver sends it: Oracle binds it as its extended JSON writes a double, and reads that text as extended JSON, where it
 * read JSON's `1e+20` as a whole number (liberation-data/drivine#378).
 */
describe('A whole number parameter past 2^63 in compiled Cypher', () => {
    it('should be bound on Oracle as extended JSON, and read so, in a read', () => {
        const compiled = new OracleCypherCompiler('g').compile('RETURN [toString($x), $y, $m.a]', {
            x: 1e20,
            y: 1,
            m: { a: -1e20, b: 'b' }
        });
        expect(compiled.parameters).toEqual({
            _cy_x: '{"$numberDouble":"1.0E20"}',
            _cy_y: '1',
            _cy_m: '{"a":{"$numberDouble":"-1.0E20"},"b":"b"}'
        });
        expect(compiled.sql).toContain('JSON($_cy_x EXTENDED)');
        expect(compiled.sql).toContain('JSON($_cy_y)');
        expect(compiled.sql).toContain(`JSON(JSON_QUERY($_cy_m, '$.a' RETURNING CLOB) EXTENDED)`);
    });

    it('should be bound on Oracle as extended JSON in its own entry of the parameters, in a write', () => {
        const compiled = new OracleCypherCompiler('g').compile('CREATE (n:N {x: $x, y: $y, a: $m.a, k: $k.a})', {
            x: 1e20,
            y: 1,
            m: { a: [1e20] },
            k: { $k: 1, a: 1e20 }
        });
        // The parameter with a map keyed as extended JSON's are is written as JSON is, and the others as before.
        expect(compiled.parameters).toEqual({
            _cy_params:
                '{"x":{"$numberDouble":"1.0E20"},"y":1,"m":{"a":[{"$numberDouble":"1.0E20"}]},"k":{"$k":1,"a":100000000000000000000}}'
        });
        expect(compiled.sql).toContain(`JSON(JSON_QUERY(cy_params, '$.x' RETURNING CLOB) EXTENDED)`);
        expect(compiled.sql).toContain(`JSON_QUERY(cy_params, '$.y' RETURNING JSON)`);
        expect(compiled.sql).toContain(`JSON(JSON_QUERY(cy_params, '$.m.a' RETURNING CLOB) EXTENDED)`);
        expect(compiled.sql).toContain(`JSON_QUERY(cy_params, '$.k.a' RETURNING JSON)`);
    });

    it('should be bound on Oracle as JSON where the parameter holds a map keyed as extended JSON is', () => {
        const compiled = new OracleCypherCompiler('g').compile('RETURN $m', { m: { $numberDouble: '2', x: 1e20 } });
        expect(compiled.parameters).toEqual({ _cy_m: '{"$numberDouble":"2","x":100000000000000000000}' });
        expect(compiled.sql).toContain('JSON($_cy_m)');
        expect(compiled.sql).not.toContain('EXTENDED');
    });

    it('should be bound on Postgres in full with a fraction, as it was', () => {
        const compiled = new PostgresCypherCompiler('g').compile('RETURN $x', { x: 1e20 });
        expect(compiled.parameters).toEqual({ _cy_x: '100000000000000000000.0' });
        const write = new PostgresCypherCompiler('g').compile('CREATE (n:N {x: $x, k: $k})', { x: 1e20, k: { $k: 1 } });
        expect(write.parameters).toEqual({ _cy_params: '{"x":100000000000000000000.0,"k":{"$k":1}}' });
    });
});
