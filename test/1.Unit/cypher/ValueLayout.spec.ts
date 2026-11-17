import { cypherCompilerModule, useCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { CypherFloat } from '@/cypher/CypherFloat';
import { jsonText } from '@/utils/JsonText';
import { parseExactIntegers } from '@/utils/ExactIntegers';
import { int } from 'neo4j-driver';
import { heldKey, readLayout, readLayoutAfter, readLayoutOf, writeLayout, writeProps } from '@/cypher/ValueLayout';

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
        // -0 as it is read where the module isn't asked, which JSON would write 0.
        expect(Object.is(readLayoutAfter('[{"$numberDouble":-0.0},{"$$k":1}]', floats)[0], -0)).toBe(true);
    });

    it("keeps a text that begins as a float's stand-in does the text it is, as SQLite's JSON can hold a NUL", () => {
        const texts = ['\u0000drivine:float:5', '\u0000drivine:text:x', '\u0000other'];
        expect(readLayoutAfter(JSON.stringify([...texts, { $$k: NaN }]), (value) => value)).toEqual([
            ...texts,
            { $k: null }
        ]);
    });

    it('reads a value a driver parsed already through the module only where a key in it begins with $', () => {
        const parsed = { a: ['$5', { b: 1.5 }], c: '"$d' };
        expect(readLayoutOf(parsed)).toBe(parsed);
        expect(asked).toEqual([]);
        const read = readLayoutOf([{ $$k: { $t: 'date', v: '2024-01-01', s: '10000020240101' } }, -0, NaN, 1e16]);
        expect(read).toEqual([{ $k: '2024-01-01' }, -0, NaN, 1e16]);
        expect(Object.is(read[1], -0)).toBe(true);
        expect(asked).toHaveLength(1);
    });

    it('keeps a whole number past 2^53 and an infinity in a text the module reads', () => {
        expect(readLayout('{"$$k":[9007199254740993,9e999,-9e999,"Infinity"]}')).toEqual({
            $k: [BigInt('9007199254740993'), Infinity, -Infinity, 'Infinity']
        });
    });
});

