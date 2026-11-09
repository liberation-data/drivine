import { randomUUID } from 'crypto';
import { javaDouble } from '@/cypher/sql/JsonText';
import { SqliteArguments } from '@/connection/sqlite/SqliteArguments';
import { JsonValue, SqliteCypherValues } from '@/connection/sqlite/SqliteCypherValues';
import { roundingMode, SqliteDecimal } from '@/connection/sqlite/SqliteDecimal';
import type { SqliteDatabase, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import type { SqlitePatterns } from '@/connection/sqlite/SqlitePatterns';
import { temporal, toChar } from '@/connection/sqlite/SqliteTemporalFunctions';
import { procedures } from '@/connection/sqlite/SqliteCypherProcedure';

/**
 * The SQL names of the functions compiled Cypher calls on SQLite, drivine4j's, for what Cypher does with its values, JSON
 * text each, that SQLite does not. See {@link registerCypherFunctions}.
 */
export const SqliteCypherFunctionNames = {
    EQUAL: 'drivine_equal',
    CONTAINS: 'drivine_contains',
    ADD: 'drivine_add',
    CANONICAL: 'drivine_canonical',
    CYPHER: 'drivine_cypher',
    UPPER: 'drivine_upper',
    SPLIT: 'drivine_split',
    REVERSE: 'drivine_reverse',
    UUID: 'drivine_uuid',
    REGEX_GROUP: 'drivine_regex_group',
    REGEX_REPLACE: 'drivine_regexp_replace',
    TRUNC: 'drivine_trunc',
    TO_CHAR: 'drivine_to_char',
    TEMPORAL: 'drivine_temporal',
    FLOAT_TEXT: 'drivine_float_text',
    SORT_KEY: 'drivine_sort_key',
    LIST_ORDER: 'drivine_list_order',
    MATH: 'drivine_math',
    ROUND: 'drivine_round',
    FAIL: 'drivine_fail'
} as const;

const names = SqliteCypherFunctionNames;

/**
 * Registers on `db` the functions compiled Cypher calls, as drivine4j's `SqliteFunctions.register` does:
 *
 * - `drivine_equal`, `drivine_contains`, `drivine_canonical` and `drivine_add` compare, group and add Cypher's values;
 * - `drivine_upper`, `drivine_split`, `drivine_reverse` and `drivine_uuid` are Cypher's `toUpper`, `split`, `reverse`
 *   and `randomUUID`;
 * - `drivine_math` and `drivine_round` work out Cypher's functions of numbers, `exp`, `log`, `sin` …, and `round` by a
 *   mode, as Neo4j does;
 * - `drivine_regex_group` and `drivine_regexp_replace` read and replace what a regular expression matches;
 * - `drivine_float_text` writes a float as Java does, for `toString`, `drivine_sort_key` orders a list as Cypher does,
 *   and `drivine_list_order` compares two lists as Cypher does;
 * - `drivine_trunc`, `drivine_to_char` and `drivine_temporal` work out temporal values;
 * - `drivine_cypher` carries out the procedure a statement that writes compiles to;
 * - `drivine_fail` fails the statement with its text, where Neo4j fails on a value it reads.
 *
 * Each takes the number of arguments drivine4j's does, but `drivine_temporal` and `drivine_math`, which take as many as
 * their operation does. A whole number is given to one as a bigint, so it tells `2` from `2.0`, and one it gives back is
 * a bigint, which SQLite holds as an integer: a JavaScript number it holds as a real.
 */
export function registerCypherFunctions(db: SqliteDatabase, patterns: SqlitePatterns): void {
    const exact = { deterministic: true, useBigIntArguments: true };
    const text = SqliteArguments.text;
    const read = (value: SqliteValue): JsonValue | undefined => SqliteCypherValues.read(text(value));
    const truth = (value: boolean | undefined): SqliteValue => (value === undefined ? null : BigInt(value ? 1 : 0));

    db.function(names.CYPHER, { useBigIntArguments: true }, procedures(db));
    db.function(names.EQUAL, exact, (a, b) => {
        const x = read(a);
        const y = read(b);
        return x === undefined || y === undefined ? null : truth(SqliteCypherValues.compare(x, y));
    });
    db.function(names.CONTAINS, exact, (props, map) => {
        const x = read(props);
        const y = read(map);
        return x === undefined || y === undefined ? null : truth(SqliteCypherValues.contains(x, y));
    });
    db.function(names.ADD, exact, (a, b) => {
        const sum = SqliteCypherValues.add(read(a) ?? null, read(b) ?? null);
        return sum === undefined ? null : SqliteCypherValues.write(sum);
    });
    db.function(names.CANONICAL, exact, (json) => {
        const written = text(json);
        const value = SqliteCypherValues.read(written);
        return value === undefined ? written : SqliteCypherValues.write(SqliteCypherValues.canonical(value));
    });
    db.function(names.UPPER, exact, (value) => text(value)?.toUpperCase() ?? null);
    db.function(names.SPLIT, exact, (value, separator) => split(text(value), text(separator)));
    db.function(names.REVERSE, exact, (value) => {
        const written = text(value);
        return written === null ? null : [...written].reverse().join('');
    });
    db.function(names.UUID, {}, () => randomUUID());
    db.function(names.REGEX_GROUP, exact, (value, expression, group) =>
        regexGroup(patterns, text(value), text(expression), group)
    );
    db.function(names.REGEX_REPLACE, exact, (value, expression, replacement) =>
        regexReplace(patterns, text(value), text(expression), text(replacement))
    );
    db.function(names.TRUNC, exact, (value) => trunc(value));
    db.function(names.TO_CHAR, exact, (value, pattern) => toChar(value, pattern));
    db.function(names.FLOAT_TEXT, exact, (value) => (value == null ? null : javaDouble(SqliteArguments.real(value))));
    db.function(names.SORT_KEY, exact, (json) => {
        const written = text(json);
        return written === null ? null : SqliteCypherValues.sortKey(written);
    });
    db.function(names.LIST_ORDER, exact, (a, b) => {
        const x = read(a);
        const y = read(b);
        if (!Array.isArray(x) || !Array.isArray(y)) {
            return null;
        }
        const order = SqliteCypherValues.order(x, y);
        return order === undefined ? null : BigInt(order);
    });
    db.function(names.ROUND, exact, (number, precision, mode) => round(number, precision, mode));
    // Not deterministic: SQLite must not work it out before a row that needs it.
    db.function(names.FAIL, { useBigIntArguments: true }, (message) => {
        throw new Error(text(message) ?? '');
    });
    // Of as many arguments as its operation takes.
    db.function(names.TEMPORAL, { ...exact, varargs: true }, temporal);
    db.function(names.MATH, { ...exact, varargs: true }, math);
}

/**
 * `drivine_split(text, separator)`: Cypher's `split`, the text cut at each separator, as the JSON text of a list of
 * texts: an empty one at each end the text starts or ends with a separator, each character where the separator is
 * empty, and the empty text a list of itself. Null where either is null.
 */
function split(value: string | null, separator: string | null): SqliteValue {
    if (value === null || separator === null) {
        return null;
    }
    const parts = value === '' ? [value] : separator === '' ? [...value] : value.split(separator);
    return SqliteCypherValues.write(parts);
}

/**
 * `drivine_regex_group(text, expression, group)`: the text the group of that number matches, where the regular
 * expression first matches in the text, as Postgres's `regexp_match` gives it; null where it matches nowhere, or the
 * group takes no part, or the text or the expression is null.
 */
function regexGroup(
    patterns: SqlitePatterns,
    value: string | null,
    expression: string | null,
    group: SqliteValue
): SqliteValue {
    if (value === null || expression === null) {
        return null;
    }
    const match = patterns.of(expression, '').exec(value);
    const number = Number(BigInt.asIntN(32, SqliteArguments.integer(group)));
    if (!match || number > match.length - 1) {
        return null;
    }
    if (number < 0) {
        throw new Error(`No group ${number}`);
    }
    return match[number] ?? null;
}

/**
 * `drivine_regexp_replace(text, expression, replacement)`: the text with each match of the regular expression replaced,
 * the replacement naming a group as Postgres's and Oracle's do, `\1`, and as drivine4j hands it to Java's `replaceAll`:
 * a backslash and a digit name a group, and the digits after it name a group of more digits where there is one;
 * anything else is itself. Null where any is null.
 */
function regexReplace(
    patterns: SqlitePatterns,
    value: string | null,
    expression: string | null,
    replacement: string | null
): SqliteValue {
    if (value === null || expression === null || replacement === null) {
        return null;
    }
    return value.replace(patterns.of(expression, 'g'), (...found: any[]) => {
        const end = found.findIndex((it, i) => i > 0 && typeof it === 'number');
        const groups: (string | undefined)[] = found.slice(0, end);
        return replaced(replacement, groups);
    });
}

/** `replacement` with each group it names, `\1`, as the match `groups` holds it, as Java's `appendReplacement` writes it. */
function replaced(replacement: string, groups: (string | undefined)[]): string {
    const count = groups.length - 1;
    let written = '';
    let at = 0;
    while (at < replacement.length) {
        const c = replacement[at];
        if (c !== '\\' || !isDigit(replacement[at + 1])) {
            written += c;
            at++;
            continue;
        }
        let group = Number(replacement[at + 1]);
        at += 2;
        while (isDigit(replacement[at]) && group * 10 + Number(replacement[at]) <= count) {
            group = group * 10 + Number(replacement[at]);
            at++;
        }
        if (group > count) {
            throw new Error(`No group ${group}`);
        }
        written += groups[group] ?? '';
    }
    return written;
}

function isDigit(c: string | undefined): boolean {
    return c !== undefined && c >= '0' && c <= '9';
}

/** How many units of its last place a real number may miss a whole number by and be it: see {@link trunc}. */
const SLACK = 2;

/**
 * `drivine_trunc(number)`: the number with its fraction cut off, as a whole number where it fits one, as Postgres's and
 * Oracle's `TRUNC` give a number of no fraction: SQLite's own `trunc` gives a real number, which JSON writes `2.0`.
 *
 * A real number within {@link SLACK} units of its last place of a whole number is that whole number. Postgres and Oracle
 * work out a fraction of a second exactly, and SQLite in binary, which misses it by that much: 33.001 seconds times a
 * million is 33000999.999999996, and those microseconds are 33001000.
 */
function trunc(value: SqliteValue): SqliteValue {
    if (value == null) {
        return null;
    }
    if (typeof value === 'bigint') {
        return value;
    }
    const number = SqliteArguments.real(value);
    const whole = rint(number);
    const cut = Math.abs(number - whole) <= SLACK * ulp(number) ? whole : Math.trunc(number);
    return cut >= -(2 ** 63) && cut < 2 ** 63 ? BigInt(cut) : cut;
}

/** The whole number nearest `value`, the even one of two as near, as Java's `Math.rint`. */
function rint(value: number): number {
    const floor = Math.floor(value);
    const fraction = value - floor;
    if (fraction !== 0.5) {
        return fraction < 0.5 ? floor : floor + 1;
    }
    return floor % 2 === 0 ? floor : floor + 1;
}

const ULP_BITS = new DataView(new ArrayBuffer(8));

/** The distance from `value` to the next double away from zero, as Java's `Math.ulp`. */
function ulp(value: number): number {
    const magnitude = Math.abs(value);
    if (!Number.isFinite(magnitude)) {
        return magnitude;
    }
    if (magnitude === Number.MAX_VALUE) {
        return 2 ** 971;
    }
    ULP_BITS.setFloat64(0, magnitude);
    ULP_BITS.setBigUint64(0, ULP_BITS.getBigUint64(0) + BigInt(1));
    return ULP_BITS.getFloat64(0) - magnitude;
}

/**
 * `drivine_round(number, precision, mode)`: the number rounded to as many decimal places by the mode, as Java's
 * `BigDecimal` rounds it, as Neo4j's `round(value, precision, mode)` does: in decimal, so 2.345 is halfway between 2.34
 * and 2.35, where SQLite's binary arithmetic finds it just below. Null where the number or the precision is. An
 * infinity, which SQLite stores and a decimal holds no value for, is itself, as Neo4j rounds it.
 */
function round(value: SqliteValue, precision: SqliteValue, mode: SqliteValue): SqliteValue {
    if (value == null || precision == null) {
        return null;
    }
    if (typeof value === 'number' && Math.abs(value) === Infinity) {
        return value;
    }
    const number =
        typeof value === 'bigint' ? SqliteDecimal.ofWhole(value) : SqliteDecimal.ofDouble(SqliteArguments.real(value));
    // Places at or past the number's own change nothing, and setScale would write each out: round(2.5, 1000000000) overflows.
    const places = SqliteArguments.integer(precision);
    if (places >= BigInt(number.scale)) {
        return number.toDouble();
    }
    // As Java's `toInt`, a long's lowest 32 bits.
    const scale = Number(BigInt.asIntN(32, places));
    if (scale >= number.scale) {
        return number.toDouble();
    }
    return number.setScale(scale, roundingMode(SqliteArguments.text(mode))).toDouble();
}

/**
 * `drivine_math(name, number[, number])`: openCypher's function of numbers `name` (`exp`, `log`, `sin`, `atan2` …),
 * worked out as Java's `Math` works it out, as Neo4j works it out. Null where a number is null. Where Neo4j gives NaN or
 * an infinity (`log(0)`, `sqrt(-1)`, `exp(1000)`), it fails: JSON holds neither, and Postgres and Oracle fail there too.
 * SQLite's own functions give null for some of them.
 */
function math(...args: SqliteValue[]): SqliteValue {
    const name = SqliteArguments.text(args[0]);
    if (name === null) {
        throw new Error('Required value was null.');
    }
    if (args.slice(1).some((it) => it == null)) {
        return null;
    }
    const numbers = args.slice(1).map((it) => SqliteArguments.real(it));
    if (numbers.length === 0) {
        throw new Error(`${names.MATH} is given no number for ${name}.`);
    }
    const x = numbers[0];
    const functions: Record<string, () => number> = {
        exp: () => Math.exp(x),
        log: () => Math.log(x),
        log10: () => Math.log10(x),
        sqrt: () => Math.sqrt(x),
        sin: () => Math.sin(x),
        cos: () => Math.cos(x),
        tan: () => Math.tan(x),
        cot: () => 1.0 / Math.tan(x),
        asin: () => Math.asin(x),
        acos: () => Math.acos(x),
        atan: () => Math.atan(x),
        atan2: () => Math.atan2(x, numbers[1]),
        // Java's toDegrees and toRadians multiply by a constant, which a division may differ from in its last place.
        degrees: () => x * RADIANS_TO_DEGREES,
        radians: () => x * DEGREES_TO_RADIANS,
        haversin: () => (1.0 - Math.cos(x)) / 2.0
    };
    if (!Object.prototype.hasOwnProperty.call(functions, name)) {
        throw new Error(`${names.MATH} has no function ${name}.`);
    }
    const value = functions[name]();
    if (!Number.isFinite(value)) {
        throw new Error(
            `${name}() of ${numbers.map(javaDouble).join(', ')} is ${javaDouble(
                value
            )}, which JSON holds no value for: ` + `a SQL store does not give it.`
        );
    }
    return value;
}

/** Java's `Math.toDegrees` and `Math.toRadians` constants. */
const RADIANS_TO_DEGREES = 57.29577951308232;
const DEGREES_TO_RADIANS = 0.017453292519943295;
