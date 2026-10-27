import { Temporal } from '@/cypher/sql/Temporal';
import { TemporalSql } from '@/cypher/sql/TemporalSql';

const TRUNCATED = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'];

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
                return `CAST(CAST(${text} AS date) AS timestamp)`;
            case Temporal.LOCAL_DATE_TIME:
                return `CAST(${text} AS timestamp)`;
            case Temporal.DATE_TIME:
                return `CAST(${this.unzoned(text)} AS timestamp)`;
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
            return `(CAST(${text} AS timestamptz) AT TIME ZONE 'UTC')`;
        }
        if (kind === Temporal.TIME) {
            return `(CAST('1970-01-01 ' || ${text} AS timestamptz) AT TIME ZONE 'UTC')`;
        }
        return this.local(text, kind);
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

    truncate(unit: string, timestamp: string): string | undefined {
        return TRUNCATED.includes(unit) ? `date_trunc('${unit}', ${timestamp})` : undefined;
    }
}
