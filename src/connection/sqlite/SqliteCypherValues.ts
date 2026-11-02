import { javaDouble } from '@/cypher/sql/JsonText';
import { byCodePoints } from '@/backend/sqlite/ExactJson';

/**
 * A number of JSON as Jackson reads one: a whole number, of any size, a bigint, where it is written with no point and no
 * exponent, else a double.
 */
export class JsonNumber {
    constructor(readonly value: bigint | number) {}
}

/**
 * A JSON value as drivine4j's functions read one with Jackson: a map keeps its keys in the order written, which a
 * JavaScript object does not where a key is a number, and a number is a whole number or a double as it is written.
 */
export type JsonValue = null | boolean | string | JsonNumber | JsonValue[] | Map<string, JsonValue>;

/**
 * Cypher's values as a compiled statement holds them on SQLite, the JSON text of each, and what Cypher does with them
 * that SQLite's JSON functions do not: compare them, and add them, as drivine4j's `SqliteCypherValues`. A text a
 * function is given that is SQL's null, or JSON's, is no value.
 */
export const SqliteCypherValues = {
    /** The JSON text `text` read, or undefined where it is null, JSON's null, or holds no value. */
    read(text: string | null): JsonValue | undefined {
        if (text === null) {
            return undefined;
        }
        const value = readJson(text);
        return value === null ? undefined : value;
    },

    /** `value` as JSON text, as Jackson writes it: a double as Java writes one, `1.0E7`. */
    write(value: JsonValue): string {
        if (value === null) {
            return 'null';
        }
        if (typeof value === 'boolean') {
            return String(value);
        }
        if (typeof value === 'string') {
            return quoted(value);
        }
        if (value instanceof JsonNumber) {
            return asText(value);
        }
        if (Array.isArray(value)) {
            return `[${value.map((it) => SqliteCypherValues.write(it)).join(',')}]`;
        }
        return `{${[...value].map(([key, item]) => `${quoted(key)}:${SqliteCypherValues.write(item)}`).join(',')}}`;
    },

    /**
     * Whether `a` and `b` are equal as Cypher compares them: a number equal to a number of the same value whatever its
     * kind (`1` and `1.0`), a list to a list of equal items in the same order, a map to a map of the same keys with equal
     * values in any order, and nothing to a value of another kind.
     */
    equal(a: JsonValue, b: JsonValue): boolean {
        if (isNumber(a) && isNumber(b)) {
            return numberOrder(a, b) === 0;
        }
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && a.every((it, i) => SqliteCypherValues.equal(it, b[i]));
        }
        if (a instanceof Map && b instanceof Map) {
            return (
                a.size === b.size &&
                [...a].every(([key, value]) => b.has(key) && SqliteCypherValues.equal(value, b.get(key)!))
            );
        }
        return (a === null || typeof a !== 'object') && a === b;
    },

    /**
     * Whether `a` and `b` are equal as Cypher compares values that may be or hold a null: undefined where either is
     * null; a list to a list, and a map to a map, item by item and key by key, false where a pair is false (lists of
     * different lengths and maps of different keys among them), else undefined where a pair is, else true; any other
     * two as {@link equal} compares them.
     */
    compare(a: JsonValue, b: JsonValue): boolean | undefined {
        if (a === null || b === null) {
            return undefined;
        }
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length !== b.length ? false : all(a.map((it, i) => [it, b[i]]));
        }
        if (a instanceof Map && b instanceof Map) {
            if (a.size !== b.size || [...a.keys()].some((key) => !b.has(key))) {
                return false;
            }
            return all([...a].map(([key, value]) => [value, b.get(key)!]));
        }
        return SqliteCypherValues.equal(a, b);
    },

    /** Whether the map `props` holds each entry of the map `map`, with an equal value: a null is held only by a null. */
    contains(props: JsonValue, map: JsonValue): boolean {
        return (
            props instanceof Map &&
            map instanceof Map &&
            [...map].every(([key, value]) => props.has(key) && SqliteCypherValues.equal(props.get(key)!, value))
        );
    },

    /**
     * `a + b`, as Cypher adds two values: numbers summed, a whole number where both are; lists joined, or an item put at
     * a list's end or start; a text and a text or a number written one after the other. Undefined for any other two.
     */
    add(a: JsonValue, b: JsonValue): JsonValue | undefined {
        if (isNumber(a) && isNumber(b)) {
            return typeof a.value === 'bigint' && typeof b.value === 'bigint'
                ? new JsonNumber(a.value + b.value)
                : new JsonNumber(double(a) + double(b));
        }
        if (Array.isArray(a)) {
            return Array.isArray(b) ? [...a, ...b] : [...a, b];
        }
        if (Array.isArray(b)) {
            return [a, ...b];
        }
        if ((typeof a === 'string' || isNumber(a)) && (typeof b === 'string' || isNumber(b))) {
            return asText(a) + asText(b);
        }
        return undefined;
    },

    /** `value` with each map in it, at any depth, with its keys in order. */
    canonical(value: JsonValue): JsonValue {
        if (value instanceof Map) {
            return new Map(
                [...value.keys()]
                    .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
                    .map((key) => [key, SqliteCypherValues.canonical(value.get(key)!)])
            );
        }
        return Array.isArray(value) ? value.map((it) => SqliteCypherValues.canonical(it)) : value;
    },

    /**
     * Where `a` comes beside `b` as Cypher orders two values in a comparison (`<`, `>=` …): -1 before, 0 equal, 1 after.
     * A list beside a list item by item, the first pair that is not equal deciding, and a list that the other starts with
     * first; a number beside a number, a text beside a text by its code points, and a truth value beside a truth value.
     * Undefined where they are not ordered: a null, values of two kinds, or two maps that differ, which Cypher orders and
     * the compiler does not yet.
     */
    order(a: JsonValue, b: JsonValue): number | undefined {
        if (a === null || b === null) {
            return undefined;
        }
        if ((Array.isArray(a) && Array.isArray(b)) || (a instanceof Map && b instanceof Map)) {
            return containerOrder(a, b);
        }
        return scalarOrder(a, b);
    },

    /**
     * The JSON text `text` as text that orders, as SQLite orders text, as Cypher orders lists, where it is a list: item
     * by item, a list that begins another first, and items of different kinds as Cypher orders kinds (a map, a list, a
     * text, a truth value, a number, then null last). Each item is its kind's rank, then itself: a number by the bits of
     * its double, so their text orders as the numbers do; a text up to a mark below any character; a list its own items,
     * then its end, which comes before any item. Null where the value is no value; a value that is no list, its text.
     */
    sortKey(text: string): string | null {
        const value = SqliteCypherValues.read(text);
        if (value === undefined) {
            return null;
        }
        if (!Array.isArray(value)) {
            return text;
        }
        const out: string[] = [];
        keyOfList(value, out);
        return out.join('');
    }
};

