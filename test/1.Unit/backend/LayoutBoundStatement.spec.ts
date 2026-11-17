import { LayoutBoundStatement } from '@/backend/oracle/LayoutBoundStatement';
import { NON_FINITE_SAVED } from '@/cypher/ValueLayout';

/**
 * An Oracle block's bound values in the store layout: a patch's `$set` and `$vectors`, and each of its `$rows`' `props`
 * and `vectors`, which the block merges into the node's properties, as a save writes them.
 */
describe('LayoutBoundStatement', () => {
    const statement = new LayoutBoundStatement('BEGIN NULL; END;');

    it("writes a patch's properties and vectors, and each row's, in the store layout", () => {
        const spec = statement.spec({
            id: 'p1',
            set: { $k: new Uint8Array([255]) },
            vectors: { e: new Float32Array([0.5]) },
            rows: [{ id: 'p2', props: { $k: 1 }, vectors: { e: new Float32Array([1]) } }]
        });
        expect(spec.parameters).toEqual({
            id: 'p1',
            set: { $$k: [-1] },
            vectors: { e: [0.5] },
            rows: [{ id: 'p2', props: { $$k: 1 }, vectors: { e: [1] } }]
        });
    });

    it('refuses NaN in a vector, before the block is run', () => {
        expect(() => statement.spec({ set: {}, vectors: { e: [NaN] } })).toThrow(NON_FINITE_SAVED);
        expect(() =>
            statement.spec({ rows: [{ id: 'p', props: {}, vectors: { e: new Float32Array([NaN]) } }] })
        ).toThrow(NON_FINITE_SAVED);
    });
});
