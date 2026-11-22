import {
    FullTextIndex,
    GraphProperty,
    NodeFragment,
    NodeId,
    RangeIndex,
    rangeIndex,
    SchemaCatalog,
    Unique,
    uniquenessConstraint,
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

@NodeFragment({ labels: ['Renamed'] })
class RenamedIdNode {
    @NodeId() @GraphProperty('node_uuid') uuid: string;
    @Unique() email: string;
}

@NodeFragment({ labels: ['NoId'] })
class NoIdNode {
    @Unique() email: string;
}

@NodeFragment({ labels: ['Ordered'] })
@RangeIndex({ properties: ['b', 'c'] })
@Unique({ properties: ['a', 'b'] })
@FullTextIndex({ properties: ['c'] })
@RangeIndex({ properties: ['a', 'c'] })
class OrderedNode {
    @NodeId() id: string;
    @RangeIndex() @GraphProperty('zeta') alpha: string;
    @Unique() beta: string;
    @RangeIndex() gamma: string;
    a: string;
    b: string;
    c: string;
}

describe('SchemaCatalog.of', () => {
    it('should give the indexes before the constraints, each in the order declared', () => {
        expect(
            SchemaCatalog.of(
                uniquenessConstraint('P', 'email'),
                rangeIndex('P', 'name'),
                uniquenessConstraint('P', 'tenant'),
                rangeIndex('P', 'age')
            ).items
        ).toEqual([
            rangeIndex('P', 'name'),
            rangeIndex('P', 'age'),
            uniquenessConstraint('P', 'email'),
            uniquenessConstraint('P', 'tenant')
        ]);
    });

    it('should keep a constraint once, the declaration with its node id, where it was first declared', () => {
        const plain = uniquenessConstraint('P', 'email');
        const withId = uniquenessConstraint('P', 'email', { nodeIdProperty: 'id' });
        expect(SchemaCatalog.of(plain, uniquenessConstraint('P', 'tenant'), withId).items).toEqual([
            withId,
            uniquenessConstraint('P', 'tenant')
        ]);
        expect(SchemaCatalog.of(withId, plain).items).toEqual([withId]);
    });

    it('should keep a spec written by hand once beside the one a builder gives', () => {
        const byHand = { label: 'P', properties: ['name'], ignoreCase: false, kind: 'RANGE' as const };
        expect(SchemaCatalog.of(rangeIndex('P', 'name'), byHand).items).toEqual([rangeIndex('P', 'name')]);
    });

    it('should keep declarations of one item that differ otherwise, for the planner to refuse', () => {
        const named = { ...rangeIndex('P', 'name'), name: 'p_name' };
        expect(SchemaCatalog.of(rangeIndex('P', 'name'), named).items).toEqual([rangeIndex('P', 'name'), named]);
        // Over the same properties in another order: drivine4j's declarations differ there too.
        expect(SchemaCatalog.of(rangeIndex('P', ['a', 'b']), rangeIndex('P', ['b', 'a'])).items).toEqual([
            rangeIndex('P', ['a', 'b']),
            rangeIndex('P', ['b', 'a'])
        ]);
    });

    it('should tell an item that ignores case from one over the property itself, by the properties it is made over', () => {
        const ci = rangeIndex('P', 'email', { ignoreCase: true });
        expect(SchemaCatalog.of(ci, rangeIndex('P', 'email'), ci).items).toEqual([ci, rangeIndex('P', 'email')]);
    });
});

describe('SchemaCatalog.fromFragments', () => {
    it("should read the class's own declarations by kind, each as written, then each field's by its name", () => {
        expect(SchemaCatalog.fromFragments(undefined, OrderedNode).items).toEqual([
            rangeIndex('Ordered', ['b', 'c']),
            rangeIndex('Ordered', ['a', 'c']),
            { kind: 'FULLTEXT', label: 'Ordered', properties: ['c'] },
            // By the field's name, alpha, as drivine4j sorts its Kotlin properties, not by the graph's, zeta.
            rangeIndex('Ordered', 'zeta'),
            rangeIndex('Ordered', 'gamma'),
            uniquenessConstraint('Ordered', ['a', 'b'], { nodeIdProperty: 'id' }),
            uniquenessConstraint('Ordered', 'beta', { nodeIdProperty: 'id' })
        ]);
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