/** Whether `a` and `b`, pairs, are all equal: false where a pair is not, else undefined where a pair is unknown. */
function all(pairs: [JsonValue, JsonValue][]): boolean | undefined {
    let unknown = false;
    for (const [x, y] of pairs) {
        const pair = SqliteCypherValues.compare(x, y);
        if (pair === false) {
            return false;
        }
        unknown = unknown || pair === undefined;
    }
    return unknown ? undefined : true;
}

/** The order of two numbers, two texts by their code points, or two truth values; undefined of any other two. */
function scalarOrder(a: JsonValue, b: JsonValue): number | undefined {
    if (isNumber(a) && isNumber(b)) {
        return numberOrder(a, b);
    }
    if (typeof a === 'string' && typeof b === 'string') {
        return Math.sign(byCodePoints(a, b));
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
        return Number(a) - Number(b);
    }
    return undefined;
}

/** The order of two lists, or of two maps, which are ordered only where they are equal. */
function containerOrder(
    a: JsonValue[] | Map<string, JsonValue>,
    b: JsonValue[] | Map<string, JsonValue>
): number | undefined {
    if (Array.isArray(a) && Array.isArray(b)) {
        return listOrder(a, b);
    }
    return SqliteCypherValues.compare(a, b) === true ? 0 : undefined;
}

/** The order of the lists `a` and `b`: by their first pair that is not equal, which may be unordered; else by size. */
function listOrder(a: JsonValue[], b: JsonValue[]): number | undefined {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const pair = SqliteCypherValues.order(a[i], b[i]);
        if (pair !== 0) {
            return pair;
        }
    }
    return Math.sign(a.length - b.length);
}

function isNumber(value: JsonValue): value is JsonNumber {
    return value instanceof JsonNumber;
}

function double(value: JsonNumber): number {
    return Number(value.value);
}

/** A number or a text as Jackson's `asText` writes it: a double as Java writes one. */
function asText(value: string | JsonNumber): string {
    if (typeof value === 'string') {
        return value;
    }
    return typeof value.value === 'bigint' ? value.value.toString() : javaDouble(value.value);
}

/**
 * Where the number `a` comes beside `b`, by their exact values, as drivine4j compares them as `BigDecimal`s: a whole
 * number past 2^53 beside a double by every digit.
 */
function numberOrder(a: JsonNumber, b: JsonNumber): number {
    const x = a.value;
    const y = b.value;
    if (typeof x === typeof y) {
        return x < y ? -1 : x > y ? 1 : 0;
    }
    return typeof x === 'bigint' ? wholeOrder(x, y as number) : -wholeOrder(y as bigint, x);
}

/** Where the whole number `whole` comes beside the double `double`. */
function wholeOrder(whole: bigint, double: number): number {
    if (!Number.isFinite(double)) {
        return double > 0 ? -1 : 1;
    }
    const floor = Math.floor(double);
    const below = BigInt(floor);
    if (whole !== below) {
        return whole < below ? -1 : 1;
    }
    return double === floor ? 0 : -1;
}

