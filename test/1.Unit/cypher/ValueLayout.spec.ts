import { cypherCompilerModule, useCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { readLayout, readLayoutAfter } from '@/cypher/ValueLayout';

/**
 * A column read in the store layout (readLayout): the module is asked of every text that holds `"$` or `$`, and
 * of no other, so a text that looks like the layout but isn't costs a call and is read right, and a text with nothing of
 * the layout in it is parsed as it is. The module's ValueLayoutTest pins that every tag and escaped key holds `"$`.
 */
describe('readLayout', () => {
    const module = cypherCompilerModule();
    let asked: string[];

    beforeEach(() => {
        asked = [];
        useCypherCompiler({
            ...module,
            compile: (request: string) => {
                asked.push(request);
                return module.compile(request);
            }
        });
    });

    afterAll(() => useCypherCompiler(module));

    it('parses a text with nothing of the layout in it as it is, asking the module nothing', () => {
        expect(readLayout('{"t":"date","v":"2024-01-01","n":9007199254740993,"l":[1.5,"x"]}')).toEqual({
            t: 'date',
            v: '2024-01-01',
            n: BigInt('9007199254740993'),
            l: [1.5, 'x']
        });
        expect(readLayout('"a$b"')).toEqual('a$b');
        expect(asked).toEqual([]);
    });

    it('asks the module of every text that holds a dollar after a quote, a tag or not', () => {
        expect(readLayout('{"d":{"$t":"date","v":"2024-01-01","s":"10000020240101"},"$$k":1}')).toEqual({
            d: '2024-01-01',
            $k: 1
        });
        // A text value that begins with a dollar is neither a tag nor a key: a call, and the value as it is.
        expect(readLayout('["$5",{"a":"$b"}]')).toEqual(['$5', { a: '$b' }]);
        expect(asked).toHaveLength(2);
    });

    it('asks the module of a text that holds a dollar escaped, which reads as one', () => {
        expect(readLayout('{"\\u0024\\u0024k":{"\\u0024t":"date","v":"2024-01-01"}}')).toEqual({ $k: '2024-01-01' });
        expect(asked).toHaveLength(1);
    });

    it("reads a store's own spelling of a float on the column as the store wrote it, before the layout", () => {
        // Oracle's floats and SQLite's NaN, a map whose key has one $; the user's map with that key is held as $$.
        const floats = (value: any): any =>
            value !== null && typeof value === 'object' && !Array.isArray(value) && '$numberDouble' in value
                ? Number(value.$numberDouble)
                : Array.isArray(value)
                ? value.map(floats)
                : value;
        expect(
            readLayoutAfter(
                '[{"$numberDouble":10000000000000000},{"$numberDouble":"NaN"},{"$$numberDouble":"NaN"}]',
                floats
            )
        ).toEqual([1e16, NaN, { $numberDouble: 'NaN' }]);
        expect(readLayoutAfter('[{"$numberDouble":2.5},9007199254740993]', floats)).toEqual([
            2.5,
            BigInt('9007199254740993')
        ]);
    });

    it('keeps a whole number past 2^53 and an infinity in a text the module reads', () => {
        expect(readLayout('{"$$k":[9007199254740993,9e999,-9e999,"Infinity"]}')).toEqual({
            $k: [BigInt('9007199254740993'), Infinity, -Infinity, 'Infinity']
        });
    });
});
