import { randomUuid } from '@/utils/Random';
import { javaDouble } from '@/connection/sqlite/JavaDouble';
import { SqliteArguments } from '@/connection/sqlite/SqliteArguments';
import type { SqliteDatabase, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { registerHostFunctions } from '@/connection/sqlite/SqliteHostFunctions';
import { procedures } from '@/connection/sqlite/SqliteCypherProcedure';

/**
 * The SQL names of the functions compiled Cypher calls on SQLite that Drivine implements itself, drivine4j's: the rest
 * are the shared compiler's own (see registerHostFunctions). See {@link registerCypherFunctions}.
 */
export const SqliteCypherFunctionNames = {
    CYPHER: 'drivine_cypher',
    UPPER: 'drivine_upper',
    SPLIT: 'drivine_split',
    REVERSE: 'drivine_reverse',
    UUID: 'drivine_uuid',
    MATH: 'drivine_math',
    FAIL: 'drivine_fail'
} as const;

const names = SqliteCypherFunctionNames;

/**
 * Registers on `db` the functions compiled Cypher calls, as drivine4j's `SqliteFunctions.register` does:
 *
 * - the shared compiler's own, which compare, add, order and write Cypher's values, round numbers, match regular
 *   expressions and work out temporal values: registered as calls of its package (see registerHostFunctions);
 * - `drivine_upper`, `drivine_split`, `drivine_reverse` and `drivine_uuid` are Cypher's `toUpper`, `split`, `reverse`
 *   and `randomUUID`;
 * - `drivine_math` works out Cypher's functions of numbers, `exp`, `log`, `sin` …, as Neo4j does;
 * - `drivine_cypher` carries out the procedure a statement that writes compiles to;
 * - `drivine_fail` fails the statement with its text, where Neo4j fails on a value it reads.
 *
 * Each takes the number of arguments drivine4j's does, but `drivine_math`, which takes as many as its operation does. A
 * whole number is given to one as a bigint, so it tells `2` from `2.0`.
 */
export function registerCypherFunctions(db: SqliteDatabase): void {
    const exact = { deterministic: true, useBigIntArguments: true };
    const text = SqliteArguments.text;

    registerHostFunctions(db);
    db.function(names.CYPHER, { useBigIntArguments: true }, procedures(db));
    db.function(names.UPPER, exact, (value) => text(value)?.toUpperCase() ?? null);
    db.function(names.SPLIT, exact, (value, separator) => split(text(value), text(separator)));
    db.function(names.REVERSE, exact, (value) => {
        const written = text(value);
        return written === null ? null : [...written].reverse().join('');
    });
    db.function(names.UUID, {}, () => randomUuid());
    // Not deterministic: SQLite must not work it out before a row that needs it.
    db.function(names.FAIL, { useBigIntArguments: true }, (message) => {
        throw new Error(text(message) ?? '');
    });
    // Of as many arguments as its operation takes.
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
    return `[${parts.map(quoted).join(',')}]`;
}

/** `text` as JSON writes a text, as Jackson escapes one: a control character as `\n`, or `\u001F` in upper case. */
function quoted(text: string): string {
    let written = '"';
    for (const c of text) {
        const code = c.charCodeAt(0);
        if (c === '"' || c === '\\') {
            written += `\\${c}`;
        } else if (code >= 0x20) {
            written += c;
        } else {
            written += SHORT_ESCAPES[c] ?? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;
        }
    }
    return `${written}"`;
}

const SHORT_ESCAPES: Record<string, string> = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r' };

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
