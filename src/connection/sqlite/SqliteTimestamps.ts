/**
 * A wall clock, a date and a time of day of no zone, as `java.time`'s `LocalDateTime` holds one: a year of the
 * proleptic Gregorian calendar, 0 for 1 BC, to the nanosecond.
 */
export interface Clock {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly nano: number;
}

/**
 * A value `java.time` refuses: `DateTimeException`, as of a date past the years it holds; and, where it names the text
 * it was asked to read, `DateTimeParseException`.
 */
export class TemporalError extends Error {
    constructor(
        message: string,
        readonly parsed?: string
    ) {
        super(message);
    }
}

/**
 * A timestamp as compiled Cypher holds one on SQLite, which has no type for it: the text of a wall clock to the
 * microsecond, `2024-03-15T10:30:00.000000`, every one as long as every other, so two compare and order as their
 * clocks do, as text. drivine4j's `SqliteTimestamps`, with the calendar `java.time` works out that the functions which
 * read and write timestamps ask of one.
 */
export const SqliteTimestamps = {
    /** The timestamp `text`, a space taken for the `T`, or null where it is null. */
    read(text: string | null): Clock | null {
        return text === null ? null : SqliteTimestamps.dateTime(text.replace(/ /g, 'T'));
    },

    /** `clock` as a timestamp's text, to the microsecond, its fraction cut there. */
    write(clock: Clock): string {
        return (
            `${yearText(clock.year)}-${two(clock.month)}-${two(clock.day)}T${two(clock.hour)}:${two(clock.minute)}:` +
            `${two(clock.second)}.${String(Math.floor(clock.nano / 1000)).padStart(6, '0')}`
        );
    },

    /** The ISO date and time `text`, as `LocalDateTime.parse` reads it. */
    dateTime(text: string): Clock {
        const match = new RegExp(`^${DATE}T${TIME}$`, 'i').exec(text);
        if (!match) {
            throw unparsed(text);
        }
        return clock(text, match.slice(1));
    },

    /** The ISO date `text` at its midnight, as `LocalDate.parse(text).atStartOfDay()` reads it. */
    date(text: string): Clock {
        const match = new RegExp(`^${DATE}$`).exec(text);
        if (!match) {
            throw unparsed(text);
        }
        return clock(text, [...match.slice(1), '00', '00']);
    },

    /** The ISO time of day `text` on 1970-01-01, as `LocalTime.parse(text).atDate(EPOCH_DAY)` reads it. */
    time(text: string): Clock {
        const match = new RegExp(`^${TIME}$`).exec(text);
        if (!match) {
            throw unparsed(text);
        }
        return clock(text, ['1970', '01', '01', ...match.slice(1)]);
    },

    /**
     * The offset `text` ends with, `Z` or `±hh:mm[:ss]`, in seconds ahead of UTC, as an `OffsetDateTime`'s is read: past
     * ±18:00, or of minutes or seconds past 59, it is refused.
     */
    offset(text: string, whole: string): number {
        if (text.toUpperCase() === 'Z') {
            return 0;
        }
        const match = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
        if (!match) {
            throw unparsed(whole);
        }
        const [, sign, h, m, s = '0'] = match;
        const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
        if (Number(m) > 59 || Number(s) > 59 || seconds > 18 * 3600) {
            throw new TemporalError(
                `Text '${whole}' could not be parsed: Zone offset not in valid range: ${text}`,
                whole
            );
        }
        return sign === '-' ? -seconds : seconds;
    },

    epochDay,
    ofEpochDay,
    isLeap,
    lengthOfMonth,

    /** The ISO day of the week of the date, from 1 for Monday to 7. */
    dayOfWeek(clock: Clock): number {
        return floorMod(epochDay(clock.year, clock.month, clock.day) + 3, 7) + 1;
    },

    /** The day of the year of the date, from 1. */
    dayOfYear(clock: Clock): number {
        return epochDay(clock.year, clock.month, clock.day) - epochDay(clock.year, 1, 1) + 1;
    },

    /** The year of the ISO week of the date, and the week, from 1: the year and week of its week's Thursday. */
    isoWeek(clock: Clock): { year: number; week: number } {
        const thursday = ofEpochDay(
            epochDay(clock.year, clock.month, clock.day) + 4 - SqliteTimestamps.dayOfWeek(clock)
        );
        return { year: thursday.year, week: Math.floor((SqliteTimestamps.dayOfYear(thursday) - 1) / 7) + 1 };
    },

    /** The nanoseconds of the clock since 1970-01-01T00:00, a whole number of any size. */
    epochNanos(clock: Clock): bigint {
        return BigInt(epochDay(clock.year, clock.month, clock.day)) * NANOS_PER_DAY + nanoOfDay(clock);
    },

    /** The clock `nanos` nanoseconds after 1970-01-01T00:00, refused past the years `java.time` holds. */
    ofEpochNanos(nanos: bigint): Clock {
        let days = nanos / NANOS_PER_DAY;
        let rest = nanos % NANOS_PER_DAY;
        if (rest < BigInt(0)) {
            days -= BigInt(1);
            rest += NANOS_PER_DAY;
        }
        if (days < MIN_EPOCH_DAY || days > MAX_EPOCH_DAY) {
            throw new TemporalError(
                `Invalid value for EpochDay (valid values ${MIN_EPOCH_DAY} - ${MAX_EPOCH_DAY}): ${days}`
            );
        }
        const date = ofEpochDay(Number(days));
        const of = Number(rest);
        const seconds = Math.floor(of / 1e9);
        return {
            ...date,
            hour: Math.floor(seconds / 3600),
            minute: Math.floor(seconds / 60) % 60,
            second: seconds % 60,
            nano: Number(rest % BigInt(1e9))
        };
    },

    nanoOfDay
};

