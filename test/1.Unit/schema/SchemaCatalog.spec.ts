import {
    FullTextIndex,
    GraphProperty,
    NodeFragment,
    NodeId,
    RangeIndex,
    SchemaCatalog,
    Unique,
    VectorIndex
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Message', 'Mapped'] })
@RangeIndex({ properties: ['sessionId', 'createdAt'] })
@Unique({ properties: ['sessionId', 'sequence'] })
class MessageNode {
    @NodeId() @Unique() id: string;
    @RangeIndex() @GraphProperty('context_id') contextId: string;
    @VectorIndex({ similarity: 'EUCLIDEAN' }) embedding: number[];
    @FullTextIndex() body: string;
    sessionId: string;
    createdAt: number;
    sequence: number;
}

@NodeFragment({ labels: ['Sized'] })
class SizedNode {
    @NodeId() id: string;
    @VectorIndex({ dimensions: 8 }) embedding: number[];
}

describe('SchemaCatalog.fromFragments', () => {
    it('should read field and class declarations, over the first label and graph names', () => {
        const catalog = SchemaCatalog.fromFragments(
            (label, property) => (label === 'Message' && property === 'embedding' ? 1536 : 0),
            MessageNode
        );
        expect(catalog.items).toEqual(
            expect.arrayContaining([
                { kind: 'UNIQUE', label: 'Message', properties: ['id'] },
                { kind: 'RANGE', label: 'Message', properties: ['context_id'] },
                {
                    kind: 'VECTOR',
                    label: 'Message',
                    properties: ['embedding'],
                    dimensions: 1536,
                    similarity: 'EUCLIDEAN'
                },
                { kind: 'FULLTEXT', label: 'Message', properties: ['body'] },
                { kind: 'RANGE', label: 'Message', properties: ['sessionId', 'createdAt'] },
                { kind: 'UNIQUE', label: 'Message', properties: ['sessionId', 'sequence'] }
            ])
        );
        expect(catalog.items.length).toEqual(6);
    });

    it('should take dimensions from the decorator, and refuse a vector index without any', () => {
        expect(SchemaCatalog.fromFragments(undefined, SizedNode).items[0]).toEqual(
            expect.objectContaining({ kind: 'VECTOR', dimensions: 8 })
        );
        expect(() => SchemaCatalog.fromFragments(undefined, MessageNode)).toThrow(/needs its dimensions/);
    });

    it('should carry version and targets, immutably', () => {
        const base = SchemaCatalog.of();
        const versioned = base.withVersion('model-2').forDatabases('a', 'b');
        expect([base.version, base.databases]).toEqual([undefined, undefined]);
        expect([versioned.version, versioned.databases]).toEqual(['model-2', ['a', 'b']]);
    });
});
