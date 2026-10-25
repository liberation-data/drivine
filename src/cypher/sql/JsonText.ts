import { Integer, isInt } from 'neo4j-driver';
import { CypherFloat } from '@/cypher/ast/Expression';

/**
 * A value as JSON text, as drivine4j writes a statement's values: a map's entries in the order given, a whole number
 * as one, and a floating-point number the statement writes ({@link CypherFloat}) with its fraction, `2.0`, so it stays
 * a float. A date is its ISO 8601 text. The Neo4j driver's `Integer`, which an app binds a whole number as for Neo4j,
 * is the number it holds, and a `Buffer` or an `Int8Array` (the Neo4j driver's bytes) its base64 text, as drivine4j
 * writes a byte array. Any other iterable, a `Set` or a `Map`, is the list of its items, as the Neo4j driver sends it.
 * With `wholeFloats`, a float that is a whole number is written out in full, as Postgres takes it: see
 * {@link wholeFloatText}.
 */
export function jsonText(value: any, wholeFloats: boolean = false): string {
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

/** A number as JSON text: see {@link jsonText}. */
function numberText(value: CypherFloat | number | bigint | Integer, wholeFloats: boolean): string {
    if (value instanceof CypherFloat) {
        if (!wholeFloats) {
            return value.toString();
        }
        return isWhole(value.value) ? wholeFloatText(value.value) : twoDigits(value.value);
    }
    // A number past a whole number's range is a float, which it is on a graph engine.
    if (wholeFloats && typeof value === 'number' && isWhole(value) && Math.abs(value) >= LONG_RANGE) {
        return wholeFloatText(value);
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

/** 2^63, past the greatest whole number Cypher has. */
export const LONG_RANGE = 2 ** 63;

function isWhole(value: number): boolean {
    return Number.isFinite(value) && Number.isInteger(value);
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
function objectText(value: any, wholeFloats: boolean): string {
    if (value instanceof Uint8Array || value instanceof Int8Array) {
        return JSON.stringify(Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64'));
    }
    if (typeof value[Symbol.iterator] === 'function') {
        return jsonText(Array.from(value), wholeFloats);
    }
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${jsonText(item, wholeFloats)}`).join(',')}}`;
}
