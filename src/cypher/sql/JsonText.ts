import { Integer, isInt } from 'neo4j-driver';
import { CypherFloat } from '@/cypher/ast/Expression';

/**
 * A value as JSON text, as drivine4j writes a statement's values: a map's entries in the order given, a whole number
 * as one, and a floating-point number the statement writes ({@link CypherFloat}) with its fraction, `2.0`, so it stays
 * a float. A date is its ISO 8601 text. The Neo4j driver's `Integer`, which an app binds a whole number as for Neo4j,
 * is the number it holds, and a `Buffer` or an `Int8Array` (the Neo4j driver's bytes) its base64 text, as drivine4j
 * writes a byte array. Any other iterable, a `Set` or a `Map`, is the list of its items, as the Neo4j driver sends it.
 * With `wholeFloats`, a float that is a whole number is written out in full, as Postgres takes it: see
 * {@link wholeFloatText}. With `wholeFloats` `'extended'`, a JavaScript number past a whole number's range is written
 * as Oracle's extended JSON writes a double, as Oracle takes it: see {@link extendedDoubles}.
 */
export function jsonText(value: any, wholeFloats: WholeFloats = false): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (value instanceof CypherFloat || typeof value === 'number' || typeof value === 'bigint' || isInt(value)) {
        return numberText(value, wholeFloats);
    }
    if (Array.isArray(value)) {
        return `[${value.map((it) => jsonText(it, wholeFloats)).join(',')}]`;
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
        return objectText(value, wholeFloats);
    }
    return JSON.stringify(value) ?? 'null';
}

/**
 * How {@link jsonText} writes a float that is a whole number: as JSON writes it (`false`), in full with a fraction
 * (`true`), or a JavaScript number past a whole number's range as Oracle's extended JSON writes a double
 * (`'extended'`).
 */
export type WholeFloats = boolean | 'extended';

/** A number as JSON text: see {@link jsonText}. */
function numberText(value: CypherFloat | number | bigint | Integer, wholeFloats: WholeFloats): string {
    if (value instanceof CypherFloat) {
        if (wholeFloats !== true) {
            return value.toString();
        }
        return isWhole(value.value) ? wholeFloatText(value.value) : twoDigits(value.value);
    }
    // A number past a whole number's range is a float, which it is on a graph engine.
    if (wholeFloats && typeof value === 'number' && pastLongRange(value)) {
        return wholeFloats === 'extended'
            ? `{${JSON.stringify(DOUBLE)}:${JSON.stringify(javaDouble(value))}}`
            : wholeFloatText(value);
    }
    return typeof value === 'number' ? JSON.stringify(value) ?? 'null' : value.toString();
}

/**
 * The float `value` from its shortest decimal, as Java writes it, with two digits at least where it is written with an
 * exponent: Postgres keeps the digits it is written with, and Java writes the least double, `5e-324`, as `4.9E-324`.
 */
function twoDigits(value: number): string {
    const text = String(value);
    const [mantissa, exponent] = text.split('e');
    return exponent !== undefined && !mantissa.includes('.') ? value.toExponential(1) : text;
}

/**
 * The double `value` as Java's `Double.toString` writes it: with no exponent from 10^-3 up to 10^7, a point and a digit
 * after it at least, and else as `1.0E7`, `1.2E-4`, from the shortest decimal that reads back as it.
 */
export function javaDouble(value: number): string {
    if (Number.isNaN(value)) {
        return 'NaN';
    }
    if (!Number.isFinite(value)) {
        return value > 0 ? 'Infinity' : '-Infinity';
    }
    if (value === 0) {
        return Object.is(value, -0) ? '-0.0' : '0.0';
    }
    const magnitude = Math.abs(value);
    if (magnitude >= 1e-3 && magnitude < 1e7) {
        const text = String(value);
        return text.includes('.') ? text : `${text}.0`;
    }
    // Two digits at least, as Java writes them: the least double, 5e-324, is 4.9E-324.
    const [shortest] = value.toExponential().split('e');
    const [mantissa, exponent] = (shortest.includes('.') ? value.toExponential() : value.toExponential(1)).split('e');
    return `${mantissa}E${Number(exponent)}`;
}

