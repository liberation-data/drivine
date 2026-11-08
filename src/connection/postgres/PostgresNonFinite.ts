import { DrivineError } from '@/DrivineError';

/** Postgres's `json` and `jsonb`, by type OID. */
const JSON_OID = 114;
const JSONB_OID = 3802;

/**
 * A decimal, read from its text: `sign` times 0.`digits` times 10 to the `point`, `digits` with no leading or trailing
 * zero, and none for zero.
 */
interface Decimal {
    readonly sign: -1 | 0 | 1;
    readonly digits: string;
    readonly point: number;
}

const NUMBER = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** The decimal JSON's number text `text` is, exactly; undefined where it is no JSON number. */
function decimal(text: string): Decimal | undefined {
    const match = NUMBER.exec(text);
    if (!match) {
        return undefined;
    }
    const all = match[2] + (match[3] ?? '');
    const lead = all.length - all.replace(/^0+/, '').length;
    const digits = all.slice(lead).replace(/0+$/, '');
    if (digits === '') {
        return { sign: 0, digits, point: 0 };
    }
    return {
        sign: match[1] === '-' ? -1 : 1,
        digits,
        point: match[2].length + Number(match[4] ?? 0) - lead
    };
}

/** Which of `a` and `b` is the greater: less than 0 where `b`, 0 where they are equal, more than 0 where `a`. */
function compare(a: Decimal, b: Decimal): number {
    if (a.sign !== b.sign) {
        return a.sign - b.sign;
    }
    if (a.sign === 0) {
        return 0;
    }
    const magnitude =
        a.point !== b.point
            ? a.point - b.point
            : a.digits === b.digits
            ? 0
            : a.digits.padEnd(b.digits.length, '0') < b.digits.padEnd(a.digits.length, '0')
            ? -1
            : 1;
    return a.sign * magnitude;
}

/** The number that stands for NaN, 2e309 + 0.5, as drivine4j's compiler writes it on Postgres: `to_jsonb(2e309 + 0.5)`. */
const NOT_A_NUMBER = decimal(`2${'0'.repeat(309)}.5`)!;

/** Where the numbers that stand for the infinities begin, past any double's: `±(1e309 + 0.5)` are written for them. */
const INFINITE = decimal('1e309')!;
const NEGATIVE_INFINITE: Decimal = { ...INFINITE, sign: -1 };

/**
 * The double the number written `text`, in the rows of a statement given NaN or an infinity, stands for: NaN where it is
 * exactly the number that stands for NaN, and an infinity where it is past any double's, as drivine4j's
 * `PostgresCypherCompiler.read` reads it, comparing decimals; undefined for any other, which is the number it is.
 */
export function nonFiniteOf(text: string): number | undefined {
    const number = decimal(text);
    if (!number) {
        return undefined;
    }
    if (compare(number, NOT_A_NUMBER) === 0) {
        return NaN;
    }
    if (compare(number, INFINITE) >= 0) {
        return Infinity;
    }
    if (compare(number, NEGATIVE_INFINITE) <= 0) {
        return -Infinity;
    }
    return undefined;
}

/** Whether `JSON.parse` hands a reviver each value's source text: from Node 21. */
const SOURCE_TEXT =
    (JSON.parse as (text: string, reviver: (key: string, value: any, context?: any) => any) => any)(
        '0',
        (_key, _value, context) => context?.source
    ) === '0';

/**
 * A reviver that gives each number that stands for NaN or an infinity as the double it is (see {@link nonFiniteOf}). A
 * number JSON.parse reads as finite is under any double's greatest, 1.8e308, so stands for neither, and is kept.
 */
function revived(_key: string, value: any, context?: { source?: string }): any {
    if (typeof value !== 'number' || Number.isFinite(value)) {
        return value;
    }
    return nonFiniteOf(context!.source!) ?? value;
}

/**
 * The JSON text `text`, as Postgres writes a `json` or `jsonb` value, with each number that stands for NaN or an
 * infinity the double it is, as drivine4j's compiler writes them on Postgres where a statement is given one
 * (liberation-data/drivine#673): `jsonb` holds neither.
 */
export function readNonFiniteJson(text: string): any {
    requireSourceText();
    return JSON.parse(text, revived as (key: string, value: any) => any);
}

/** Fails where JSON.parse gives a reviver no source text: the numbers would be read as JSON.parse reads them, wrongly. */
function requireSourceText(): void {
    if (!SOURCE_TEXT) {
        throw new DrivineError(
            `Reading NaN and the infinities from Postgres needs a JSON.parse that gives a reviver each value's source ` +
                `text, from Node 21; this is Node ${process.versions.node}.`
        );
    }
}

/** What a client reads a column's type by: `pg`'s `getTypeParser`. */
export interface TypeParsers {
    getTypeParser(oid: number, format?: any): any;
}

/**
 * The type parsers a statement given NaN or an infinity runs with, as `pg`'s per-query `types`: `json` and `jsonb` read
 * by {@link readNonFiniteJson}, and each other type as `parsers`, the client's own, read it. Given to that statement
 * alone, never set for the process: it would reach every statement, a user's own SQL and other libraries' too. Fails
 * before the statement runs where the numbers can't be read right.
 */
export function nonFiniteTypes(parsers: TypeParsers): TypeParsers {
    requireSourceText();
    return {
        getTypeParser: (oid: number, format?: any) =>
            (oid === JSON_OID || oid === JSONB_OID) && (format ?? 'text') === 'text'
                ? readNonFiniteJson
                : parsers.getTypeParser(oid, format)
    };
}
