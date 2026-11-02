import type { SqliteValue } from '@/connection/sqlite/SqliteDriver';

/**
 * An argument of a function Drivine registers, read as SQLite's `sqlite3_value_text`, `sqlite3_value_double` and
 * `sqlite3_value_int64` read one, as drivine4j's functions read theirs. A function registered with
 * `useBigIntArguments` is given a whole number as a bigint and a real one as a number, so it tells them apart.
 */
export const SqliteArguments = {
    /** The argument as text: a real number as SQLite writes one, `2.0`, `1.0e+20`; null where it is null. */
    text(value: SqliteValue): string | null {
        if (value == null) {
            return null;
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'bigint') {
            return value.toString();
        }
        if (typeof value === 'number') {
            return realText(value);
        }
        return new TextDecoder().decode(value);
    },

    /** The argument as a real number: a text as SQLite reads one, the number it starts with, else 0. */
    real(value: SqliteValue): number {
        if (value == null) {
            return 0;
        }
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'bigint') {
            return Number(value);
        }
        const text = SqliteArguments.text(value)!;
        const number = NUMERIC.exec(text);
        return number ? Number(number[0]) : 0;
    },

    /** The argument as a whole number: a real one cut toward zero, within SQLite's integers; a text's number. */
    integer(value: SqliteValue): bigint {
        if (typeof value === 'bigint') {
            return value;
        }
        if (typeof value === 'string' || value instanceof Uint8Array) {
            const text = SqliteArguments.text(value)!;
            const whole = WHOLE.exec(text);
            if (whole) {
                return clamp(BigInt(whole[1]));
            }
        }
        const real = SqliteArguments.real(value);
        if (Number.isNaN(real)) {
            return BigInt(0);
        }
        if (real >= 2 ** 63) {
            return MAX_INTEGER;
        }
        if (real <= -(2 ** 63)) {
            return MIN_INTEGER;
        }
        return BigInt(Math.trunc(real));
    }
};

/** The number a text starts with, as SQLite reads one: spaces before it allowed. */
const NUMERIC = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/;

/** A text that is a whole number alone, spaces around it allowed. */
const WHOLE = /^\s*([+-]?\d+)\s*$/;

/** The least and the greatest integer SQLite holds. */
const MIN_INTEGER = BigInt('-9223372036854775808');
const MAX_INTEGER = BigInt('9223372036854775807');

function clamp(value: bigint): bigint {
    return value > MAX_INTEGER ? MAX_INTEGER : value < MIN_INTEGER ? MIN_INTEGER : value;
}

/**
 * The real number `value` as SQLite writes one as text, `%!.15g`: 15 significant digits, a point and a digit after it
 * at least, and an exponent of two digits at least where it is below 10^-4 or 10^15 and over. drivine4j reads such a
 * text where it reads a real number as text, as `BigDecimal(value_text(0))`. SQLite works out 19 digits, close to the
 * number's own, and rounds them half up to 15: so does this, from the number's own. SQLite's arithmetic misses the
 * number's own digits by a little, so a number within that little of halfway between two of 15 digits may be rounded
 * the other way here, as may one past 10^±30, where SQLite misses by more.
 */
export function realText(value: number): string {
    if (Number.isNaN(value)) {
        return 'NaN';
    }
    if (!Number.isFinite(value)) {
        return value > 0 ? 'Inf' : '-Inf';
    }
    if (value === 0) {
        return '0.0';
    }
    const [mantissa, exponentText] = Math.abs(value).toExponential(18).split('e');
    let digits = mantissa.replace('.', '');
    let exponent = Number(exponentText);
    // 19 digits rounded half up to 15, the carry past a 9 taken to the digit before it, and past the first.
    digits = (BigInt(digits.substring(0, 15)) + BigInt(digits[15] >= '5' ? 1 : 0)).toString();
    if (digits.length > 15) {
        digits = digits.substring(0, 15);
        exponent++;
    }
    return (value < 0 ? '-' : '') + significant(digits, exponent);
}

/** The 15 significant `digits` of a number of that decimal `exponent`, as `%!.15g` writes them. */
function significant(digits: string, exponent: number): string {
    const point = (whole: string, fraction: string): string => `${whole}.${fraction.replace(/0+$/, '') || '0'}`;
    if (exponent < -4 || exponent >= 15) {
        const power = String(Math.abs(exponent)).padStart(2, '0');
        return `${point(digits[0], digits.substring(1))}e${exponent < 0 ? '-' : '+'}${power}`;
    }
    return exponent >= 0
        ? point(digits.substring(0, exponent + 1), digits.substring(exponent + 1))
        : point('0', '0'.repeat(-exponent - 1) + digits);
}
