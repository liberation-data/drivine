import { DrivineError } from '@/DrivineError';
import { CypherFloat } from '@/cypher/CypherFloat';
import { cypherCompilerModule, parametersJson, SharedStore } from '@/cypher/SharedCypherCompiler';
import { parseExactIntegers } from '@/utils/ExactIntegers';
import { isInt } from '@/utils/Integers';
import { jsonText } from '@/utils/JsonText';

/**
 * A column of a statement's rows, its JSON text as the store gave it, read as the value it holds in the store layout
 * (drivine-cypher-spec#161): each temporal value's tag (`{"$t": "date", "v": "2024-01-01", "s": …}`) read as its text,
 * and each map's keys unescaped (`$$k` read as `$k`), at any depth, as the shared module reads it (its `read` request,
 * drivine4j's `ValueLayout.read`), so the three libraries read a row alike. `host.yaml`'s reads pin it. Each whole number
 * past 2^53 is a `bigint` of its digits (see parseExactIntegers).
 *
 * A text that holds neither `"$` nor `\u0024` (a dollar escaped) has no tag and no key that begins with `$` in it, and is
 * read as it is: the module is asked only of a column it has something to decide of, as a call of it costs some twenty
 * times a parse. The test is conservative: a text that holds either goes to the module, so a match that is neither a tag
 * nor a key (a text value `"$5"`) costs a call, never a wrong value. The module's ValueLayoutTest pins that every tag and
 * escaped key it writes holds `"$`, and that its read changes no text that holds neither.
 *
 * @param parse how a column with nothing of the layout in it is read: as JSON, keeping its whole numbers
 */
export function readLayout(text: string, parse: (text: string) => any = parseExactIntegers): any {
    if (!text.includes('"$') && !text.includes('\\u0024')) {
        return parse(text);
    }
    const answer = parseExactIntegers(cypherCompilerModule().compile(JSON.stringify({ read: text, typed: false })));
    if (answer && typeof answer === 'object' && 'error' in answer) {
        throw new DrivineError(`A row's value can't be read in the store layout: ${answer.error}`);
    }
    return answer.value;
}

/**
 * What a float that JSON would misread stands for while it crosses to the module and back, its text after it: NaN and the
 * infinities, which JSON has no text of, -0, which it writes 0, and a whole float past 2^53, which a whole number's reader would read as an
 * integer (Oracle's `{"$numberDouble": 1e16}`, a float).
 */
const FLOAT = '\u0000drivine:float:';

/**
 * What a text value that begins as a stand-in does (see FLOAT) crosses with before it, so it comes back the text it was:
 * SQLite's JSON can hold a text that begins with a NUL.
 */
const TEXT = '\u0000drivine:text:';

/**
 * A column read in the store layout, as {@link readLayout} reads it, where the store writes some values its own way in
 * the column's JSON (SQLite's NaN, `{"$numberDouble": "NaN"}`; Oracle's floats, `{"$numberDouble": 2.5}`): `raw` reads
 * those on the column as the store wrote it, where such a map's key has one `$` and a map of the user's with that key
 * has two, as the layout escapes it; the module then reads the rest. Read the other way round, the module's unescaping
 * would hand `raw` a user's map as the store's own.
 *
 * @param parse how the column is read before `raw` (Postgres's stand-ins for NaN and the infinities, which only their
 * text tells apart): as JSON, keeping its whole numbers
 */
export function readLayoutAfter(
    text: string,
    raw: (value: any) => any,
    parse: (text: string) => any = parseExactIntegers
): any {
    const value = raw(parse(text));
    if (!text.includes('"$') && !text.includes('\\u0024')) {
        return value;
    }
    return readLayoutThrough(value);
}

/**
 * A column a driver hands over parsed already (Oracle's JSON type, which node-oracledb reads as an object), read in the
 * store layout as {@link readLayout} reads its text: through the module where a map in it, at any depth, has a key that
 * begins with `$`, a tag's or an escaped key's, and as it is otherwise.
 */
export function readLayoutOf(value: any): any {
    return keyedWithDollar(value) ? readLayoutThrough(value) : value;
}