/** 2^63, past the greatest whole number Cypher has. */
export const LONG_RANGE = 2 ** 63;

function isWhole(value: number): boolean {
    return Number.isFinite(value) && Number.isInteger(value);
}

/** Whether `value` is a JavaScript number that is whole and past a whole number's range: a float, as Cypher has it. */
function pastLongRange(value: unknown): value is number {
    return typeof value === 'number' && isWhole(value) && Math.abs(value) >= LONG_RANGE;
}

/**
 * The key of Oracle's extended JSON that holds a double, as its text written as Java writes it, as drivine4j writes
 * one: `{"$numberDouble": "1.0E20"}`.
 */
const DOUBLE = '$numberDouble';

/**
 * Whether {@link jsonText} with `wholeFloats` `'extended'` writes `value`, a parameter's, with a double as Oracle's
 * extended JSON writes one, which Oracle reads as a double where the text is read as extended JSON (`JSON(… EXTENDED)`):
 * where it holds a JavaScript number past a whole number's range, a float, and Oracle reads JSON's number, `1e+20` or
 * `100000000000000000000.0`, as a whole one. Not where it holds a map with a key as extended JSON's are, `$numberLong`,
 * which extended JSON would read as the value it writes: such a value is written as JSON is, and its float read as a
 * whole number, as drivine-python does.
 */
export function extendedDoubles(value: unknown): boolean {
    return holds(value, pastLongRange) && !holds(value, keyedAsExtended);
}

/**
 * Whether `value`, or a value in it as {@link jsonText} writes it, a list's item or a map's, is one `found` finds. An
 * iterator is not looked in: it gives its items only once, and {@link jsonText} takes them.
 */
function holds(value: unknown, found: (value: unknown) => boolean): boolean {
    if (found(value)) {
        return true;
    }
    if (value instanceof Uint8Array || value instanceof Int8Array) {
        return false;
    }
    if (writtenAsMap(value)) {
        return Object.values(value).some((it) => it !== undefined && holds(it, found));
    }
    if (value === null || typeof value !== 'object' || typeof (value as any)[Symbol.iterator] !== 'function') {
        return false;
    }
    const iterable = value as Iterable<unknown>;
    return (iterable[Symbol.iterator]() as unknown) !== iterable && Array.from(iterable).some((it) => holds(it, found));
}

/** Whether `value` is a map, as {@link jsonText} writes one, with a key as Oracle's extended JSON writes its own. */
function keyedAsExtended(value: unknown): boolean {
    return (
        writtenAsMap(value) && Object.entries(value).some(([key, item]) => item !== undefined && key.startsWith('$'))
    );
}

/** Whether {@link jsonText} writes `value` as a map: an object but a list, a date, a number, bytes or an iterable. */
function writtenAsMap(value: unknown): value is Record<string, unknown> {
    return (
        value !== null &&
        typeof value === 'object' &&
        !(value instanceof Date) &&
        !(value instanceof CypherFloat) &&
        !isInt(value) &&
        typeof (value as any)[Symbol.iterator] !== 'function'
    );
}

/**
 * The float `value`, a whole number, written out in full with a fraction, `10000000.0`, from its shortest decimal: as
 * JavaScript writes it, `1e+21`, Postgres's `jsonb` reads it as a whole number, which is then read back as an integer.
 * The double's exact value, `999999999999999983222784.0` for `1e24`, is no number Postgres reads as that float.
 */
export function wholeFloatText(value: number): string {
    const [mantissa, exponent] = Math.abs(value).toExponential().split('e');
    const digits = mantissa.replace('.', '');
    const point = Number(exponent) + 1;
    const whole = point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.substring(0, point);
    return `${value < 0 ? '-' : ''}${whole}.0`;
}

/** An object other than a list or a date: bytes, an iterable's items, or a map's entries. */
function objectText(value: any, wholeFloats: WholeFloats): string {
    if (value instanceof Uint8Array || value instanceof Int8Array) {
        return JSON.stringify(Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64'));
    }
    if (typeof value[Symbol.iterator] === 'function') {
        return jsonText(Array.from(value), wholeFloats);
    }
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${jsonText(item, wholeFloats)}`).join(',')}}`;
}