/** The end of a list, which comes before any item's rank. */
const END = '0';

function keyOfList(list: JsonValue[], out: string[]): void {
    list.forEach((it) => keyOfItem(it, out));
    out.push(END);
}

function keyOfItem(item: JsonValue, out: string[]): void {
    if (item instanceof Map) {
        out.push('1');
        keyOfText(SqliteCypherValues.write(SqliteCypherValues.canonical(item)), out);
    } else if (Array.isArray(item)) {
        out.push('2');
        keyOfList(item, out);
    } else if (typeof item === 'string') {
        out.push('3');
        keyOfText(item, out);
    } else if (typeof item === 'boolean') {
        out.push('4', item ? '1' : '0');
    } else if (item !== null) {
        out.push('5', keyOfNumber(double(item)));
    } else {
        out.push('6');
    }
}

/** The mark a text ends at, below any character it holds, and the character it is escaped with, with itself. */
const MARK = String.fromCharCode(1);
const LOWEST = String.fromCharCode(2);
const MARK_ESCAPED = LOWEST + LOWEST;
const LOWEST_ESCAPED = LOWEST + String.fromCharCode(3);

/** The text, its two lowest characters escaped, then a mark below any character it holds. */
function keyOfText(text: string, out: string[]): void {
    out.push(text.split(LOWEST).join(LOWEST_ESCAPED).split(MARK).join(MARK_ESCAPED), MARK);
}

const BITS = new DataView(new ArrayBuffer(8));
const SIGN = -(BigInt(2) ** BigInt(63));

/** The double's bits as 16 hexadecimal digits that order as the doubles do: a positive one's sign set, a negative one's bits flipped. */
function keyOfNumber(value: number): string {
    BITS.setFloat64(0, value === 0 ? 0 : value);
    const bits = BITS.getBigInt64(0);
    const ordered = bits < BigInt(0) ? ~bits : bits | SIGN;
    return BigInt.asUintN(64, ordered).toString(16).toUpperCase().padStart(16, '0');
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

/** A number of JSON, as Jackson reads one. */
const NUMBER = /-?(?:0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;

/**
 * Reads the JSON text it is given as Jackson's `readTree` does: its first value, what follows it left unread, and none
 * where the text holds only spaces. Text that is not JSON fails.
 */
function readJson(text: string): JsonValue | undefined {
    let at = 0;
    const next = (): string | undefined => {
        while (at < text.length && ' \t\n\r'.includes(text[at])) {
            at++;
        }
        return text[at];
    };
    const unexpected = (): Error =>
        new Error(
            at >= text.length
                ? `Unexpected end of JSON text: ${text}`
                : `Unexpected character '${text[at]}' at ${at} of JSON text: ${text}`
        );
    const string = (): string => {
        let end = at + 1;
        while (end < text.length && text[end] !== '"') {
            end += text[end] === '\\' ? 2 : 1;
        }
        const literal = text.substring(at, end + 1);
        at = end + 1;
        return JSON.parse(literal);
    };
    // Whether a map or a list ends at `close` after an entry, else steps past the comma before the next.
    const closes = (close: string): boolean => {
        const c = next();
        if (c !== close && c !== ',') {
            throw unexpected();
        }
        at++;
        return c === close;
    };
    const opens = (close: string): boolean => {
        at++;
        const empty = next() === close;
        at += empty ? 1 : 0;
        return !empty;
    };
    const map = (): Map<string, JsonValue> => {
        const read = new Map<string, JsonValue>();
        for (let more = opens('}'); more; more = !closes('}')) {
            if (next() !== '"') {
                throw unexpected();
            }
            const key = string();
            if (next() !== ':') {
                throw unexpected();
            }
            at++;
            read.set(key, value());
        }
        return read;
    };
    const list = (): JsonValue[] => {
        const read: JsonValue[] = [];
        for (let more = opens(']'); more; more = !closes(']')) {
            read.push(value());
        }
        return read;
    };
    const scalar = (): JsonValue => {
        const word = WORDS.find(([it]) => text.startsWith(it, at));
        if (word) {
            at += word[0].length;
            return word[1];
        }
        NUMBER.lastIndex = at;
        const number = NUMBER.exec(text);
        if (!number) {
            throw unexpected();
        }
        at += number[0].length;
        return new JsonNumber(
            number[1] === undefined && number[2] === undefined ? BigInt(number[0]) : Number(number[0])
        );
    };
    const value = (): JsonValue => {
        const c = next();
        return c === '{' ? map() : c === '[' ? list() : c === '"' ? string() : scalar();
    };
    return next() === undefined ? undefined : value();
}

const WORDS: [string, JsonValue][] = [
    ['true', true],
    ['false', false],
    ['null', null]
];