/**
 * A value a save writes, as each store's layout holds it, as JSON text (writeLayout): the module's write for the store
 * (drivine-cypher-spec#329), asked only of a value that holds a `Date`, a map key that begins with `$`, bytes, a
 * `CypherFloat` or a number that isn't a whole one in a long's range, at any depth, in a list or a set too.
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

    const STORES = ['postgres', 'oracle', 'sqlite'] as const;

    it('holds a value of no float, date, bytes or key that begins with $ as its JSON text on every store, asking nothing', () => {
        for (const store of STORES) {
            expect(
                writeLayout({ a: [1, 'b$', { c: '$d' }], n: -7, big: BigInt('9223372036854775808') }, store)
            ).toEqual('{"a":[1,"b$",{"c":"$d"}],"n":-7,"big":9223372036854775808}');
        }
        expect(asked).toEqual([]);
    });

    it('escapes each key that begins with $ and tags each date, at any depth, a set read as a list', () => {
        const written = JSON.parse(writeLayout({ a: { $b: [{ $c: 1 }] }, s: new Set([new Date(0)]) }, 'postgres'));
        expect(written).toEqual({
            a: { $$b: [{ $$c: 1 }] },
            s: [{ $t: 'datetime', v: '1970-01-01T00:00:00Z', s: expect.any(String) }]
        });
        expect(asked).toHaveLength(1);
        expect(JSON.parse(asked[0])).toMatchObject({ store: 'postgres' });
    });

    it("writes a save's properties, an undefined one as null, and a property's name as the layout holds it", () => {
        expect(writeProps({ $k: 1, gone: undefined }, 'sqlite')).toEqual('{"$$k":1,"gone":null}');
        expect([heldKey('$k'), heldKey('$$k'), heldKey('k$')]).toEqual(['$$k', '$$$k', 'k$']);
    });

    it('writes each float as the store holds one: a whole one with its fraction, and on Oracle as a double', () => {
        const values = { f: new CypherFloat(2), x: 1.5, e: 1e-7, big: 1e20, l: [new CypherFloat(3)] };
        expect(writeLayout(values, 'postgres')).toEqual(
            '{"f":2.0,"x":1.5,"e":1.0E-7,"big":100000000000000000000.0,"l":[3.0]}'
        );
        expect(writeLayout(values, 'sqlite')).toEqual('{"f":2.0,"x":1.5,"e":1.0E-7,"big":1.0E20,"l":[3.0]}');
        expect(writeLayout(values, 'oracle')).toEqual(
            '{"f":{"$numberDouble":"2.0"},"x":{"$numberDouble":"1.5"},"e":{"$numberDouble":"1.0E-7"},' +
                '"big":{"$numberDouble":"1.0E20"},"l":[{"$numberDouble":"3.0"}]}'
        );
        // A float alone, not in a map, too.
        expect(writeLayout(2.5, 'oracle')).toEqual('{"$numberDouble":"2.5"}');
    });

    it('writes a whole number past 2^53 with its digits, as a statement binds it, where JSON text writes its shortest text', () => {
        expect(JSON.stringify(2 ** 60)).toEqual('1152921504606847000');
        for (const store of STORES) {
            expect(writeLayout({ n: 2 ** 60, l: [-(2 ** 60)] }, store)).toEqual(
                '{"n":1152921504606846976,"l":[-1152921504606846976]}'
            );
        }
        expect(asked).toHaveLength(STORES.length);
    });

    it('writes -0 as a float, as no integer is -0', () => {
        expect(writeLayout({ z: -0 }, 'sqlite')).toEqual('{"z":-0.0}');
        expect(writeLayout({ z: -0 }, 'oracle')).toEqual('{"z":{"$numberDouble":"-0.0"}}');
        expect(writeLayout({ z: new CypherFloat(-0) }, 'sqlite')).toEqual('{"z":-0.0}');
    });

    it('writes NaN and the infinities as the store holds them, and refuses them where it holds them as no number', () => {
        const postgres =
            "A statement that writes is given NaN or an infinity, which Postgres's `jsonb` holds as no number: it would store another value in its place.";
        const sqliteNaN =
            "A statement that writes is given NaN, which SQLite's JSON holds as no number: it would store another value in its place.";
        for (const value of [NaN, Infinity, -Infinity]) {
            expect(() => writeLayout({ x: value }, 'postgres')).toThrow(postgres);
            expect(() => writeProps({ x: [1, { y: value }], d: new Date(0) }, 'postgres')).toThrow(postgres);
            expect(() => writeLayout({ x: new CypherFloat(value) }, 'postgres')).toThrow(postgres);
        }
        expect(() => writeLayout({ x: NaN }, 'sqlite')).toThrow(sqliteNaN);
        expect(writeLayout({ x: [Infinity, -Infinity] }, 'sqlite')).toEqual('{"x":[9e999,-9e999]}');
        expect(writeLayout({ x: [NaN, Infinity, -Infinity] }, 'oracle')).toEqual(
            '{"x":[{"$numberDouble":"NaN"},{"$numberDouble":"Infinity"},{"$numberDouble":"-Infinity"}]}'
        );
        // In a typed array and in an object of a class, which JSON text would write null.
        expect(() => writeLayout({ v: new Float32Array([NaN]) }, 'postgres')).toThrow(postgres);
        expect(() =>
            writeLayout(
                {
                    o: new (class Point {
                        x = Infinity;
                    })()
                },
                'postgres'
            )
        ).toThrow(postgres);
    });

    it('writes bytes as the list of their signed values on every store, as drivine4j and Neo4j hold them', () => {
        for (const store of STORES) {
            expect(writeLayout({ b: new Uint8Array([1, 2, 255]) }, store)).toEqual('{"b":[1,2,-1]}');
            expect(writeLayout({ b: Buffer.from([1, 2, 255]), l: [new Int8Array([-1])] }, store)).toEqual(
                '{"b":[1,2,-1],"l":[[-1]]}'
            );
        }
    });

    it('writes a float typed array as floats, and a driver integer, another typed array and an object as JSON text does', () => {
        const values = {
            i: int(5),
            l: int('4611686018427387905'),
            v: new Float32Array([0.5, 1]),
            u: new Uint16Array([1, 2]),
            o: new (class Point {
                x = 1;
            })()
        };
        expect(writeLayout(values, 'postgres')).toEqual(
            '{"i":5,"l":4611686018427387905,"v":[0.5,1.0],"u":[1,2],"o":{"x":1}}'
        );
        expect(writeLayout(values, 'oracle')).toEqual(
            '{"i":5,"l":4611686018427387905,"v":[{"$numberDouble":"0.5"},{"$numberDouble":"1.0"}],"u":[1,2],"o":{"x":1}}'
        );
        // Beside a date, the rest is written alike.
        const dated = parseExactIntegers(writeLayout({ ...values, d: new Date(0) }, 'sqlite'));
        expect(dated.d.$t).toEqual('datetime');
        delete dated.d;
        expect(jsonText(dated)).toEqual('{"i":5,"l":4611686018427387905,"v":[0.5,1],"u":[1,2],"o":{"x":1}}');
    });

    it("holds a user's map with the key $numberDouble under one more $, so no store reads it as a float", () => {
        expect(writeLayout({ m: { $numberDouble: 'NaN', n: new CypherFloat(2) } }, 'oracle')).toEqual(
            '{"m":{"$$numberDouble":"NaN","n":{"$numberDouble":"2.0"}}}'
        );
        expect(writeLayout({ m: { $numberDouble: 'NaN' } }, 'postgres')).toEqual('{"m":{"$$numberDouble":"NaN"}}');
    });
});
