import { LayoutBoundStatement } from '@/backend/oracle/LayoutBoundStatement';
import { cypherFloat } from '@/cypher/CypherFloat';

/**
 * An Oracle block's bound values in the store layout: a patch's `$set`, `$vectors` and `$id`, and its `$rows`, each
 * `{id, props, vectors}`, which the block merges into the node's properties, written as a save writes them on Oracle
 * (drivine-cypher-spec#329): each float extended JSON's double, which the block reads `JSON(… EXTENDED)`.
 */
describe('LayoutBoundStatement', () => {
    const statement = new LayoutBoundStatement('BEGIN NULL; END;');

    it("writes a patch's properties, vectors and id, and each row, as Oracle's layout holds them", () => {
        const spec = statement.spec({
            id: 4.5,
            set: { $k: new Uint8Array([255]), gone: undefined },
            vectors: { e: new Float32Array([0.5]) },
            rows: [{ id: 'p2', props: { $k: 1, f: cypherFloat(2) }, vectors: { e: new Float32Array([1]) } }]
        });
        expect(spec.parameters).toEqual({
            id: '{"$numberDouble":"4.5"}',
            set: '{"$$k":[-1],"gone":null}',
            vectors: '{"e":[{"$numberDouble":"0.5"}]}',
            rows: '[{"id":"p2","props":{"$$k":1,"f":{"$numberDouble":"2.0"}},"vectors":{"e":[{"$numberDouble":"1.0"}]}}]'
        });
    });

    it('writes NaN and the infinities as doubles, which Oracle holds', () => {
        const spec = statement.spec({ set: { x: NaN }, vectors: { e: [Infinity, -Infinity] } });
        expect(spec.parameters).toMatchObject({
            set: '{"x":{"$numberDouble":"NaN"}}',
            vectors: '{"e":[{"$numberDouble":"Infinity"},{"$numberDouble":"-Infinity"}]}'
        });
    });
});
