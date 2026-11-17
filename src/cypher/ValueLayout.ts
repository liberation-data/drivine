import { DrivineError } from '@/DrivineError';
import { CypherFloat } from '@/cypher/CypherFloat';
import { cypherCompilerModule, parametersJson } from '@/cypher/SharedCypherCompiler';
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
 */
export function readLayoutAfter(text: string, raw: (value: any) => any): any {
    const value = raw(parseExactIntegers(text));
    if (!text.includes('"$') && !text.includes('\\u0024')) {
        return value;
    }
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
 * `value`, a value a save writes, as the store layout holds it, as the shared module writes it (its `write` request,
 * drivine4j's `CypherJson.valueToTree`): each `Date` its tag (`{"$t": "datetime", "v": …, "s": …}`), and each map key that
 * begins with `$` with one more `$` before it, at any depth. A value with neither in it is held as it is, and the module
 * is asked only of one that has. Bytes are held as the list of their signed values, and NaN and the infinities are
 * refused by name (see settled).
 */
export function writeLayout(given: any): any {
    const value = settled(given);
    if (!heldOtherwise(value)) {
        return value;
    }
    const answer = parseExactIntegers(cypherCompilerModule().compile(`{"write":${parametersJson(value)}}`));
    if (answer && typeof answer === 'object' && 'error' in answer) {
        throw new DrivineError(`A value can't be written in the store layout: ${answer.error}`);
    }
    return answer.value;
}

/**
 * The properties a save writes, each by its name, as the store layout holds them (see writeLayout): one undefined
 * written null, as a save clears it.
 */
export function writeProps(props: Record<string, any>): Record<string, any> {
    return writeLayout(Object.fromEntries(Object.entries(props).map(([name, value]) => [name, value ?? null])));
}

/** A property's name as the store layout holds it: one more `$` before a name that begins with one. */
export function heldKey(name: string): string {
    return name.startsWith('$') ? `$${name}` : name;
}

/** Whether `value` holds a `Date`, or a map key that begins with `$`, at any depth: what the layout holds otherwise. */
function heldOtherwise(value: any): boolean {
    if (value instanceof Date) {
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

/**
 * What a save says of NaN or an infinity, which it refuses until the module's `write` holds each store's own spelling of
 * one (drivine-cypher-spec#329): written as JSON text it would be null, and as the module writes it today, a text that
 * a Cypher read gives back as one.
 */
export const NON_FINITE_SAVED =
    'A save is given NaN or an infinity, which the store layout holds as no number yet (drivine-cypher-spec#329): it would store another value in its place.';

/**
 * `value` as a save writes it, at any depth, alike whether the module is asked of it or not: bytes (a `Uint8Array`, an
 * `Int8Array`, a `Buffer`) the list of their signed values, as drivine4j and Neo4j hold them (`[1, 2, -1]` for 1, 2,
 * 255), where JSON text would write a map of indexes; another typed array (a `Float32Array`) the list of its numbers; a
 * {@link CypherFloat} its number, and the Neo4j driver's `Integer` its whole number, where JSON text would write their
 * fields; an object of a class with no `toJSON` the map of its fields, as JSON text writes it; and NaN or an infinity
 * refused by name, where JSON text would write null (drivine-cypher-spec#329). A `Map`, a `DataView`, an `ArrayBuffer`
 * and an object with a `toJSON` are left as they are.
 */
function settled(value: any): any {
    if (value === null || typeof value !== 'object' || value instanceof Date) {
        return finite(value);
    }
    if (value instanceof CypherFloat) {
        return finite(value.value);
    }
    if (isInt(value)) {
        const whole = BigInt(value.toString());
        return Number.isSafeInteger(Number(whole)) ? Number(whole) : whole;
    }
    if (value instanceof Uint8Array || value instanceof Int8Array) {
        return Array.from(new Int8Array(value.buffer, value.byteOffset, value.byteLength));
    }
    if (listed(value)) {
        return Array.from(value as Iterable<unknown>).map(settled);
    }
    if (keptAsIs(value)) {
        return value;
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, settled(item)]));
}

/** Whether a save writes `value` as the list of its items: a list, a set, or a typed array other than bytes. */
function listed(value: object): boolean {
    return Array.isArray(value) || value instanceof Set || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

/** Whether `value` is written as JSON text writes it, unsettled (see settled). */
function keptAsIs(value: any): boolean {
    return (
        value instanceof Map ||
        value instanceof DataView ||
        value instanceof ArrayBuffer ||
        typeof value.toJSON === 'function'
    );
}

/** `value`, refused by name where it is NaN or an infinity (see settled). */
function finite(value: any): any {
    if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new DrivineError(NON_FINITE_SAVED);
    }
    return value;
}
