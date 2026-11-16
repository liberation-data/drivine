import { cypherCompilerModule, useCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { readLayout } from '@/cypher/ValueLayout';

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

    it('keeps a whole number past 2^53 and an infinity in a text the module reads', () => {
        expect(readLayout('{"$$k":[9007199254740993,9e999,-9e999,"Infinity"]}')).toEqual({
            $k: [BigInt('9007199254740993'), Infinity, -Infinity, 'Infinity']
        });
    });
});