/** A year as `uuuu` writes one: four digits at least, a sign before one past 9999, and before one below 0. */
function yearText(year: number): string {
    if (year > 9999) {
        return `+${year}`;
    }
    return year < 0 ? `-${String(-year).padStart(4, '0')}` : String(year).padStart(4, '0');
}

function two(value: number): string {
    return String(value).padStart(2, '0');
}

/** A year as ISO 8601 writes one, as `java.time` reads it: four digits, a sign before more, `-` before fewer. */
const DATE = '((?:\\d{4})|(?:\\+\\d{5,10})|(?:-\\d{4,10}))-(\\d{2})-(\\d{2})';

/** A time of day: hours and minutes, then its seconds and their fraction where it has them. */
const TIME = '(\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{0,9}))?)?';

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

const MAX_YEAR = 999_999_999;

function unparsed(text: string): TemporalError {
    return new TemporalError(`Text '${text}' could not be parsed at index 0`, text);
}

/** The clock of the fields `text` was read into, each checked as `java.time` checks it. */
function clock(text: string, fields: (string | undefined)[]): Clock {
    const [year, month, day, hour, minute, second = '0', fraction = ''] = fields;
    const value: Clock = {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
        second: Number(second),
        nano: Number(fraction.padEnd(9, '0'))
    };
    const refused = (because: string): TemporalError =>
        new TemporalError(`Text '${text}' could not be parsed: ${because}`, text);
    const range = (field: string, low: number, high: number, of: number): void => {
        if (of < low || of > high) {
            throw refused(`Invalid value for ${field} (valid values ${low} - ${high}): ${of}`);
        }
    };
    range('Year', -MAX_YEAR, MAX_YEAR, value.year);
    range('MonthOfYear', 1, 12, value.month);
    range('DayOfMonth', 1, 31, value.day);
    range('HourOfDay', 0, 23, value.hour);
    range('MinuteOfHour', 0, 59, value.minute);
    range('SecondOfMinute', 0, 59, value.second);
    if (value.day > lengthOfMonth(value.year, value.month)) {
        throw refused(
            value.day === 29
                ? `Invalid date 'February 29' as '${value.year}' is not a leap year`
                : `Invalid date '${MONTHS[value.month - 1]} ${value.day}'`
        );
    }
    return value;
}

function isLeap(year: number): boolean {
    return (year & 3) === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function lengthOfMonth(year: number, month: number): number {
    return month === 2 ? (isLeap(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function floorMod(a: number, b: number): number {
    return ((a % b) + b) % b;
}

/** The days from 1970-01-01 to the date, as `LocalDate.toEpochDay` counts them. */
function epochDay(year: number, month: number, day: number): number {
    let total = 365 * year;
    if (year >= 0) {
        total += Math.trunc((year + 3) / 4) - Math.trunc((year + 99) / 100) + Math.trunc((year + 399) / 400);
    } else {
        total -= Math.trunc(year / -4) - Math.trunc(year / -100) + Math.trunc(year / -400);
    }
    total += Math.trunc((367 * month - 362) / 12);
    total += day - 1;
    if (month > 2) {
        total -= isLeap(year) ? 1 : 2;
    }
    return total - DAYS_0000_TO_1970;
}

const DAYS_0000_TO_1970 = 719_528;
const DAYS_PER_CYCLE = 146_097;
const MIN_EPOCH_DAY = BigInt(-365_243_219_162);
const MAX_EPOCH_DAY = BigInt(365_241_780_471);
const NANOS_PER_DAY = BigInt(86_400) * BigInt(1e9);

/** The date `days` from 1970-01-01, as `LocalDate.ofEpochDay` works it out, at its midnight. */
function ofEpochDay(days: number): Clock {
    let zeroDay = days + DAYS_0000_TO_1970 - 60;
    let adjust = 0;
    if (zeroDay < 0) {
        const cycles = Math.trunc((zeroDay + 1) / DAYS_PER_CYCLE) - 1;
        adjust = cycles * 400;
        zeroDay += -cycles * DAYS_PER_CYCLE;
    }
    const daysBefore = (y: number): number => 365 * y + Math.trunc(y / 4) - Math.trunc(y / 100) + Math.trunc(y / 400);
    let year = Math.trunc((400 * zeroDay + 591) / DAYS_PER_CYCLE);
    let dayOfYear = zeroDay - daysBefore(year);
    if (dayOfYear < 0) {
        year--;
        dayOfYear = zeroDay - daysBefore(year);
    }
    year += adjust;
    const marchMonth = Math.trunc((dayOfYear * 5 + 2) / 153);
    const month = ((marchMonth + 2) % 12) + 1;
    const day = dayOfYear - Math.trunc((marchMonth * 306 + 5) / 10) + 1;
    year += Math.trunc(marchMonth / 10);
    if (year < -MAX_YEAR || year > MAX_YEAR) {
        throw new TemporalError(`Invalid value for Year (valid values -${MAX_YEAR} - ${MAX_YEAR}): ${year}`);
    }
    return { year, month, day, hour: 0, minute: 0, second: 0, nano: 0 };
}

function nanoOfDay(clock: Clock): bigint {
    return BigInt((clock.hour * 3600 + clock.minute * 60 + clock.second) * 1e9 + clock.nano);
}
