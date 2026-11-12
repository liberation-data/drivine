/**
 * JSON read with each whole number past 2^53, within a long's range, a `bigint` of its digits, as Drivine binds one,
 * where `JSON.parse` would round it to the nearest JavaScript number: 9007199254740993 to 9007199254740992
 * (liberation-data/drivine#735). 2^53 itself is a `bigint` too, as 2^53 + 1 is read as it. A safe integer, under 2^53
 * either way, a number with a fraction or an exponent, and a whole number past a long's range, which Cypher holds as a
 * float, are read as JSON.parse reads them. The digits come from the source text JSON.parse hands its reviver, in
 * Node from 21 and in current browsers; where none is handed, the number is read as JSON.parse reads it.
 */

/** What JSON.parse hands a reviver beside the value, where it gives the source text. */
export interface ReviverContext {
    source?: string;
}

/** A long's range: Cypher's integers are 64-bit, and a whole number outside it is a float, as Neo4j reads one. */
const LONG_MIN = -(BigInt(2) ** BigInt(63));
const LONG_MAX = BigInt(2) ** BigInt(63) - BigInt(1);

/** `value` read as {@link parseExactIntegers} reads it, by its `context`'s source text. */
export function exactInteger(value: unknown, context?: ReviverContext): unknown {
    if (
        typeof value !== 'number' ||
        Number.isSafeInteger(value) ||
        context?.source === undefined ||
        !/^-?[0-9]+$/.test(context.source)
    ) {
        return value;
    }
    const whole = BigInt(context.source);
    return whole >= LONG_MIN && whole <= LONG_MAX ? whole : value;
}

const json = JSON as unknown as {
    parse(text: string, reviver: (key: string, value: unknown, context?: ReviverContext) => unknown): any;
};

/** A run of 16 digits: no whole number from 2^53 on, which has 16, is written with fewer. */
const SIXTEEN_DIGITS = /[0-9]{16}/;

/**
 * The JSON `text`, each whole number past 2^53 in it, at any depth, a `bigint` (see {@link exactInteger}). A text with
 * no run of 16 digits holds none, and is read by JSON.parse alone, with no reviver to call for each value: most rows.
 */
export function parseExactIntegers(text: string): any {
    if (!SIXTEEN_DIGITS.test(text)) {
        return JSON.parse(text);
    }
    return json.parse(text, (_key, value, context) => exactInteger(value, context));
}
