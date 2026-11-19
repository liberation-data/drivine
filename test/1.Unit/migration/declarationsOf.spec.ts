import {
    GraphProperty,
    GraphTransient,
    JsonPacked,
    NodeFragment,
    NodeId,
    RelationshipFragment,
    TargetNode
} from '@liberation-data/drivine';
import { declarationsOf } from '@/migration/StoreLayoutMigration';

@NodeFragment({ labels: ['Person', 'Author'] })
class Person {
    @NodeId() name: string;
    @GraphProperty('seenAt') seen: Date;
    @GraphProperty('photo') photo: Uint8Array;
    @GraphProperty('visits') visits: number;
}

@NodeFragment({ labels: ['Employee'] })
class Employee extends Person {
    @GraphProperty('hiredAt') hired: Date;
}

@NodeFragment({ labels: ['Bytes'] })
class Bytes {
    @NodeId() id: string;
    @GraphProperty('raw') raw: Uint8Array;
    @GraphProperty('buffer') buffer: Buffer;
}

@NodeFragment({ labels: ['Shaped'] })
class Shaped {
    @NodeId() id: string;
    @JsonPacked() packed: Date;
    @GraphTransient() transient: Date;
    opened = new Date(0);
}

@RelationshipFragment()
class Knows {
    @TargetNode() person: Person;
    @GraphProperty('metAt') met: Date;
}

describe('declarationsOf', () => {
    it("should declare a fragment's Date fields under each of its labels, by their stored names", () => {
        expect(declarationsOf(Person)).toEqual([
            { label: 'Person', property: 'seenAt', kind: 'datetime' },
            { label: 'Author', property: 'seenAt', kind: 'datetime' }
        ]);
    });

    it('should declare no bytes, as layout 1 saved them as JSON.stringify writes them, which the migration reads as no bytes', () => {
        // A Uint8Array as an object of its indexes, a Buffer as {type: 'Buffer', data}: see the store's test of it.
        expect(declarationsOf(Person).filter((it) => it.property === 'photo')).toEqual([]);
        expect(declarationsOf(Bytes)).toEqual([]);
    });

    it('should declare a relationship fragment under the type it is given', () => {
        expect(declarationsOf(Knows, 'KNOWS')).toEqual([{ label: 'KNOWS', property: 'metAt', kind: 'datetime' }]);
    });

    it('should declare each field the object manager knows is a Date, and none layout 1 saved as no datetime or never saved', () => {
        // @JsonPacked saved a Date as JSON text, '"2024-…Z"', which the migration reads as no datetime: see the store's test.
        expect(declarationsOf(Shaped)).toEqual([{ label: 'Shaped', property: 'opened', kind: 'datetime' }]);
    });

    it('should declare a subclass under its own labels and those it inherits, with the fields it inherits', () => {
        const declared = declarationsOf(Employee);
        expect(new Set(declared.map((it) => it.label))).toEqual(new Set(['Employee', 'Person', 'Author']));
        expect(declared).toEqual(
            expect.arrayContaining([
                { label: 'Employee', property: 'hiredAt', kind: 'datetime' },
                { label: 'Author', property: 'seenAt', kind: 'datetime' }
            ])
        );
    });
});
