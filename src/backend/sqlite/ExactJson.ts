import { ReviverContext } from '@/utils/ExactIntegers';

/**
 * JSON read and written with each number as the text it is written as, so a property no write touches keeps its text
 * (`1.50` stays `1.50`, and a whole number past 2^53 keeps its digits), as drivine4j's write function keeps it. A number
 * is read as an {@link ExactNumber}; two are the same where their values are, as Postgres's `jsonb` compares them.
 *
 * It reads a number's text by the source text JSON.parse hands its reviver, and writes it back by JSON.rawJSON: both
 * are in every Node that has `node:sqlite`.
 */
export class ExactNumber {
    constructor(readonly text: string) {}

    /** The number's value as sign, digits and exponent, so `1.5`, `1.50` and `15e-1` are one. */
    get canonical(): string {
        const match = /^(-?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(this.text);
        if (!match) {
            return this.text;
        }
        const [, sign, whole, fraction = '', exponent = '0'] = match;
        let digits = `${whole}${fraction}`.replace(/^0+/, '');
        if (!digits) {
            return '0';
        }
        let scale = Number(exponent) - fraction.length;
        const trailing = /0+$/.exec(digits)?.[0].length ?? 0;
        digits = digits.slice(0, digits.length - trailing);
        scale += trailing;
        return `${sign}${digits}e${scale}`;
    }

    toString(): string {
        return this.text;
    }
}

const json = JSON as unknown as {
    parse(text: string, reviver: (key: string, value: unknown, context?: ReviverContext) => unknown): any;
    rawJSON(text: string): unknown;
};

export const ExactJson = {
    /** The JSON `text`, each number an ExactNumber. */
    parse(text: string): any {
        return json.parse(text, (_key, value, context) =>
            typeof value === 'number' ? new ExactNumber(context?.source ?? String(value)) : value
        );
    },

    /** `value` as JSON, each ExactNumber as its text. No character is escaped that JSON does not require. */
    stringify(value: unknown): string {
        return JSON.stringify(value, (_key, it) => (it instanceof ExactNumber ? json.rawJSON(it.text) : it));
    },

    /** Whether `a` and `b` hold the same JSON: a number the same as a number of its value however it is written. */
    same(a: unknown, b: unknown): boolean {
        if (a instanceof ExactNumber || b instanceof ExactNumber) {
            return a instanceof ExactNumber && b instanceof ExactNumber && a.canonical === b.canonical;
        }
        if (Array.isArray(a) || Array.isArray(b)) {
            return Array.isArray(a) && Array.isArray(b) && sameItems(a, b);
        }
        return isObject(a) && isObject(b) ? sameEntries(a, b) : a === b;
    }
};

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

/** Whether two arrays hold the same items in the same order. */
function sameItems(a: unknown[], b: unknown[]): boolean {
    return a.length === b.length && a.every((it, i) => ExactJson.same(it, b[i]));
}

/** Whether two objects hold the same keys, each with the same value, in any order. */
function sameEntries(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const keys = Object.keys(a);
    return (
        keys.length === Object.keys(b).length &&
        keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && ExactJson.same(a[key], b[key]))
    );
}

/**
 * Text in the order of its code points, which is the byte order Postgres's `COLLATE "C"` sorts labels in, and the order
 * drivine4j writes them in. JavaScript's own order is of UTF-16 code units, which differs past the basic plane.
 */
export function byCodePoints(a: string, b: string): number {
    const x = [...a];
    const y = [...b];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
        if (d !== 0) {
            return d;
        }
    }
    return x.length - y.length;
}