/** Whether a map in `value`, at any depth, has a key that begins with `$`. */
function keyedWithDollar(value: any): boolean {
    if (value === null || typeof value !== 'object' || value instanceof Date || ArrayBuffer.isView(value)) {
        return false;
    }
    if (Array.isArray(value)) {
        return value.some(keyedWithDollar);
    }
    return Object.entries(value).some(([key, item]) => key.startsWith('$') || keyedWithDollar(item));
}

/** `value`, parsed already, read in the store layout by the module, each float JSON would misread kept as it is. */
function readLayoutThrough(value: any): any {
    // A number here is a float, a whole number past 2^53 being a bigint: one JSON would misread crosses as its stand-in,
    // -0 among them, which JSON writes 0.
    const marked = jsonText(value, (_, item) =>
        Object.is(item, -0)
            ? `${FLOAT}-0`
            : typeof item === 'number' &&
              !Number.isSafeInteger(item) &&
              !(Number.isFinite(item) && !Number.isInteger(item))
            ? `${FLOAT}${String(item)}`
            : typeof item === 'string' && (item.startsWith(FLOAT) || item.startsWith(TEXT))
            ? `${TEXT}${item}`
            : item
    );
    return unmarked(readLayout(marked));
}

/** `value` with each stand-in for a float the float again, and each text marked so the text it was, at any depth. */
function unmarked(value: any): any {
    if (typeof value === 'string') {
        return value.startsWith(FLOAT)
            ? Number(value.slice(FLOAT.length))
            : value.startsWith(TEXT)
            ? value.slice(TEXT.length)
            : value;
    }
    if (Array.isArray(value)) {
        return value.map(unmarked);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unmarked(item)]));
    }
    return value;
}

/**
 * `value`, a value a save writes, as `store`'s layout holds it, as JSON text: the shared module's write for the store (its
 * `write` request, `{"write": <value>, "store": <store>}`, drivine4j's `CypherCompile.storeText`), the text a compiled
 * statement that writes binds the value as, so a value saved is held as one `CREATE` made (drivine-cypher-spec#329). Each
 * `Date` is its tag (`{"$t": "datetime", "v": …, "s": …}`), and each map key that begins with `$` has one more `$` before
 * it, at any depth. A float is the store's: on Postgres a whole one with its fraction (`2.0`), on Oracle every one extended
 * JSON's double (`{"$numberDouble": "2.5"}`, NaN and the infinities too), which Oracle reads `JSON(… EXTENDED)`, and on
 * SQLite an infinity `9e999`. Bytes are the list of their signed values (`[1, 2, -1]` for 1, 2, 255), as drivine4j and
 * Neo4j hold them.
 *
 * Where the store's JSON holds a float as no number, Postgres's NaN and infinities and SQLite's NaN, the module refuses the
 * value, and so does this, with the module's message: the message a `CREATE` given the value is refused with.
 *
 * The module is asked only of a value that holds something it writes otherwise than JSON text does (see heldOtherwise): a
 * date, a key that begins with `$`, bytes, a {@link CypherFloat}, or a number that isn't a whole one in a long's range,
 * which every float but a whole one is. Any other value is held as its JSON text on every store.
 */
export function writeLayout(given: any, store: SharedStore): string {
    const value = settled(given);
    if (!heldOtherwise(value)) {
        return jsonText(value);
    }
    const answer = cypherCompilerModule().compile(
        `{"write":${parametersJson(value)},"store":${JSON.stringify(store)}}`
    );
    // The value's text as the module wrote it, unparsed: JSON.parse would read 2.0 as 2, and 1.0E16 as a whole number.
    if (answer.startsWith(WRITTEN) && answer.endsWith('}')) {
        return answer.slice(WRITTEN.length, -1);
    }
    const refused = JSON.parse(answer);
    throw new DrivineError(refused?.error ?? `The shared module wrote no value: ${answer}`);
}

/** How the module's answer to a write begins, the value's text after it. */
const WRITTEN = '{"value":';

/**
 * The properties a save writes, each by its name, as `store`'s layout holds them, as JSON text (see writeLayout): one
 * undefined written null, as a save clears it.
 */
