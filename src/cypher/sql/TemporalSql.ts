import { Temporal } from '@/cypher/sql/Temporal';

/** Writes `body` over `values`, each written once where it is read more than once: the compiler's `shared`. */
export type Shared = (values: string[], body: (names: string[]) => string) => string;

/**
 * The units a timestamp truncates to, as Cypher names them, from the longest. The week-based year starts on the Monday of
 * its first ISO week. A timestamp keeps microseconds alone, so cut to them it is the same.
 */
export const TRUNCATION_UNITS = [
    'millennium',
    'century',
    'decade',
    'year',
    'weekYear',
    'quarter',
    'month',
    'week',
    'day',
    'hour',
    'minute',
    'second',
    'millisecond',
    'microsecond'
];

/**
 * The units of many years, and how many: as Neo4j counts them, the year less its years into the span, counted toward
 * zero as Java divides. So 2017's millennium starts in 2000, 1984's century in 1900, and -1234's millennium in -1000.
 */
const YEARS_OF: Record<string, number> = { millennium: 1000, century: 100, decade: 10 };

/** How many years `unit` is, where it is a unit of many: see {@link YEARS_OF}. Its own units alone: `constructor` is none. */
export function yearsOf(unit: string): number | undefined {
    return Object.prototype.hasOwnProperty.call(YEARS_OF, unit) ? YEARS_OF[unit] : undefined;
}

/**
 * A store's SQL for temporal values, which `Temporals` works openCypher's out of. Its texts and timestamps are SQL: a
 * text is a value's ISO 8601 text, a timestamp a SQL timestamp of no zone, a number a SQL number. `shared` is the
 * compiler's: a value it is given is written once where it is read more than once.
 */
export abstract class TemporalSql {
    constructor(protected readonly shared: Shared) {}

    /** The moment the statement runs, in UTC. */
    abstract get now(): string;

    /** The text `text` with every match of `pattern`, a SQL text, replaced by `replacement`. */
    replace(text: string, pattern: string, replacement: string): string {
        return `REGEXP_REPLACE(${text}, ${pattern}, ${replacement})`;
    }

    /** The zoned text `text` without the offset it ends with. */
    protected unzoned(text: string): string {
        return this.replace(text, `'${Temporal.OFFSET}'`, "''");
    }

    /**
     * The wall clock the text `text` of `kind` reads, an offset it has left out: a date at its midnight, a time of day
     * on 1970-01-01.
     */
    abstract local(text: string, kind: Temporal): string;

    /** The moment the text `text` of `kind` is, in UTC; for a kind of no zone, the wall clock it reads. */
    abstract utc(text: string, kind: Temporal): string;

    /** Whether the text `text` matches the regular expression `pattern`, a SQL text. */
    abstract matches(text: string, pattern: string): string;

    /** The text the group `group` of the regular expression `pattern` matches in `text`: null where it matches none. */
    abstract group(text: string, pattern: string, group: number): string;

    /** The text `text` as a number: null where it is null or empty. */
    abstract number(text: string): string;

    /** The timestamp `timestamp` as a text of one width, `2024-03-15T10:30:00.000000`, which orders as the timestamps do. */
    abstract sortable(timestamp: string): string;

    /** The microseconds of the second of the timestamp `timestamp`, as six digits. */
    abstract micros(timestamp: string): string;

    /** The ISO day of the week of `timestamp`, from 1 for Monday to 7. */
    abstract dayOfWeek(timestamp: string): string;

    /** `timestamp` `months` later, a day past the month's end its last day. */
    abstract addMonths(timestamp: string, months: string): string;

    /** `timestamp` `days` and `seconds` later, numbers each. */
    abstract addTime(timestamp: string, days: string, seconds: string): string;

    /** The whole months from `from` to `to`, as a calendar counts them: negative where `to` is before. */
    abstract monthsBetween(from: string, to: string): string;

    /** The seconds from `from` to `to`, a fraction of one among them. */
    abstract secondsBetween(from: string, to: string): string;

    /** `timestamp` truncated to `unit`, one of {@link TRUNCATION_UNITS}, as Neo4j truncates: undefined for another unit. */
    abstract truncate(unit: string, timestamp: string): string | undefined;
}
