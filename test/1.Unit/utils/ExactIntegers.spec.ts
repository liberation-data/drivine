import { parseExactIntegers } from '@/utils/ExactIntegers';
import { readNonFiniteJson } from '@/connection/postgres/PostgresNonFinite';

/** JSON read with each whole number past 2^53, within a long's range, a bigint of its digits (liberation-data/drivine#735). */
describe('parseExactIntegers', () => {
    it.each([
        // 2^53 itself, which 2^53 + 1 reads as, so a number can't say which it was.
        ['9007199254740992', BigInt('9007199254740992')],
        ['-9007199254740992', BigInt('-9007199254740992')],
        ['9007199254740993', BigInt('9007199254740993')],
        ['-9007199254740993', BigInt('-9007199254740993')],
        ['9223372036854775807', BigInt('9223372036854775807')],
        ['-9223372036854775808', BigInt('-9223372036854775808')]
    ])('should read %s as a bigint of its digits', (text, whole) => {
        expect(parseExactIntegers(text)).toBe(whole);
    });

    it.each([
        '9007199254740991',
        '-9007199254740991',
        '0',
        '-0',
        '2.5',
        // Past a long's range, a whole number is a float, as Cypher holds it.
        '9223372036854775808',
        '-9223372036854775809',
        // A fraction or an exponent makes it a float, whatever its value.
        '9007199254740993.0',
        '9.007199254740993e15',
        '1e20'
    ])('should read %s as JSON.parse does', (text) => {
        expect(parseExactIntegers(text)).toBe(JSON.parse(text));
    });

    it('should read them at any depth, and leave a string of digits a string', () => {
        expect(parseExactIntegers('{"a": [1, {"b": 9007199254740993}], "c": "9007199254740993"}')).toEqual({
            a: [1, { b: BigInt('9007199254740993') }],
            c: '9007199254740993'
        });
    });

    it.each([
        ['a string of 16 digits', '{"c": "9007199254740993", "d": "12345678901234567890"}'],
        ["a float's 16 digits", '[0.12345678901234567, 1234567890123456.5, 1.2345678901234567e300]']
    ])('should read %s, with no whole number past 2^53, as JSON.parse does', (_what, text) => {
        expect(parseExactIntegers(text)).toEqual(JSON.parse(text));
    });

    it('should read a text with no run of 16 digits by JSON.parse alone, with no reviver to call', () => {
        const parse = jest.spyOn(JSON, 'parse');
        try {
            const text = '{"a": [1, 900719925474099, -2.5e15, "123456789012345"], "b": null}';
            expect(parseExactIntegers(text)).toEqual({ a: [1, 900719925474099, -2.5e15, '123456789012345'], b: null });
            expect(parse.mock.calls).toEqual([[text]]);
        } finally {
            parse.mockRestore();
        }
    });

    it("should read them beside Postgres's stand-ins for NaN, in a statement given one", () => {
        expect(readNonFiniteJson(`[9007199254740993, 2${'0'.repeat(309)}.5]`)).toEqual([
            BigInt('9007199254740993'),
            NaN
        ]);
    });
});
