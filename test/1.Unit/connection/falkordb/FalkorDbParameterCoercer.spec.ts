import { FalkorDbParameterCoercer, toFixedWidthIso } from '@/connection/falkordb/FalkorDbParameterCoercer';

describe('FalkorDbParameterCoercer', () => {
    const coercer = new FalkorDbParameterCoercer();

    it('should write a Date with nine digits of its second', () => {
        expect(coercer.coerce({ at: new Date('2040-01-01T00:00:00Z') })).toEqual({
            at: '2040-01-01T00:00:00.000000000Z'
        });
        expect(toFixedWidthIso(new Date('2040-01-01T00:00:00.5Z'))).toEqual('2040-01-01T00:00:00.500000000Z');
    });

    it('should write times that sort as text in the order they sort as time', () => {
        const times = ['2040-01-01T00:00:00.5Z', '2040-01-01T00:00:00Z', '2040-01-01T00:00:01Z'].map(
            (it) => coercer.coerce({ t: new Date(it) }).t
        );
        expect([...times].sort()).toEqual([times[1], times[0], times[2]]);
    });

    it('should write a Set as a list, and undefined as null, all the way down', () => {
        expect(coercer.coerce({ a: new Set([1, 2]), b: undefined, c: { d: [new Set(['x']), undefined] } })).toEqual({
            a: [1, 2],
            b: null,
            c: { d: [['x'], null] }
        });
    });

    it('should pass strings, numbers and booleans through', () => {
        expect(coercer.coerce({ s: `it's "q"`, n: 1.5, b: false })).toEqual({ s: `it's "q"`, n: 1.5, b: false });
    });

    it('should refuse a map key that is not a plain name, at any depth', () => {
        expect(() => coercer.coerce({ m: { 'first-name': 'x' } })).toThrow(/map key 'first-name'/);
        expect(() => coercer.coerce({ m: [{ 'a:1}) MATCH (n) DETACH DELETE n //': 1 }] })).toThrow(/map key/);
    });

    it('should refuse a parameter name that is not a plain name', () => {
        expect(() => coercer.coerce({ '1st': 1 })).toThrow(/parameter name '1st'/);
    });

    it('should refuse a number that is not finite', () => {
        expect(() => coercer.coerce({ n: NaN })).toThrow(/NaN/);
        expect(() => coercer.coerce({ n: Infinity })).toThrow(/Infinity/);
    });
});
