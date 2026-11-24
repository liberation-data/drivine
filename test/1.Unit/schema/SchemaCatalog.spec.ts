import {
    CaseInsensitive,
    FullTextIndex,
    GraphProperty,
    NodeFragment,
    ModelRegistry,
    NodeId,
    RangeIndex,
    rangeIndex,
    SchemaCatalog,
    Unique,
    uniquenessConstraint,
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
    it('should keep each of the schema decorators on one field (#836)', () => {
        @NodeFragment({ labels: ['TwoOnOne'] })
        class TwoOnOne {
            @NodeId() id: string;
            @RangeIndex() @Unique() email: string;
            @FullTextIndex() @RangeIndex() @Unique() handle: string;
        }
        // Each declaration is kept: a constraint beside an index is made, as drivine4j makes it.
        const items = SchemaCatalog.fromFragments(undefined, TwoOnOne).items;
        expect(items).toHaveLength(6);
        expect(items).toEqual(
            expect.arrayContaining([
                { kind: 'RANGE', label: 'TwoOnOne', properties: ['id'] },
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
        expect(items).toHaveLength(3);
        expect(items).toEqual(
            expect.arrayContaining([
                { kind: 'RANGE', label: 'BothIgnoreCase', properties: ['id'] },
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
        expect(SchemaCatalog.fromFragments(undefined, Admin).items).toHaveLength(4);
        expect(SchemaCatalog.fromFragments(undefined, Admin).items).toEqual(
            expect.arrayContaining([
                { kind: 'RANGE', label: 'Admin', properties: ['id'] },
                { kind: 'RANGE', label: 'Admin', properties: ['email'] },
                { kind: 'UNIQUE', label: 'Admin', properties: ['email'], nodeIdProperty: 'id' },
                { kind: 'RANGE', label: 'Admin', properties: ['handle'] }
            ])
        );
        // The superclass keeps its own, each of them, and its @NodeId's.
        expect(SchemaCatalog.fromFragments(undefined, Account).items).toHaveLength(5);
    });

    it("should read the class's own declarations by kind, each as written, then each field's by its name", () => {
        expect(SchemaCatalog.fromFragments(undefined, OrderedNode).items).toEqual([
            rangeIndex('Ordered', ['b', 'c']),
            rangeIndex('Ordered', ['a', 'c']),
            { kind: 'FULLTEXT', label: 'Ordered', properties: ['c'] },
            // By the field's name, alpha, as drivine4j sorts its Kotlin properties, not by the graph's, zeta.
            rangeIndex('Ordered', 'zeta'),
            rangeIndex('Ordered', 'gamma'),
            // The @NodeId's, after the indexes declared, as drivine4j gives it.
            rangeIndex('Ordered', 'id'),
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

@NodeFragment({ labels: ['Note'] })
class NoteNode {
    @NodeId() id: string;
    @RangeIndex({ properties: ['sessionId', 'createdAt'] }) sessionId: string;
}

@NodeFragment({ labels: ['Note'] })
class OtherNoteNode {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['Unindexed'], nodeIdIndex: false })
class UnindexedIdNode {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['Ticket'] })
class TicketNode {
    @NodeId() @GraphProperty('ticket_id') id: string;
}

@NodeFragment({ labels: ['Folded'] })
class FoldedIdNode {
    @NodeId() @CaseInsensitive() @RangeIndex({ ignoreCase: true }) id: string;
}

describe("SchemaCatalog.fromFragments, a fragment's @NodeId's range index (#800)", () => {
    const noteId = rangeIndex('Note', 'id');

    it('should give a @NodeId a range index under the primary label, over the property it is stored under', () => {
        const note = SchemaCatalog.fromFragments(undefined, NoteNode);
        expect(note.nodeIdIndexes).toEqual([noteId]);
        expect(note.items).toContainEqual(noteId);
        // @GraphProperty: the property the id is stored under.
        expect(SchemaCatalog.fromFragments(undefined, TicketNode).nodeIdIndexes).toEqual([
            rangeIndex('Ticket', 'ticket_id')
        ]);
        // Under the first label, of a fragment of two.
        expect(SchemaCatalog.fromFragments(undefined, OrderedNode).nodeIdIndexes).toEqual([
            rangeIndex('Ordered', 'id')
        ]);
    });

    it('should give a fragment without a @NodeId, or one that opts out, no range index for it', () => {
        expect(SchemaCatalog.fromFragments(undefined, NoIdNode).nodeIdIndexes).toEqual([]);
        const unindexed = SchemaCatalog.fromFragments(undefined, UnindexedIdNode);
        expect(unindexed.nodeIdIndexes).toEqual([]);
        expect(unindexed.items).toEqual([]);
    });

    it("should give a subclass the index unless it opts out too, as the option is the class's own", () => {
        @NodeFragment({ labels: ['UnindexedChild'] })
        class UnindexedChild extends UnindexedIdNode {}
        expect(SchemaCatalog.fromFragments(undefined, UnindexedChild).nodeIdIndexes).toEqual([
            rangeIndex('UnindexedChild', 'id')
        ]);
    });

    it('should add none beside a range index or a uniqueness constraint declared over the @NodeId alone', () => {
        // MessageNode's @NodeId is @Unique, which serves it.
        expect(SchemaCatalog.fromFragments(() => 4, MessageNode).nodeIdIndexes).toEqual([]);
        @NodeFragment({ labels: ['RangedId'] })
        class RangedId {
            @NodeId() @RangeIndex() id: string;
        }
        const ranged = SchemaCatalog.fromFragments(undefined, RangedId);
        expect([ranged.nodeIdIndexes, ranged.items]).toEqual([[], [rangeIndex('RangedId', 'id')]]);
    });

    it('should add one beside an item over more properties, or one that ignores case', () => {
        expect(SchemaCatalog.fromFragments(undefined, FoldedIdNode).nodeIdIndexes).toEqual([
            rangeIndex('Folded', 'id')
        ]);
        @NodeFragment({ labels: ['Composite'] })
        @RangeIndex({ properties: ['id', 'at'] })
        class Composite {
            @NodeId() id: string;
            at: number;
        }
        expect(SchemaCatalog.fromFragments(undefined, Composite).nodeIdIndexes).toEqual([
            rangeIndex('Composite', 'id')
        ]);
        // Nor does an index of another kind over the id alone: a lookup by it reads no full-text index.
        @NodeFragment({ labels: ['Searched'] })
        class Searched {
            @NodeId() @FullTextIndex() id: string;
        }
        expect(SchemaCatalog.fromFragments(undefined, Searched).nodeIdIndexes).toEqual([rangeIndex('Searched', 'id')]);
    });

    it('should give two fragments of one label one range index, and withoutNodeIdIndexes only what is declared', () => {
        const both = SchemaCatalog.fromFragments(undefined, NoteNode, OtherNoteNode);
        expect(both.items.filter((it) => JSON.stringify(it) === JSON.stringify(noteId))).toHaveLength(1);
        const declared = both.withoutNodeIdIndexes();
        expect(declared.nodeIdIndexes).toEqual([]);
        expect(declared.items).toEqual(both.declaredItems);
        expect(declared.items).toHaveLength(both.items.length - 1);
        expect(declared.items).not.toContainEqual(noteId);
        // The defaults survive a copy, and the copy keeps the rest.
        const copied = both.forDatabase('x').withVersion('1').named('app');
        expect(copied.nodeIdIndexes).toEqual(both.nodeIdIndexes);
        const without = copied.withoutNodeIdIndexes();
        expect([without.databases, without.version, without.name]).toEqual([['x'], '1', 'app']);
    });

    it("should leave out a default another catalog's item serves where they are applied, and keep one it doesn't", () => {
        const fragments = SchemaCatalog.fromFragments(undefined, NoteNode);
        const named = { ...rangeIndex('Note', 'id'), name: 'note_id' };
        for (const other of [
            SchemaCatalog.of(named).named('app'),
            SchemaCatalog.of(uniquenessConstraint('Note', 'id'))
        ]) {
            const beside = fragments.itemsBeside([...fragments.declaredItems, ...other.declaredItems]);
            expect(beside).not.toContainEqual(noteId);
            expect(beside).toHaveLength(fragments.items.length - 1);
        }
        const composite = SchemaCatalog.of(rangeIndex('Note', ['id', 'sessionId']));
        expect(fragments.itemsBeside([...fragments.declaredItems, ...composite.declaredItems])).toEqual(
            fragments.items
        );
        const folded = SchemaCatalog.of(rangeIndex('Note', 'id', { ignoreCase: true }));
        expect(fragments.itemsBeside([...fragments.declaredItems, ...folded.declaredItems])).toEqual(fragments.items);
        // Another catalog's own default serves nothing: two catalogs of the fragment both keep theirs, as one item.
        expect(fragments.itemsBeside([...fragments.declaredItems, ...fragments.declaredItems])).toEqual(
            fragments.items
        );
        // One declared the same is the same item, co-owned: kept, so the owner's marker doesn't call it an orphan.
        const same = SchemaCatalog.of(rangeIndex('Note', 'id')).named('app');
        expect(fragments.itemsBeside([...fragments.declaredItems, ...same.declaredItems])).toEqual(fragments.items);
    });
});
