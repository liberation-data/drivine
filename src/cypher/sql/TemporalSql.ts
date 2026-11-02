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
 * The code of `1`: an ISO text whose first character's code is below it starts with `-` or `0`, as one with a year BC
 * does, so a store's {@link TemporalSql.era} rewrites it ({@link TemporalSql.bcOnly}), and reads any other, an ordinary
 * date, as it is.
 */
export const BC_BELOW = 49;

/** The longest value {@link TemporalSql.bcOnly} tests: as long as the compiler writes a value where it is read, unbound. */
export const GUARDED_UP_TO = 200;

/** A name of a value the compiler binds in a subquery, `sh2.v1`: see `SqlCypherCompiler.bound`. */
const BOUND = /\bsh[0-9]+[.]v/;

/**
 * A store's SQL for temporal values, which `Temporals` works openCypher's out of. Its texts and timestamps are SQL: a
 * text is a value's ISO 8601 text, a timestamp a SQL timestamp of no zone, a number a SQL number. `shared` is the
 * compiler's: a value it is given is written once where it is read more than once.
 */
export abstract class TemporalSql {
    /** The texts {@link knownAd} has been told are AD, where the SQL it writes reads them. */
    private readonly ad: string[] = [];

    /** Whether {@link eraOf} has read a text {@link knownAd} was told is AD, since the {@link knownAd} it is in began. */
    private readAd = false;

    constructor(protected readonly shared: Shared) {}

    /** The moment the statement runs, in UTC. */
    abstract get now(): string;

    /**
     * Whether the store numbers a year BC from -1, with no year 0, as Postgres and Oracle do, where Cypher numbers years
     * astronomically: 0 for 1 BC and -44 for 45 BC. Where it does, a year before 1 is one more than the store's.
     */
    get numbersBcFromOne(): boolean {
        return true;
    }

    /** The year of `timestamp`, a number, as Cypher numbers it: see {@link numbersBcFromOne}. */
    year(timestamp: string): string {
        const year = `EXTRACT(YEAR FROM ${timestamp})`;
        if (!this.numbersBcFromOne) {
            return year;
        }
        return this.shared([year], ([y]) => `(${y} + CASE WHEN ${y} < 0 THEN 1 ELSE 0 END)`);
    }

    /**
     * The year of the ISO 8601 text `text` of `kind`, a date or a moment, a number, read off the text: the digits before
     * its month, with their sign, are the year as Cypher numbers it, so the text needs no {@link era} nor a cast to give
     * it. Undefined for a time of day, and where the store reads the year off the timestamp, as it numbers years so
     * already.
     */
    textYear(_text: string, _kind: Temporal): string | undefined {
        return undefined;
    }

    /** The year of the ISO week of `timestamp`, a number, as Cypher numbers a year: `to_char` writes one BC unsigned. */
    weekYear(timestamp: string): string {
        const week = (t: string): string => this.number(`to_char(${t}, 'IYYY')`);
        if (!this.numbersBcFromOne) {
            return week(timestamp);
        }
        return this.shared(
            [timestamp],
            ([t]) => `CASE WHEN EXTRACT(YEAR FROM ${t}) < 0 THEN 1 - ${week(t)} ELSE ${week(t)} END`
        );
    }

    /**
     * The date of `timestamp` as ISO 8601 writes it, `2024-03-15`, followed by the `to_char` pattern `then`: its year as
     * Cypher numbers it, `0000` for 1 BC and `-0044` for 45 BC. A store's own, and its {@link era}, read their operand
     * twice at most: a value an aggregate's argument reads is bound nowhere, and is written out again wherever it is read.
     */
    date(timestamp: string, then: string = ''): string {
        return `to_char(${timestamp}, 'YYYY-MM-DD${then}')`;
    }

    /**
     * The ISO 8601 text `text` of a date or a moment, its year numbered as Cypher numbers it, as the store reads one:
     * itself, where the store numbers years so too, or the year is after 0. A store's own reads `text` more than once,
     * so binds it with `shared`: written out twice, a text that is itself a truncation or a value made of fields tripled
     * the statement.
     */
    era(text: string): string {
        return text;
    }

    /**
     * The SQL `block` writes, reading each of `texts` as a text of a year from 1000 on, as a store reads ISO 8601: where
     * a test the statement makes first, a kind's {@link Temporal.adPattern}, has told it so. {@link eraOf} then reads
     * such a text as it is, so an ordinary date costs neither {@link era}'s rewrite nor its test. And whether it read
     * one so: where it did not, the SQL is what `block` writes anyway.
     */
    knownAd(texts: string[], block: () => string): [string, boolean] {
        const outer = this.readAd;
        this.readAd = false;
        this.ad.push(...texts);
        try {
            const sql = block();
            return [sql, this.readAd];
        } finally {
            this.ad.splice(this.ad.length - texts.length, texts.length);
            this.readAd = outer || this.readAd;
        }
    }

    /**
     * The SQL `block` writes, each of `derived` {@link knownAd} in it where `of` is: a value worked out of `of` whose
     * year is after 0 where `of`'s is from 1000 on, as a truncation's, or `of` itself bound to a name. Not always from
     * 1000 on itself (the week-based year of `1000-01-01` starts on `0999-12-30`), but a store writes and reads every
     * year after 0 as ISO 8601 does.
     */
    asAd(of: string, derived: string[], block: () => string): string {
        return this.readsAd(of) ? this.knownAd(derived, block)[0] : block();
    }

    /** The text `text` with every match of `pattern`, a SQL text, replaced by `replacement`. */
    replace(text: string, pattern: string, replacement: string): string {
        return `REGEXP_REPLACE(${text}, ${pattern}, ${replacement})`;
    }

    /** Whether `text` is {@link knownAd} where the SQL being written reads it, which it then reads as a store reads ISO 8601. */
    protected readsAd(text: string): boolean {
        const read = this.ad.includes(text);
        if (read) {
            this.readAd = true;
        }
        return read;
    }

    /** {@link era} of `text`, {@link unzoned} first where `zoned`: `text` as it is where it is {@link knownAd}. */
    protected eraOf(text: string, zoned: boolean = false): string {
        const local = zoned ? this.unzoned(text) : text;
        return this.readsAd(text) ? local : this.era(local);
    }

    /**
     * `bc`, what a store reads or writes `value` as where its year may be BC, where `test`, a cheap test of `value`, says
     * it may be; and `ad`, how it reads or writes an ordinary one, otherwise, so an ordinary date costs `test` and no
     * more. A long `value` is one written out where it is read, as in an aggregate's argument, which binds nothing: then
     * `bc` alone, which reads it twice where the test reads it four times, so a value read again and again doubles at
     * each reading, not quadruples. A `value` that reads one the compiler bound in a subquery ({@link BOUND}) is one it
     * worked out, not one read from the store, and is not tested either: Oracle plans a statement whose subqueries test
     * such values a great deal slower. A `value` {@link knownAd} is `ad` alone.
     */
    protected bcOnly(value: string, test: string, bc: string, ad: string = value): string {
        if (this.readsAd(value)) {
            return ad;
        }
        if (value.length > GUARDED_UP_TO || value === 'NULL' || BOUND.test(value)) {
            return bc;
        }
        return `CASE WHEN ${test} THEN ${bc} ELSE ${ad} END`;
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
