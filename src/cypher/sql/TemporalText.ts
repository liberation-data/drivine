import { Temporal } from '@/cypher/sql/Temporal';

/** A wall clock, as `java.time` reads one: the date, then the time of day with its fraction of a second in micros. */
interface Clock {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    micros: number;
}

const MONTHS = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER'
];

/** A decimal's scale: a duration's parts are worked out in whole units of 10^-18, as exactly as a `BigDecimal`. */
const SCALE = BigInt(10) ** BigInt(18);

/**
 * The canonical text of `kind` of the text `text`, worked out as the store's SQL would work it out, for a value the
 * statement writes: undefined where the text is of no temporal kind. A text of the kind's shape that is no such value
 * (`2024-02-30`) is refused as `java.time` refuses it, with a `RangeError` that says why.
 */
export function canonicalTemporal(text: string, kind: Temporal): string | undefined {
    if (kind === Temporal.DURATION) {
        const groups = new RegExp(Temporal.DURATION.pattern).exec(text);
        return groups ? canonicalDuration(groups) : undefined;
    }
    const from = Temporal.instants.find((it) => new RegExp(it.pattern).test(text));
    if (!from) {
        return undefined;
    }
    const written = from.zoned ? new RegExp(Temporal.OFFSET).exec(text)![0] : undefined;
    const local = written !== undefined ? text.substring(0, text.length - written.length) : text;
    const offset = written?.replace(/^[+-]00:?00$/, 'Z').replace(/^([+-][0-9]{2})([0-9]{2})$/, '$1:$2');
    return textOf(parsed(text, local, from), kind, kind.zoned ? offset ?? 'Z' : '');
}

/** The text of `kind` the wall clock `clock` reads, with `zone`, as the store's SQL writes one. */
function textOf(clock: Clock, kind: Temporal, zone: string): string {
    const fraction =
        clock.micros === 0
            ? ''
            : clock.micros % 1000 === 0
            ? `.${pad(clock.micros / 1000, 3)}`
            : `.${pad(clock.micros, 6)}`;
    const time = `${pad(clock.hour, 2)}:${pad(clock.minute, 2)}:${pad(clock.second, 2)}${fraction}`;
    const date = `${pad(clock.year, 4)}-${pad(clock.month, 2)}-${pad(clock.day, 2)}`;
    if (kind === Temporal.DATE) {
        return date;
    }
    if (kind === Temporal.LOCAL_DATE_TIME || kind === Temporal.DATE_TIME) {
        return `${date}T${time}${zone}`;
    }
    return `${time}${zone}`;
}

/** The wall clock the text `local`, `text` without its offset, reads as `from`: a date at its midnight, a time on 1970-01-01. */
function parsed(text: string, local: string, from: Temporal): Clock {
    const [datePart, timePart] =
        from === Temporal.DATE
            ? [local, undefined]
            : from === Temporal.LOCAL_DATE_TIME || from === Temporal.DATE_TIME
            ? local.split('T')
            : ['1970-01-01', local];
    const [year, month, day] = datePart.split('-').map(Number);
    checked(text, 'MonthOfYear', month, 1, 12);
    checked(text, 'DayOfMonth', day, 1, 31);
    if (day > daysIn(year, month)) {
        refuse(text, `Invalid date '${MONTHS[month - 1]} ${day}'`);
    }
    const clock: Clock = { year, month, day, hour: 0, minute: 0, second: 0, micros: 0 };
    if (timePart === undefined) {
        return clock;
    }
    const [hms, digits = ''] = timePart.split('.');
    const [hour, minute, second = 0] = hms.split(':').map(Number);
    checked(text, 'HourOfDay', hour, 0, 23);
    checked(text, 'MinuteOfHour', minute, 0, 59);
    checked(text, 'SecondOfMinute', second, 0, 59);
    if (digits.length > 9) {
        refuse(text, 'more than nine digits of a fraction of a second');
    }
    return { ...clock, hour, minute, second, micros: Number(digits.padEnd(9, '0').substring(0, 6) || '0') };
}

function checked(text: string, field: string, value: number, min: number, max: number): void {
    if (value < min || value > max) {
        refuse(text, `Invalid value for ${field} (valid values ${min} - ${max}): ${value}`);
    }
}

function refuse(text: string, why: string): never {
    throw new RangeError(`Text '${text}' could not be parsed: ${why}`);
}

function daysIn(year: number, month: number): number {
    if (month === 2) {
        return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
    }
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function pad(value: number, digits: number): string {
    return String(value).padStart(digits, '0');
}

/** The canonical text of the duration whose pattern's groups are `groups`, as the store's SQL writes one. */
function canonicalDuration(groups: RegExpExecArray): string {
    const part = (group: number): bigint => (groups[group] ? decimal(groups[group]) : BigInt(0));
    const sign = groups[1] === '-' ? BigInt(-1) : BigInt(1);
    const m0 = sign * (part(3) * BigInt(12) + part(5));
    const d0 = sign * (part(7) * BigInt(7) + part(9));
    const s0 = sign * (part(12) * BigInt(3600) + part(14) * BigInt(60) + part(16));
    const monthDays = decimal('30.436875');
    const months = whole(m0);
    const daysExact = d0 + ((m0 - months) * monthDays) / SCALE;
    const days = whole(daysExact);
    const seconds = s0 + (daysExact - days) * BigInt(86400);
    const zero = BigInt(0);
    if (months === zero && days === zero && seconds === zero) {
        return 'PT0S';
    }
    const years = whole(months / BigInt(12));
    const hours = whole(seconds / BigInt(3600));
    const minutes = whole((seconds - hours * BigInt(3600)) / BigInt(60));
    const secs = seconds - hours * BigInt(3600) - minutes * BigInt(60);
    const unit = (value: bigint, letter: string): string => (value !== zero ? plain(value) + letter : '');
    const time = seconds !== zero ? `T${unit(hours, 'H')}${unit(minutes, 'M')}${unit(secs, 'S')}` : '';
    return `P${unit(years, 'Y')}${unit(months - years * BigInt(12), 'M')}${unit(days, 'D')}${time}`;
}

/** A decimal's text, `-1.5`, in whole units of the scale: a `SyntaxError` where it is no number. */
function decimal(text: string): bigint {
    if (!/^-?([0-9]+\.?[0-9]*|\.[0-9]+)$/.test(text)) {
        // As `BigDecimal` refuses it: the duration is no duration.
        throw new SyntaxError(`${text} is no number`);
    }
    const negative = text.startsWith('-');
    const [integral, fraction = ''] = (negative ? text.substring(1) : text).split('.');
    const value = BigInt(integral || '0') * SCALE + BigInt(fraction.padEnd(18, '0').substring(0, 18));
    return negative ? -value : value;
}

/** A value in units of the scale, its fraction taken off, toward zero. */
function whole(value: bigint): bigint {
    return (value / SCALE) * SCALE;
}

/** A value in units of the scale, written as `BigDecimal.stripTrailingZeros().toPlainString()` writes it. */
function plain(value: bigint): string {
    const negative = value < BigInt(0);
    const magnitude = negative ? -value : value;
    const integral = (magnitude / SCALE).toString();
    const fraction = (magnitude % SCALE).toString().padStart(18, '0').replace(/0+$/, '');
    return `${negative ? '-' : ''}${integral}${fraction ? `.${fraction}` : ''}`;
}
