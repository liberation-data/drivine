import {
    ModelRegistry,
    NodeFragment,
    NodeId,
    OracleBackend,
    OracleGraph,
    TargetModel,
    VectorIndex
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['SizedNote'] })
class SizedNote {
    @NodeId() id: string;
    @VectorIndex({ dimensions: 3 }) embedding?: number[];
}

const EMBEDDING = `TO_VECTOR(JSON_SERIALIZE(JSON_QUERY(c.props, '$."embedding"')))`;

describe('OracleSearch', () => {
    const backend = new OracleBackend(new OracleGraph());
    const note: TargetModel = { kind: 'NODE_FRAGMENT', model: new ModelRegistry().fragment(SizedNote) };
    const search = { label: 'SizedNote', property: 'embedding', similarity: 'COSINE' as const, k: 5 };

    it("should measure only the embeddings of the vector's size, which Oracle refuses to measure against another", () => {
        const sql = backend.nearest(note, { ...search, dimensions: 3 }).text;
        expect(sql).toContain(
            `AND JSON_EXISTS(c.props, '$."embedding"') AND VECTOR_DIMENSION_COUNT(${EMBEDDING}) = 3 ORDER BY`
        );
        expect(backend.nearest(note, search).text).not.toContain('VECTOR_DIMENSION_COUNT');
    });

    it("should look for a vector index made for embeddings of the vector's size only", () => {
        const sized = backend.vectorIndexTable('SizedNote', 'embedding', 3);
        expect(sized.text).toMatch(/ AND JSON_VALUE\(details, '\$\.dimensions' RETURNING NUMBER\) = \$dimensions$/);
        expect(sized.bindings).toEqual(expect.objectContaining({ dimensions: 3 }));
        // A vector index looked for without a size is any made.
        const any = backend.vectorIndexTable('SizedNote', 'embedding');
        expect(any.text).not.toContain('dimensions');
        expect(any.bindings).not.toHaveProperty('dimensions');
    });
});
