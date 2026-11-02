import { Temporal } from '@/cypher/sql/Temporal';
import { BC_BELOW, TemporalSql, yearsOf } from '@/cypher/sql/TemporalSql';

const TRUNCATED = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'];

/** How many years {@link PostgresTemporalSql.year} lifts a timestamp by: see it. */
const LIFT_YEARS = 4800;

/** {@link LIFT_YEARS} as an interval. */
const LIFT = "interval '4800 years'";

/** The first moment of year 1: a timestamp before it has a year BC. */
const FIRST_AD = "timestamp '0001-01-01'";

/**
 * Postgres's SQL for temporal values: see {@link TemporalSql}. Its intervals keep months, days and time apart, as
 * Cypher's durations do.
 */
export class PostgresTemporalSql extends TemporalSql {
    get now(): string {
        return "(statement_timestamp() AT TIME ZONE 'UTC')";
    }

    local(text: string, kind: Temporal): string {
        switch (kind) {
            case Temporal.DATE:
                return `CAST(CAST(${this.eraOf(text)} AS date) AS timestamp)`;
            case Temporal.LOCAL_DATE_TIME:
                return `CAST(${this.eraOf(text)} AS timestamp)`;
            case Temporal.DATE_TIME:
                return `CAST(${this.eraOf(text, true)} AS timestamp)`;
            case Temporal.LOCAL_TIME:
                return `CAST('1970-01-01 ' || ${text} AS timestamp)`;
            case Temporal.TIME:
                return `CAST('1970-01-01 ' || ${this.unzoned(text)} AS timestamp)`;
            default:
                throw new Error('a duration is no moment');
        }
    }

    utc(text: string, kind: Temporal): string {
        if (kind === Temporal.DATE_TIME) {
            return `(CAST(${this.eraOf(text)} AS timestamptz) AT TIME ZONE 'UTC')`;
        }
        if (kind === Temporal.TIME) {
            return `(CAST('1970-01-01 ' || ${text} AS timestamptz) AT TIME ZONE 'UTC')`;
        }
        return this.local(text, kind);
    }

    /**
     * Postgres reads no year before 1 in ISO text, but reads one BC after it: so 1 BC, the year `0000`, is `0001 … BC`,
     * and 45 BC, the year `-0044`, is `0045 … BC`. See {@link bcOnly}.
     */
    era(text: string): string {
        return this.shared([text], ([t]) =>
            this.bcOnly(
                t,
                `ascii(${t}) < ${BC_BELOW}`,
                `regexp_replace(${t}, '^(-[0-9]{4}|0000)(.*)$', to_char(1 - CAST(substring(${t} from '^-?[0-9]{4}') AS int), 'FM0000') || '\\2 BC')`
            )
        );
    }

    /** Where it may be BC ({@link bcOnly}), the year as {@link year} numbers it, written with its sign as `to_char` writes a negative number, then the rest of the date. */
    date(timestamp: string, then: string = ''): string {
        return this.bcOnly(
            timestamp,
            `${timestamp} < ${FIRST_AD}`,
            `to_char(${this.year(timestamp)}, 'FM0000') || to_char(${timestamp}, '-MM-DD${then}')`,
            super.date(timestamp, then)
        );
    }

    /**
     * The year of `timestamp` {@link LIFT} years later, less {@link LIFT_YEARS}: {@link LIFT} is twelve cycles of the
     * Gregorian calendar's 400 years, after which its days, leap days and ISO weeks fall again as they did, and lifts
     * Postgres's first year, 4713 BC, past 0. So a year BC is numbered as Cypher numbers it, the timestamp read once,
     * where Postgres numbers it from -1.
     */
    year(timestamp: string): string {
        return `(EXTRACT(YEAR FROM (${timestamp}) + ${LIFT}) - ${LIFT_YEARS})`;
    }

    /** The date's text, its time of day cut off, less its month and day. */
    textYear(text: string, kind: Temporal): string | undefined {
        if (kind === Temporal.DATE) {
            return `CAST(left(${text}, -6) AS numeric)`;
        }
        if (kind === Temporal.LOCAL_DATE_TIME || kind === Temporal.DATE_TIME) {
            return `CAST(left(split_part(${text}, 'T', 1), -6) AS numeric)`;
        }
        return undefined;
    }

    /** The ISO week's year, lifted as {@link year} lifts it: `to_char` writes a week's year BC unsigned. */
    weekYear(timestamp: string): string {
        return `(${this.number(`to_char((${timestamp}) + ${LIFT}, 'IYYY')`)} - ${LIFT_YEARS})`;
    }

    matches(text: string, pattern: string): string {
        return `(${text} ~ ${pattern})`;
    }

    group(text: string, pattern: string, group: number): string {
        return `(regexp_match(${text}, ${pattern}))[${group}]`;
    }

    number(text: string): string {
        return `CAST(NULLIF(${text}, '') AS numeric)`;
    }

    sortable(timestamp: string): string {
        return `to_char(${timestamp}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
    }

    micros(timestamp: string): string {
        return `to_char(${timestamp}, 'US')`;
    }

    dayOfWeek(timestamp: string): string {
        return `CAST(EXTRACT(ISODOW FROM ${timestamp}) AS numeric)`;
    }

    addMonths(timestamp: string, months: string): string {
        return `(${timestamp} + make_interval(months => CAST(${months} AS int)))`;
    }

    addTime(timestamp: string, days: string, seconds: string): string {
        return `(${timestamp} + make_interval(days => CAST(${days} AS int), secs => CAST(${seconds} AS double precision)))`;
    }

    /** `age` counts in calendar months, then days, then time, as Cypher's `duration.between` does. */
    monthsBetween(from: string, to: string): string {
        return this.shared(
            [`age(${to}, ${from})`],
            ([age]) => `(EXTRACT(YEAR FROM ${age}) * 12 + EXTRACT(MONTH FROM ${age}))`
        );
    }

    secondsBetween(from: string, to: string): string {
        return `EXTRACT(EPOCH FROM (${to} - ${from}))`;
    }

    /**
     * `date_trunc`, but for the units it counts otherwise than Neo4j: its millennium starts in 2001 and its century in
     * 1901, so those and the decade are the year less its years into the span (see {@link yearsOf}). The week-based year
     * is so many weeks before the timestamp's week, its ISO week less one.
     */
    truncate(unit: string, timestamp: string): string | undefined {
        if (TRUNCATED.includes(unit)) {
            return `date_trunc('${unit}', ${timestamp})`;
        }
        if (unit === 'microsecond') {
            return `date_trunc('microseconds', ${timestamp})`;
        }
        const years = yearsOf(unit);
        if (years !== undefined) {
            return this.shared(
                [timestamp],
                ([t]) =>
                    `(date_trunc('year', ${t}) - make_interval(years => MOD(CAST(${this.year(t)} AS int), ${years})))`
            );
        }
        if (unit === 'weekYear') {
            return this.shared(
                [timestamp],
                ([t]) => `(date_trunc('week', ${t}) - make_interval(weeks => CAST(EXTRACT(WEEK FROM ${t}) AS int) - 1))`
            );
        }
        return undefined;
    }
}
