import { cypherCompilerModule, useCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { CypherFloat } from '@/cypher/CypherFloat';
import { heldKey, NON_FINITE_SAVED, readLayout, readLayoutAfter, writeLayout, writeProps } from '@/cypher/ValueLayout';

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

    it("keeps a text that begins as a float's stand-in does the text it is, as SQLite's JSON can hold a NUL", () => {
        const texts = ['\u0000drivine:float:5', '\u0000drivine:text:x', '\u0000other'];
        expect(readLayoutAfter(JSON.stringify([...texts, { $$k: NaN }]), (value) => value)).toEqual([
            ...texts,
            { $k: null }
        ]);
    });

    it('keeps a whole number past 2^53 and an infinity in a text the module reads', () => {
        expect(readLayout('{"$$k":[9007199254740993,9e999,-9e999,"Infinity"]}')).toEqual({
            $k: [BigInt('9007199254740993'), Infinity, -Infinity, 'Infinity']
        });
    });
});

/**
 * A value a save writes, in the store layout (writeLayout): the module is asked only of a value that holds a `Date` or a
 * map key that begins with `$`, at any depth, in a list or a set too, and each such key is held with one more `$`.
 */
describe('writeLayout', () => {
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

    it('holds a value with no date and no key that begins with $ as it is, bytes as a list, asking the module nothing', () => {
        // Bytes are the list of their signed values (drivine-cypher-spec#329), with no call.
        expect(writeLayout({ a: [1, 'b$', { c: '$d' }], e: new Uint8Array([1]) })).toEqual({
            a: [1, 'b$', { c: '$d' }],
            e: [1]
        });
        expect(asked).toEqual([]);
    });

    it('escapes each key that begins with $ and tags each date, at any depth, a set read as a list', () => {
        expect(writeLayout({ a: { $b: [{ $c: 1 }] }, s: new Set([new Date(0)]) })).toEqual({
            a: { $$b: [{ $$c: 1 }] },
            s: [{ $t: 'datetime', v: '1970-01-01T00:00:00Z', s: expect.any(String) }]
        });
        expect(asked).toHaveLength(1);
    });

    it("writes a save's properties, an undefined one as null, and a property's name as the layout holds it", () => {
        expect(writeProps({ $k: 1, gone: undefined })).toEqual({ $$k: 1, gone: null });
        expect([heldKey('$k'), heldKey('$$k'), heldKey('k$')]).toEqual(['$$k', '$$$k', 'k$']);
    });
});

/** What a save writes of bytes, NaN and the infinities until the module's write holds each store's (drivine-cypher-spec#329). */
describe('writeLayout of bytes and numbers JSON has no text of', () => {
    it('writes bytes as the list of their signed values, as drivine4j and Neo4j hold them, beside a Date or not', () => {
        expect(writeLayout({ b: new Uint8Array([1, 2, 255]) })).toEqual({ b: [1, 2, -1] });
        expect(writeLayout({ b: Buffer.from([1, 2, 255]), l: [new Int8Array([-1])] })).toEqual({
            b: [1, 2, -1],
            l: [[-1]]
        });
        const dated = writeLayout({ b: new Uint8Array([255]), d: new Date('2024-01-01T00:00:00Z') });
        expect(dated.b).toEqual([-1]);
        expect(dated.d.$t).toEqual('datetime');
    });

    it('refuses NaN and the infinities by name at any depth, beside a Date or not, and writes no null', () => {
        for (const value of [NaN, Infinity, -Infinity]) {
            expect(() => writeLayout({ x: value })).toThrow(NON_FINITE_SAVED);
            expect(() => writeProps({ x: [1, { y: value }] })).toThrow(NON_FINITE_SAVED);
            expect(() => writeLayout({ x: value, d: new Date('2024-01-01T00:00:00Z') })).toThrow(NON_FINITE_SAVED);
            expect(() => writeLayout({ x: new CypherFloat(value) })).toThrow(NON_FINITE_SAVED);
        }
        expect(writeLayout({ x: 1.5, y: new CypherFloat(2) })).toEqual({ x: 1.5, y: new CypherFloat(2) });
    });
});