export function writeProps(props: Record<string, any>, store: SharedStore): string {
    return writeLayout(Object.fromEntries(Object.entries(props).map(([name, value]) => [name, value ?? null])), store);
}

/** A property's name as the store layout holds it: one more `$` before a name that begins with one. */
export function heldKey(name: string): string {
    return name.startsWith('$') ? `$${name}` : name;
}

const LONG_RANGE = 2 ** 63;

/**
 * Whether `value`, settled, holds what the module writes otherwise than JSON text, at any depth: a `Date`, a map key that
 * begins with `$`, bytes, a {@link CypherFloat}, or a number that is not a whole one in a long's range (a float with a
 * fraction, NaN, an infinity, -0, a whole float past a long's range). Asked of each float on every store: JSON text writes
 * `1e-7` where the module writes `1.0E-7`, and `1e20` as a whole number, and on Oracle every float is extended JSON's
 * double. A whole number in a long's range is the integer it is on every store, and a `bigint`'s digits are the module's.
 */
function heldOtherwise(value: any): boolean {
    if (typeof value === 'number') {
        return !wholeInLong(value);
    }
    if (value instanceof Date || value instanceof CypherFloat || bytes(value)) {
        return true;
    }
    if (value === null || typeof value !== 'object' || ArrayBuffer.isView(value)) {
        return false;
    }
    if (Array.isArray(value) || value instanceof Set) {
        return [...value].some(heldOtherwise);
    }
    return Object.entries(value).some(([key, item]) => key.startsWith('$') || heldOtherwise(item));
}

/** Whether `value` is a whole number in a long's range, and not -0: what every store holds as the integer it is. */
function wholeInLong(value: number): boolean {
    return Number.isInteger(value) && value >= -LONG_RANGE && value < LONG_RANGE && !Object.is(value, -0);
}

/** Whether `value` is bytes: a `Uint8Array`, an `Int8Array` or a `Buffer`. */
function bytes(value: any): boolean {
    return value instanceof Uint8Array || value instanceof Int8Array;
}

/**
 * `value` as a save writes it, at any depth, alike whether the module is asked of it or not: bytes (a `Uint8Array`, an
 * `Int8Array`, a `Buffer`) kept for the module, which writes them as the list of their signed values; a float typed array
 * (a `Float32Array`, a `Float64Array`) the list of its numbers, each a float, as drivine4j writes a `FloatArray`, and
 * another typed array the list of its numbers; the Neo4j driver's `Integer` its whole number, where JSON text would write
 * its fields; and an object of a class with no `toJSON` the map of its fields, as JSON text writes it. A `Date` and a
 * {@link CypherFloat} are kept for the module, and -0 is a float. A `Map`, a `DataView`, an `ArrayBuffer` and an object
 * with a `toJSON` are left as they are.
 */
function settled(value: any): any {
    if (value === null || typeof value !== 'object') {
        // -0 a float, as no integer is -0: the module's request reads a number -0 as the integer 0.
        return Object.is(value, -0) ? new CypherFloat(-0) : value;
    }
    if (isInt(value)) {
        const whole = BigInt(value.toString());
        return Number.isSafeInteger(Number(whole)) ? Number(whole) : whole;
    }
    if (value instanceof Date || value instanceof CypherFloat || keptAsIs(value)) {
        return value;
    }
    if (value instanceof Float32Array || value instanceof Float64Array) {
        return Array.from(value, (item) => new CypherFloat(item));
    }
    if (listed(value)) {
        return Array.from(value as Iterable<unknown>).map(settled);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, settled(item)]));
}

/** Whether a save writes `value` as the list of its items: a list, a set, or a typed array other than bytes. */
function listed(value: object): boolean {
    return Array.isArray(value) || value instanceof Set || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

/** Whether `value` is left as it is, unsettled (see settled): bytes, for the module, or what JSON text writes as it is. */
function keptAsIs(value: any): boolean {
    return (
        bytes(value) ||
        value instanceof Map ||
        value instanceof DataView ||
        value instanceof ArrayBuffer ||
        typeof value.toJSON === 'function'
    );
}
