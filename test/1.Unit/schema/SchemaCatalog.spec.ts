import {
    CaseInsensitive,
    FullTextIndex,
    GraphProperty,
    NodeFragment,
    ModelRegistry,
    NodeId,
    RangeIndex,
    SchemaCatalog,
    Unique,
    VectorIndex
} from '@liberation-data/drivine';
import { propertyMetadata } from '@/annotation/Metadata';

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

@NodeFragment({ labels: ['Renamed'] })
class RenamedIdNode {
    @NodeId() @GraphProperty('node_uuid') uuid: string;
    @Unique() email: string;
}

@NodeFragment({ labels: ['NoId'] })
class NoIdNode {
    @Unique() email: string;
}

describe('SchemaCatalog.fromFragments', () => {
    it('should keep each of the schema decorators on one field (#836)', () => {
        @NodeFragment({ labels: ['TwoOnOne'] })
        class TwoOnOne {
            @NodeId() id: string;
            @RangeIndex() @Unique() email: string;
            @FullTextIndex() @RangeIndex() @Unique() handle: string;
        }
        // Each declaration is kept: a constraint beside an index is made, as drivine4j makes it.
        const items = SchemaCatalog.fromFragments(undefined, TwoOnOne).items;
        expect(items).toHaveLength(5);
        expect(items).toEqual(
            expect.arrayContaining([
                { kind: 'RANGE', label: 'TwoOnOne', properties: ['email'] },
                { kind: 'UNIQUE', label: 'TwoOnOne', properties: ['email'], nodeIdProperty: 'id' },
                { kind: 'FULLTEXT', label: 'TwoOnOne', properties: ['handle'] },
                { kind: 'RANGE', label: 'TwoOnOne', properties: ['handle'] },
                { kind: 'UNIQUE', label: 'TwoOnOne', properties: ['handle'], nodeIdProperty: 'id' }
            ])
        );
    });

    it("should keep a field's declarations in the order written, as drivine4j reads a property's (#836)", () => {
        @NodeFragment({ labels: ['WrittenOrder'] })
        class WrittenOrder {
            @NodeId() id: string;
            @FullTextIndex() @RangeIndex() @Unique() handle: string;
        }
        expect(
            propertyMetadata(WrittenOrder)
                .get('handle')
                ?.schema?.map((it) => it.kind)
        ).toEqual(['FULLTEXT', 'RANGE', 'UNIQUE']);
    });

    it('should keep a vector index beside a range index on one field, and its similarity (#836)', () => {
        @NodeFragment({ labels: ['VectorBeside'] })
        class VectorBeside {
            @NodeId() id: string;
            @RangeIndex() @VectorIndex({ similarity: 'EUCLIDEAN', dimensions: 4 }) embedding: number[];
        }
        expect(SchemaCatalog.fromFragments(undefined, VectorBeside).items).toEqual(
            expect.arrayContaining([
                { kind: 'RANGE', label: 'VectorBeside', properties: ['embedding'] },
                expect.objectContaining({ kind: 'VECTOR', properties: ['embedding'], similarity: 'EUCLIDEAN' })
            ])
        );
        expect(new ModelRegistry().fragment(VectorBeside).vectorFields.get('embedding')).toEqual({
            property: 'embedding',
            similarity: 'EUCLIDEAN'
        });
    });

    it('should keep both of the declarations that ignore case on a @CaseInsensitive field (#836)', () => {
        @NodeFragment({ labels: ['BothIgnoreCase'] })
        class BothIgnoreCase {
            @NodeId() id: string;
            @CaseInsensitive() @RangeIndex({ ignoreCase: true }) @Unique({ ignoreCase: true }) email: string;
        }
        const items = SchemaCatalog.fromFragments(undefined, BothIgnoreCase).items;
        expect(items).toHaveLength(2);
        expect(items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: 'RANGE', properties: ['email'], ignoreCase: true }),
                expect.objectContaining({ kind: 'UNIQUE', properties: ['email'], ignoreCase: true })
            ])
        );
    });

    it("should keep a subclass's declarations on a field, in place of its superclass's (#836)", () => {
        @NodeFragment({ labels: ['Account'] })
        class Account {
            @NodeId() id: string;
            @FullTextIndex() @Unique() email: string;
            @RangeIndex() @Unique() handle: string;
        }
        @NodeFragment({ labels: ['Admin'] })
        class Admin extends Account {
            @RangeIndex() @Unique() declare email: string;
            @RangeIndex() declare handle: string;
        }
        expect(SchemaCatalog.fromFragments(undefined, Admin).items).toHaveLength(3);
        expect(SchemaCatalog.fromFragments(undefined, Admin).items).toEqual(
            expect.arrayContaining([
                { kind: 'RANGE', label: 'Admin', properties: ['email'] },
                { kind: 'UNIQUE', label: 'Admin', properties: ['email'], nodeIdProperty: 'id' },
                { kind: 'RANGE', label: 'Admin', properties: ['handle'] }
            ])
        );
        // The superclass keeps its own, each of them.
        expect(SchemaCatalog.fromFragments(undefined, Account).items).toHaveLength(4);
    });

    it('should read field and class declarations, over the first label and graph names', () => {
        const catalog = SchemaCatalog.fromFragments(
            (label, property) => (label === 'Message' && property === 'embedding' ? 1536 : 0),
            MessageNode
        );
        expect(catalog.items).toEqual(
            expect.arrayContaining([
                { kind: 'UNIQUE', label: 'Message', properties: ['id'], nodeIdProperty: 'id' },
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
                { kind: 'UNIQUE', label: 'Message', properties: ['sessionId', 'sequence'], nodeIdProperty: 'id' }
            ])
        );
        expect(catalog.items.length).toEqual(6);
    });

    it("should name a constraint's nodes by the fragment's @NodeId, as it is stored", () => {
        const unique = (type: Function) =>
            SchemaCatalog.fromFragments(undefined, type as any).items.find((it) => it.kind === 'UNIQUE');
        expect(unique(RenamedIdNode)).toEqual({
            kind: 'UNIQUE',
            label: 'Renamed',
            properties: ['email'],
            nodeIdProperty: 'node_uuid'
        });
        expect(unique(NoIdNode)).toEqual({ kind: 'UNIQUE', label: 'NoId', properties: ['email'] });
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
