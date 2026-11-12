import { jsonText } from '@/utils/JsonText';

// A bigint is written as the whole number it is, where JSON.stringify refuses one (liberation-data/drivine#739).
describe('jsonText', () => {
    it('writes a bigint as its digits, at any depth', () => {
        expect(
            jsonText({
                a: BigInt('9007199254740993'),
                l: [BigInt(-1), 2.5, 'x'],
                m: { n: BigInt('-9223372036854775808') }
            })
        ).toBe('{"a":9007199254740993,"l":[-1,2.5,"x"],"m":{"n":-9223372036854775808}}');
    });

    it('writes everything else as JSON.stringify does', () => {
        const value = { s: 'a"b', n: 1.5, b: true, z: null, d: new Date(0), u: undefined };
        expect(jsonText(value)).toBe(JSON.stringify(value));
    });

    it("runs the replacer first, as JSON.stringify's would", () => {
        expect(jsonText({ u: undefined, b: BigInt(3) }, (_, it) => (it === undefined ? null : it))).toBe(
            '{"u":null,"b":3}'
        );
    });
});
