import { javaDouble } from '@/connection/sqlite/JavaDouble';

/** How a decimal is rounded to fewer places: Java's `RoundingMode`, by its name. */
export type RoundingMode = 'UP' | 'DOWN' | 'CEILING' | 'FLOOR' | 'HALF_UP' | 'HALF_DOWN' | 'HALF_EVEN' | 'UNNECESSARY';

const MODES: RoundingMode[] = ['UP', 'DOWN', 'CEILING', 'FLOOR', 'HALF_UP', 'HALF_DOWN', 'HALF_EVEN', 'UNNECESSARY'];

/**
 * A decimal number, its digits a whole number and its scale the places of them after the point, as Java's `BigDecimal`
 * holds one: what drivine4j rounds and writes numbers with in `round` and `to_char`, in decimal, so 2.345 is halfway
 * between 2.34 and 2.35, where binary arithmetic finds it just below. Only what those functions ask of one.
 */
export class SqliteDecimal {
    /** The decimal `text` writes, as `new BigDecimal(text)` reads it: `-1.25`, `1.0e+20`, `12E-3`. */
    static of(text: string): SqliteDecimal {
        const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
        if (!match || (!match[2] && !match[3])) {
            throw new Error(`'${text}' is no decimal number.`);
        }
        const [, sign, whole, fraction = '', exponent = '0'] = match;
        const scale = fraction.length - Number(exponent);
        if (!Number.isSafeInteger(scale) || Math.abs(scale) > 2 ** 31 - 1) {
            throw new Error(`'${text}' has an exponent past a decimal number's.`);
        }
        return new SqliteDecimal(BigInt(`${sign === '-' ? '-' : ''}${whole}${fraction}` || '0'), scale);
    }

    /** The whole number `value`, as `BigDecimal.valueOf(long)` makes it. */
    static ofWhole(value: bigint): SqliteDecimal {
        return new SqliteDecimal(value, 0);
    }

    /** The double `value` as Java writes it, as `BigDecimal.valueOf(double)` makes it: 2.5 of scale 1, 1.0E10 of -9. */
    static ofDouble(value: number): SqliteDecimal {
        return SqliteDecimal.of(javaDouble(value));
    }

    constructor(
        readonly unscaled: bigint,
        readonly scale: number
    ) {}

    signum(): number {
        return this.unscaled > ZERO ? 1 : this.unscaled < ZERO ? -1 : 0;
    }

    /** The decimal to `scale` places, rounded by `mode` where it has more. */
    setScale(scale: number, mode: RoundingMode = 'UNNECESSARY'): SqliteDecimal {
        if (scale >= this.scale) {
            return new SqliteDecimal(this.unscaled * TEN ** BigInt(scale - this.scale), scale);
        }
        return new SqliteDecimal(rounded(this.unscaled, this.scale - scale, mode), scale);
    }

    /** The decimal without the zeros its digits end with: zero is of scale 0. */
    stripTrailingZeros(): SqliteDecimal {
        if (this.unscaled === ZERO) {
            return new SqliteDecimal(ZERO, 0);
        }
        let unscaled = this.unscaled;
        let scale = this.scale;
        while (unscaled % TEN === ZERO) {
            unscaled /= TEN;
            scale--;
        }
        return new SqliteDecimal(unscaled, scale);
    }

    abs(): SqliteDecimal {
        return this.unscaled < ZERO ? new SqliteDecimal(-this.unscaled, this.scale) : this;
    }

    /** The double nearest the decimal, as `BigDecimal.doubleValue` gives it. */
    toDouble(): number {
        return this.unscaled === ZERO ? 0 : Number(`${this.unscaled}e${-this.scale}`);
    }

    /** The decimal written out with no exponent, as `BigDecimal.toPlainString` writes it. */
    toPlainString(): string {
        const negative = this.unscaled < ZERO;
        const digits = (negative ? -this.unscaled : this.unscaled).toString();
        const sign = negative ? '-' : '';
        if (this.scale <= 0) {
            return this.unscaled === ZERO ? '0' : `${sign}${digits}${'0'.repeat(-this.scale)}`;
        }
        const padded = digits.padStart(this.scale + 1, '0');
        return `${sign}${padded.substring(0, padded.length - this.scale)}.${padded.substring(
            padded.length - this.scale
        )}`;
    }
}

/** The rounding mode `name`, as `RoundingMode.valueOf` reads it. */
export function roundingMode(name: string | null): RoundingMode {
    if (name === null) {
        throw new Error('round() is given no rounding mode.');
    }
    if (!(MODES as string[]).includes(name)) {
        throw new Error(`No enum constant java.math.RoundingMode.${name}`);
    }
    return name as RoundingMode;
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

/** `unscaled` with its last `places` digits taken off, rounded by `mode`. */
function rounded(unscaled: bigint, places: number, mode: RoundingMode): bigint {
    const magnitude = unscaled < ZERO ? -unscaled : unscaled;
    let quotient: bigint;
    let remainder: bigint;
    // Past its digits, the quotient is 0 and the remainder below a half: 10^places need not be worked out.
    let half: number;
    if (places > magnitude.toString().length + 1) {
        quotient = ZERO;
        remainder = unscaled;
        half = -1;
    } else {
        const divisor = TEN ** BigInt(places);
        quotient = unscaled / divisor;
        remainder = unscaled % divisor;
        const twice = (remainder < ZERO ? -remainder : remainder) * TWO;
        half = twice < divisor ? -1 : twice > divisor ? 1 : 0;
    }
    if (remainder === ZERO) {
        return quotient;
    }
    const positive = unscaled > ZERO;
    const away = {
        UP: true,
        DOWN: false,
        CEILING: positive,
        FLOOR: !positive,
        HALF_UP: half >= 0,
        HALF_DOWN: half > 0,
        HALF_EVEN: half > 0 || (half === 0 && quotient % TWO !== ZERO),
        UNNECESSARY: undefined
    }[mode];
    if (away === undefined) {
        throw new Error('Rounding necessary');
    }
    return away ? quotient + (positive ? ONE : -ONE) : quotient;
}
