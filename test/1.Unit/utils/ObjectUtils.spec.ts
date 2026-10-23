import { Transform } from 'class-transformer';
import { ObjectUtils } from '@/utils';
import { randomUUID } from 'crypto';
import neo4j from "neo4j-driver"

class Foobar {

}

class Urbanite {
    readonly id: string;

    readonly firstName: string;

    readonly lastName: string;

    @Transform((params) => params.value.valueOf(), { toPlainOnly: true })
    @Transform((params) => new Date(params.value), { toClassOnly: true })
    readonly dateOfBirth: Date;

    nonPrimitiveProperty: Foobar;
    citizenShipDate: Date;

    constructor(id: string, firstName: string, lastName: string, dateOfBirth: Date) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.dateOfBirth = dateOfBirth;
    }
}

describe('ObjectUtils::primitiveProps', () => {
    it('should strip the non-primitive properties from an object', () => {
        const mg = new Urbanite(randomUUID(), 'Brutus', 'Paramdal', new Date('1984-06-22'));
        mg.nonPrimitiveProperty = new Foobar();
        mg.citizenShipDate = new Date();
        const props = ObjectUtils.primitiveProps(mg);
        expect(props.id).not.toBeNull();
        expect(props.firstName).toEqual('Brutus');
        expect(props.lastName).toEqual('Paramdal');
        expect(props.dateOfBirth).toEqual(456710400000);
        expect(props.nonPrimitiveProperty).toBeUndefined();
        expect(props.citizenShipDate).toBeInstanceOf(neo4j.types.DateTime)
    });
});

describe('ObjectUtils deepCopy and deepEqual', () => {
    class Point {
        constructor(
            public x: number,
            public at?: Date
        ) {}
        norm(): number {
            return Math.abs(this.x);
        }
    }

    it('should copy deeply, keeping prototypes and copying dates', () => {
        const at = new Date(0);
        const source = { p: new Point(-2, at), list: [new Point(1)] };
        const copy = ObjectUtils.deepCopy(source);
        expect(copy).not.toBe(source);
        expect(copy.p).toBeInstanceOf(Point);
        expect(copy.p.norm()).toEqual(2);
        expect(copy.p.at).not.toBe(at);
        expect(copy.p.at!.getTime()).toEqual(0);
        copy.list[0].x = 5;
        expect(source.list[0].x).toEqual(1);
    });

    it('should copy a value met twice once', () => {
        const shared = new Point(1);
        const copy = ObjectUtils.deepCopy({ a: shared, b: shared });
        expect(copy.a).toBe(copy.b);
    });

    it('should compare data deeply', () => {
        expect(ObjectUtils.deepEqual([1, { a: new Date(5) }], [1, { a: new Date(5) }])).toBe(true);
        expect(ObjectUtils.deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
        expect(ObjectUtils.deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
        expect(ObjectUtils.deepEqual(null, undefined)).toBe(false);
    });

    it('should copy and compare sets and maps by what they hold', () => {
        const source = { labels: new Set(['Red']), byName: new Map([['a', new Point(1)]]) };
        const copy = ObjectUtils.deepCopy(source);
        expect([...copy.labels]).toEqual(['Red']);
        expect(copy.byName.get('a')).toBeInstanceOf(Point);
        expect(copy.byName.get('a')).not.toBe(source.byName.get('a'));
        expect(ObjectUtils.deepEqual(copy, source)).toBe(true);
        copy.labels.add('Green');
        expect(source.labels.has('Green')).toBe(false);
        expect(ObjectUtils.deepEqual(copy.labels, source.labels)).toBe(false);
        expect(ObjectUtils.deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
        expect(ObjectUtils.deepEqual(new Set(), [])).toBe(false);
    });
});
