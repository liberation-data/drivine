import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { Temporal } from '@/cypher/sql/Temporal';
import { TemporalSql, TRUNCATION_UNITS } from '@/cypher/sql/TemporalSql';

/**
 * SQLite's SQL for temporal values: see {@link TemporalSql}. SQLite has no type for a moment and no arithmetic of the
 * calendar, so a timestamp is the text of a wall clock to the microsecond, `2024-03-15T10:30:00.000000`, which compares
 * and orders as the clock does, and what is worked out of one is worked out by the functions Drivine registers on each
 * connection: see `drivine_temporal` in `SqliteFunctions`.
 */
export class SqliteTemporalSql extends TemporalSql {
    /**
     * The clock, in UTC, as the statement is compiled, just before it runs: the same for each of its rows and each step
     * of a write, as a statement's clock is in Cypher. SQLite's own `'now'` is the same within one step of a query alone.
     */
    private readonly clock = `'${timestampText(Math.round((performance.timeOrigin + performance.now()) * 1000))}'`;

    get now(): string {
        return this.clock;
    }

    local(text: string, kind: Temporal): string {
        return temporal('local', text, `'${kind.name}'`);
    }

    utc(text: string, kind: Temporal): string {
        return temporal('utc', text, `'${kind.name}'`);
    }

    matches(text: string, pattern: string): string {
        return `(${text} REGEXP ${pattern})`;
    }

    group(text: string, pattern: string, group: number): string {
        return `${SqliteFunctions.REGEX_GROUP}(${text}, ${pattern}, ${group})`;
    }

    number(text: string): string {
        return `CAST(NULLIF(${text}, '') AS NUMERIC)`;
    }

    /** A timestamp is such a text already. */
    sortable(timestamp: string): string {
        return timestamp;
    }

    /** The last six digits, for a timestamp of a year BC is a character longer: `-0044-03-15T10:30:00.000000`. */
    micros(timestamp: string): string {
        return `substr(${timestamp}, -6)`;
    }

    /** `java.time`'s, for SQLite's own `strftime` reads no year before 0. */
    dayOfWeek(timestamp: string): string {
        return temporal('day_of_week', timestamp);
    }

    addMonths(timestamp: string, months: string): string {
        return temporal('add_months', timestamp, months);
    }

    addTime(timestamp: string, days: string, seconds: string): string {
        return temporal('add_time', timestamp, days, seconds);
    }

    monthsBetween(from: string, to: string): string {
        return temporal('months_between', from, to);
    }

    secondsBetween(from: string, to: string): string {
        return temporal('seconds_between', from, to);
    }

    truncate(unit: string, timestamp: string): string | undefined {
        return TRUNCATION_UNITS.includes(unit) ? temporal('truncate', timestamp, `'${unit}'`) : undefined;
    }

    replace(text: string, pattern: string, replacement: string): string {
        return `${SqliteFunctions.REGEX_REPLACE}(${text}, ${pattern}, ${replacement})`;
    }

    get toChar(): string {
        return SqliteFunctions.TO_CHAR;
    }

    get trunc(): string {
        return SqliteFunctions.TRUNC;
    }

    get epoch(): string {
        return "'1970-01-01T00:00:00.000000'";
    }

    /** SQLite divides one whole number by another to a whole number: the dividend is made a real number first. */
    quotient(dividend: string, divisor: string): string {
        return `(${dividend} + 0.0) / ${divisor}`;
    }

    extract(field: string, timestamp: string): string {
        return temporal('extract', timestamp, `'${field}'`);
    }
}

/** The temporal function's `operation` of `args`. */
function temporal(operation: string, ...args: string[]): string {
    return `${SqliteFunctions.TEMPORAL}('${operation}', ${args.join(', ')})`;
}

/** The wall clock in UTC `micros` microseconds after the epoch, as a timestamp's text: `2024-03-15T10:30:00.000000`. */
function timestampText(micros: number): string {
    const whole = Math.floor(micros / 1000);
    const iso = new Date(whole).toISOString();
    const fraction = String(Math.floor(micros) % 1_000_000).padStart(6, '0');
    return `${iso.substring(0, 19)}.${fraction}`;
}
