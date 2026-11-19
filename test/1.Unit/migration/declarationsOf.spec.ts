import { GraphProperty, NodeFragment, NodeId } from '@liberation-data/drivine';
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

describe('declarationsOf', () => {
    it("should declare a fragment's Date and bytes fields under each of its labels, by their stored names", () => {
        expect(declarationsOf(Person)).toEqual(
            expect.arrayContaining([
                { label: 'Person', property: 'seenAt', kind: 'datetime' },
                { label: 'Author', property: 'seenAt', kind: 'datetime' },
                { label: 'Person', property: 'photo', kind: 'bytes' },
                { label: 'Author', property: 'photo', kind: 'bytes' }
            ])
        );
        expect(declarationsOf(Person)).toHaveLength(4);
    });

    it('should declare a relationship fragment under the type it is given', () => {
        expect(declarationsOf(Person, 'KNOWS').map((it) => it.label)).toEqual(['KNOWS', 'KNOWS']);
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
