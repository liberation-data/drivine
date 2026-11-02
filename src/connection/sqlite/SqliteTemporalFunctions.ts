import type { SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { SqliteArguments } from '@/connection/sqlite/SqliteArguments';
import { SqliteDecimal } from '@/connection/sqlite/SqliteDecimal';
import { Clock, SqliteTimestamps, TemporalError } from '@/connection/sqlite/SqliteTimestamps';

/** The offset a zoned text ends with: `Temporal.OFFSET`, drivine4j's and the compiler's. */
const OFFSET = /(Z|[+-][0-9]{2}:?[0-9]{2})$/;

/** The units of many years, and how many: `TemporalSql.YEARS_OF`. */
const YEARS_OF: Record<string, number> = { millennium: 1000, century: 100, decade: 10 };

const NANOS_PER_MICRO = BigInt(1000);
const NANOS_PER_SECOND = BigInt(1e9);

/**
 * `drivine_temporal(operation, …)`: what compiled Cypher asks of a timestamp on SQLite (see SqliteTimestamps), which has
 * no type for one and no arithmetic of the calendar, worked out as `java.time` works it out, as drivine4j's
 * `SqliteTemporalFunction` does, and as `SqliteTemporalSql` names each operation. Null where an argument is.
 *
 * - `local(text, kind)`: the wall clock the ISO text of a temporal kind (`DATE`, `DATE_TIME` …) reads, its offset left
 *   out: a date at its midnight, a time of day on 1970-01-01.
 * - `utc(text, kind)`: the moment the text is, in UTC; for a kind of no offset, its wall clock.
 * - `extract(timestamp, field)`: `YEAR`, `MONTH`, `DAY`, `HOUR` or `MINUTE` as a whole number, `SECOND` with its fraction.
 * - `day_of_week(timestamp)`: the ISO day of the week, from 1 for Monday to 7.
 * - `add_months(timestamp, months)`: so many months later, a day past the month's end its last day.
 * - `add_time(timestamp, days, seconds)`: so many days and seconds later.
 * - `months_between(from, to)`: the whole months a calendar counts from one to the other, negative where `to` is before.
 * - `seconds_between(from, to)`: the seconds from one to the other, with their fraction.
 * - `truncate(timestamp, unit)`: cut to the `millennium`, `century`, `decade`, `year`, ISO `weekYear`, `quarter`, `month`,
 *   ISO `week`, `day`, `hour`, `minute`, `second`, `millisecond` or `microsecond`, as Neo4j cuts.
 *
 * A text of the kind's shape that names no such value, a 30th of February, fails the statement, as it does on Postgres.
 */
export function temporal(...args: SqliteValue[]): SqliteValue {
    const operation = SqliteArguments.text(args[0]);
    if (args.slice(1).some((it) => it == null)) {
        return null;
    }
    if (operation === null || !Object.prototype.hasOwnProperty.call(OPERATIONS, operation)) {
        throw new Error(`drivine_temporal has no operation ${operation}.`);
    }
    try {
        return OPERATIONS[operation](new Arguments(args));
    } catch (e) {
        if (e instanceof TemporalError && e.parsed !== undefined) {
            throw new Error(`'${e.parsed}' is no temporal value: ${e.message}`);
        }
        throw e;
    }
}

/** The arguments of an operation, read as it reads them. */
class Arguments {
    constructor(readonly values: SqliteValue[]) {}

    text(i: number): string {
        return SqliteArguments.text(this.values[i])!;
    }

    clock(i: number): Clock {
        return SqliteTimestamps.read(this.text(i))!;
    }
}

/** Each operation of `drivine_temporal`, by its name. */
const OPERATIONS: Record<string, (args: Arguments) => SqliteValue> = {
    local: (args) => SqliteTimestamps.write(local(args.text(1), kind(args.text(2)))),
    utc: (args) => SqliteTimestamps.write(utc(args.text(1), kind(args.text(2)))),
    extract: (args) => extract(args.clock(1), args.text(2)),
    day_of_week: (args) => BigInt(SqliteTimestamps.dayOfWeek(args.clock(1))),
    add_months: (args) => SqliteTimestamps.write(plusMonths(args.clock(1), whole(args.values[2]))),
    add_time: (args) =>
        SqliteTimestamps.write(
            SqliteTimestamps.ofEpochNanos(
                SqliteTimestamps.epochNanos(plusDays(args.clock(1), whole(args.values[2]))) +
                    micros(SqliteArguments.real(args.values[3])) * NANOS_PER_MICRO
            )
        ),
    months_between: (args) => BigInt(monthsBetween(args.clock(1), args.clock(2))),
    seconds_between: (args) => secondsBetween(args.clock(1), args.clock(2)),
    truncate: (args) => SqliteTimestamps.write(truncate(args.clock(1), args.text(2)))
};

/** The seconds from one clock to the other, with their fraction, as `Duration.between` gives its seconds and nanos. */
function secondsBetween(from: Clock, to: Clock): number {
    const nanos = SqliteTimestamps.epochNanos(to) - SqliteTimestamps.epochNanos(from);
    let seconds = nanos / NANOS_PER_SECOND;
    let nano = nanos % NANOS_PER_SECOND;
    if (nano < BigInt(0)) {
        seconds -= BigInt(1);
        nano += NANOS_PER_SECOND;
    }
    return Number(seconds) + Number(nano) / 1e9;
}

/** The kinds of temporal value `local` and `utc` read, by `Temporal`'s names. */
type Kind = 'DATE' | 'LOCAL_TIME' | 'TIME' | 'LOCAL_DATE_TIME' | 'DATE_TIME' | 'DURATION';

const KINDS: Kind[] = ['DATE', 'LOCAL_TIME', 'TIME', 'LOCAL_DATE_TIME', 'DATE_TIME', 'DURATION'];

function kind(name: string): Kind {
    if (!(KINDS as string[]).includes(name)) {
        throw new Error(`No enum constant org.drivine.cypher.sql.Temporal.${name}`);
    }
    return name as Kind;
}

/** The argument as a whole number, rounded half away from zero, as Postgres casts a number to one. */
function whole(value: SqliteValue): bigint {
    if (typeof value === 'bigint') {
        return value;
    }
    return SqliteDecimal.of(SqliteArguments.text(value)!).setScale(0, 'HALF_UP').unscaled;
}

/** The seconds as microseconds, rounded as Java's `Math.round` rounds, within a long. */
function micros(seconds: number): bigint {
    const rounded = Math.round(seconds * 1_000_000);
    if (Number.isNaN(rounded)) {
        return BigInt(0);
    }
    if (rounded >= 2 ** 63) {
        return BigInt('9223372036854775807');
    }
    return rounded <= -(2 ** 63) ? BigInt('-9223372036854775808') : BigInt(rounded);
}

function truncatedToMicros(clock: Clock): Clock {
    return { ...clock, nano: clock.nano - (clock.nano % 1000) };
}

function local(text: string, of: Kind): Clock {
    switch (of) {
        case 'DATE':
            return SqliteTimestamps.date(text);
        case 'LOCAL_DATE_TIME':
            return truncatedToMicros(SqliteTimestamps.dateTime(text));
        case 'DATE_TIME':
            return truncatedToMicros(SqliteTimestamps.dateTime(unzoned(text)));
        case 'LOCAL_TIME':
            return truncatedToMicros(SqliteTimestamps.time(text));
        case 'TIME':
            return truncatedToMicros(SqliteTimestamps.time(unzoned(text)));
        default:
            throw new Error('A duration is no moment.');
    }
}

function utc(text: string, of: Kind): Clock {
    if (of !== 'DATE_TIME' && of !== 'TIME') {
        return local(text, of);
    }
    const written = withColon(text);
    const whole = of === 'TIME' ? `1970-01-01T${written}` : written;
    const offset = /(Z|[+-]\d{2}:\d{2}(?::\d{2})?)$/i.exec(whole);
    if (!offset) {
        throw new TemporalError(`Text '${whole}' could not be parsed at index ${whole.length}`, whole);
    }
    const clock = SqliteTimestamps.dateTime(whole.substring(0, whole.length - offset[0].length));
    const seconds = SqliteTimestamps.offset(offset[0], whole);
    return truncatedToMicros(
        SqliteTimestamps.ofEpochNanos(SqliteTimestamps.epochNanos(clock) - BigInt(seconds) * NANOS_PER_SECOND)
    );
}

function extract(clock: Clock, field: string): SqliteValue {
    switch (field) {
        case 'YEAR':
            return BigInt(clock.year);
        case 'MONTH':
            return BigInt(clock.month);
        case 'DAY':
            return BigInt(clock.day);
        case 'HOUR':
            return BigInt(clock.hour);
        case 'MINUTE':
            return BigInt(clock.minute);
        case 'SECOND':
            return clock.second + clock.nano / 1e9;
        default:
            throw new Error(`A timestamp has no field ${field}.`);
    }
}

/** So many months later, a day past the month's end its last day, as `LocalDateTime.plusMonths` moves. */
function plusMonths(clock: Clock, months: bigint): Clock {
    const total = BigInt(clock.year) * BigInt(12) + BigInt(clock.month - 1) + months;
    let year = total / BigInt(12);
    let month = total % BigInt(12);
    if (month < BigInt(0)) {
        year -= BigInt(1);
        month += BigInt(12);
    }
    if (year < BigInt(-999_999_999) || year > BigInt(999_999_999)) {
        throw new TemporalError(`Invalid value for Year (valid values -999999999 - 999999999): ${year}`);
    }
    const moved = { year: Number(year), month: Number(month) + 1 };
    return { ...clock, ...moved, day: Math.min(clock.day, SqliteTimestamps.lengthOfMonth(moved.year, moved.month)) };
}

function plusDays(clock: Clock, days: bigint): Clock {
    const day = BigInt(SqliteTimestamps.epochDay(clock.year, clock.month, clock.day)) + days;
    const moved = SqliteTimestamps.ofEpochNanos(day * BigInt(86_400) * NANOS_PER_SECOND);
    return { ...clock, year: moved.year, month: moved.month, day: moved.day };
}

/**
 * The whole months from one clock to the other, as `ChronoUnit.MONTHS.between` counts them: the end's date a day
 * nearer the start where its time of day has not yet come round, then the months of the dates, a day of the month
 * short of the start's not counting a month.
 */
function monthsBetween(from: Clock, to: Clock): number {
    const fromDay = SqliteTimestamps.epochDay(from.year, from.month, from.day);
    let toDay = SqliteTimestamps.epochDay(to.year, to.month, to.day);
    const fromTime = SqliteTimestamps.nanoOfDay(from);
    const toTime = SqliteTimestamps.nanoOfDay(to);
    if (toDay > fromDay && toTime < fromTime) {
        toDay--;
    } else if (toDay < fromDay && toTime > fromTime) {
        toDay++;
    }
    const end = SqliteTimestamps.ofEpochDay(toDay);
    const packed = (c: { year: number; month: number; day: number }): number =>
        (c.year * 12 + c.month - 1) * 32 + c.day;
    return Math.trunc((packed(end) - packed(from)) / 32);
}

/** `clock` cut to `unit`, as Neo4j cuts: see {@link CUTS}. */
function truncate(clock: Clock, unit: string): Clock {
    if (Object.prototype.hasOwnProperty.call(CUTS, unit)) {
        return CUTS[unit](clock);
    }
    // The year less its years into the span, counted toward zero, as Neo4j counts: -1234's millennium is -1000.
    const years = Object.prototype.hasOwnProperty.call(YEARS_OF, unit) ? YEARS_OF[unit] : undefined;
    if (years === undefined) {
        throw new Error(`A timestamp is not truncated to ${unit}.`);
    }
    return midnight(clock.year - (clock.year % years), 1, 1);
}

function midnight(year: number, month: number, day: number): Clock {
    return { year, month, day, hour: 0, minute: 0, second: 0, nano: 0 };
}

/** The midnight `days` before the clock's date. */
function daysBack(clock: Clock, days: number): Clock {
    const date = SqliteTimestamps.ofEpochDay(SqliteTimestamps.epochDay(clock.year, clock.month, clock.day) - days);
    return midnight(date.year, date.month, date.day);
}

/** Each unit a clock is cut to but those of many years, the ISO week's from its Monday. */
const CUTS: Record<string, (clock: Clock) => Clock> = {
    year: (clock) => midnight(clock.year, 1, 1),
    quarter: (clock) => midnight(clock.year, Math.floor((clock.month - 1) / 3) * 3 + 1, 1),
    month: (clock) => midnight(clock.year, clock.month, 1),
    week: (clock) => daysBack(clock, SqliteTimestamps.dayOfWeek(clock) - 1),
    day: (clock) => midnight(clock.year, clock.month, clock.day),
    hour: (clock) => ({ ...clock, minute: 0, second: 0, nano: 0 }),
    minute: (clock) => ({ ...clock, second: 0, nano: 0 }),
    second: (clock) => ({ ...clock, nano: 0 }),
    millisecond: (clock) => ({ ...clock, nano: clock.nano - (clock.nano % 1_000_000) }),
    microsecond: (clock) => truncatedToMicros(clock),
    weekYear: (clock) =>
        daysBack(clock, (SqliteTimestamps.isoWeek(clock).week - 1) * 7 + SqliteTimestamps.dayOfWeek(clock) - 1)
};

/** `text` without the offset it ends with. */
function unzoned(text: string): string {
    return text.replace(OFFSET, '');
}

/** `text` with its offset written as `java.time` reads one: with a colon, or `Z`. */
function withColon(text: string): string {
    return text.replace(OFFSET, (offset) =>
        offset === 'Z' || offset.includes(':') ? offset : `${offset.substring(0, 3)}:${offset.substring(3)}`
    );
}

/** The parts of a timestamp's pattern, the longer of two that start alike first. */
const TOKENS = ['HH24', 'IYYY', 'YYYY', 'DDD', 'IW', 'MM', 'DD', 'MI', 'SS'];

/**
 * `drivine_to_char(value, pattern)`: a timestamp (see SqliteTimestamps) or a number written in a pattern of Postgres's
 * and Oracle's `to_char`, those compiled Cypher writes temporal values with, as drivine4j's `SqliteToCharFunction`.
 * Null where the value or the pattern is.
 *
 * - A timestamp's pattern is made of `YYYY`, `MM`, `DD`, `HH24`, `MI`, `SS`, `IYYY` (the ISO week's year), `IW` (its
 *   week) and `DDD` (the day of the year), and text in double quotes, written as it is; anything else is itself. A year
 *   is numbered as `java.time` and Cypher number it, and written with its sign where it is before 0: `0000`, `-0044`.
 * - A number's opens with `FM`: `0`s for its digits, a whole number padded to as many, and after a point as many `9`s as
 *   the fraction may have digits, rounded, its trailing zeros left out (`2.5`, `2.`).
 */
export function toChar(value: SqliteValue, pattern: SqliteValue): SqliteValue {
    if (pattern == null || value == null) {
        return null;
    }
    const written = SqliteArguments.text(pattern)!;
    return written.startsWith('FM') ? numberText(value, written.substring(2)) : clockText(value, written);
}

function numberText(value: SqliteValue, pattern: string): string {
    const number =
        typeof value === 'bigint' ? SqliteDecimal.ofWhole(value) : SqliteDecimal.of(SqliteArguments.text(value)!);
    const point = pattern.indexOf('.');
    if (point < 0) {
        const whole = number.setScale(0, 'HALF_UP');
        const digits = whole
            .abs()
            .toPlainString()
            .padStart(pattern.split('0').length - 1, '0');
        return whole.signum() < 0 ? `-${digits}` : digits;
    }
    const rounded = number.setScale(pattern.length - point - 1, 'HALF_UP').stripTrailingZeros();
    return rounded.scale <= 0 ? `${rounded.setScale(0).toPlainString()}.` : rounded.toPlainString();
}

function clockText(value: SqliteValue, pattern: string): string {
    const clock = SqliteTimestamps.read(SqliteArguments.text(value))!;
    let written = '';
    let at = 0;
    while (at < pattern.length) {
        if (pattern[at] === '"') {
            const close = pattern.indexOf('"', at + 1);
            const end = close > at ? close : pattern.length;
            written += pattern.substring(at + 1, end);
            at = end + 1;
            continue;
        }
        const token = TOKENS.find((it) => pattern.startsWith(it, at));
        if (token === undefined) {
            written += pattern[at++];
            continue;
        }
        written += field(clock, token);
        at += token.length;
    }
    return written;
}

function field(clock: Clock, token: string): string {
    const two = (n: number): string => String(n).padStart(2, '0');
    switch (token) {
        case 'HH24':
            return two(clock.hour);
        case 'IYYY':
            return year(SqliteTimestamps.isoWeek(clock).year);
        case 'YYYY':
            return year(clock.year);
        case 'DDD':
            return String(SqliteTimestamps.dayOfYear(clock)).padStart(3, '0');
        case 'IW':
            return two(SqliteTimestamps.isoWeek(clock).week);
        case 'MM':
            return two(clock.month);
        case 'DD':
            return two(clock.day);
        case 'MI':
            return two(clock.minute);
        default:
            return two(clock.second);
    }
}

/** A year as ISO 8601 writes it, four digits after its sign: `0000` for 1 BC, `-0044` for 45 BC. */
function year(value: number): string {
    return `${value < 0 ? '-' : ''}${String(Math.abs(value)).padStart(4, '0')}`;
}
