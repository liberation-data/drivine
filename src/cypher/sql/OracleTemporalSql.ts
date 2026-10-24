import { Temporal } from '@/cypher/sql/Temporal';
import { Shared, TemporalSql } from '@/cypher/sql/TemporalSql';

const FORMATS: Record<string, string> = {
    year: 'YYYY',
    quarter: 'Q',
    month: 'MM',
    week: 'IW',
    day: 'DD',
    hour: 'HH24',
    minute: 'MI'
};

/**
 * Oracle's SQL for temporal values: see {@link TemporalSql}. Oracle reads ISO 8601 text as a JSON value's moment, and
 * has no time of day apart from a day, so a time of day is read on 1970-01-01. Its intervals keep months apart from
 * days. `ADD_MONTHS` and `MONTHS_BETWEEN` take the last day of a month to the last day of another, where Cypher keeps
 * the day of the month, so months are added and counted from the first of the month.
 */
export class OracleTemporalSql extends TemporalSql {
    /** The clock as the query that reads it starts, in UTC. */
    static readonly CLOCK = 'CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS TIMESTAMP)';

    /** The variable a block reads {@link CLOCK} into as it starts. */
    static readonly NOW = 'cy_now';

    constructor(
        shared: Shared,
        private readonly procedural: () => boolean
    ) {
        super(shared);
    }

    /**
     * The clock as a query starts. A block reads it once, into its variable {@link NOW}, where each statement of the
     * block would read it as that statement starts, and a statement's clock is one in Cypher.
     */
    get now(): string {
        return this.procedural() ? OracleTemporalSql.NOW : OracleTemporalSql.CLOCK;
    }

    local(text: string, kind: Temporal): string {
        switch (kind) {
            case Temporal.DATE:
                return `TO_TIMESTAMP(${text}, 'YYYY-MM-DD')`;
            case Temporal.LOCAL_DATE_TIME:
                return iso(text, 'TIMESTAMP');
            case Temporal.DATE_TIME:
                return iso(this.unzoned(text), 'TIMESTAMP');
            case Temporal.LOCAL_TIME:
                return iso(`'1970-01-01T' || ${text}`, 'TIMESTAMP');
            case Temporal.TIME:
                return iso(`'1970-01-01T' || ${this.unzoned(text)}`, 'TIMESTAMP');
            default:
                throw new Error('a duration is no moment');
        }
    }

    utc(text: string, kind: Temporal): string {
        if (kind === Temporal.DATE_TIME) {
            return `CAST(SYS_EXTRACT_UTC(${iso(text, 'TIMESTAMP WITH TIME ZONE')}) AS TIMESTAMP)`;
        }
        if (kind === Temporal.TIME) {
            return `CAST(SYS_EXTRACT_UTC(${iso(`'1970-01-01T' || ${text}`, 'TIMESTAMP WITH TIME ZONE')}) AS TIMESTAMP)`;
        }
        return this.local(text, kind);
    }

    matches(text: string, pattern: string): string {
        return `REGEXP_LIKE(${text}, ${pattern})`;
    }

    group(text: string, pattern: string, group: number): string {
        return `REGEXP_SUBSTR(${text}, ${pattern}, 1, 1, NULL, ${group})`;
    }

    number(text: string): string {
        return `TO_NUMBER(${text})`;
    }

    micros(timestamp: string): string {
        return `TO_CHAR(${timestamp}, 'FF6')`;
    }

    dayOfWeek(timestamp: string): string {
        return this.shared([timestamp], ([t]) => `(TRUNC(CAST(${t} AS DATE)) - TRUNC(CAST(${t} AS DATE), 'IW') + 1)`);
    }

    /**
     * The first of the month `months` later, by `ADD_MONTHS`, which takes a day; then the day of the month, or the
     * month's last where it has fewer, and the time of day with the fraction of a second.
     */
    addMonths(timestamp: string, months: string): string {
        return this.shared([timestamp, months], ([t, m]) =>
            this.shared(
                [`ADD_MONTHS(TRUNC(CAST(${t} AS DATE), 'MM'), ${m})`],
                ([first]) =>
                    `(CAST(${first} AS TIMESTAMP) + NUMTODSINTERVAL(LEAST(EXTRACT(DAY FROM ${t}), EXTRACT(DAY FROM LAST_DAY(${first}))) - 1, 'DAY') + ` +
                    `(${t} - CAST(TRUNC(CAST(${t} AS DATE)) AS TIMESTAMP)))`
            )
        );
    }

    addTime(timestamp: string, days: string, seconds: string): string {
        return `(${timestamp} + NUMTODSINTERVAL(${days}, 'DAY') + NUMTODSINTERVAL(${seconds}, 'SECOND'))`;
    }

    /** The months between the calendar months, less one where `to`'s day and time of the month are short of `from`'s. */
    monthsBetween(from: string, to: string): string {
        return this.shared([from, to], ([f, t]) => {
            const [since, until] = [f, t].map((it) => `TO_CHAR(${it}, 'DDHH24MISSFF6')`);
            return this.shared(
                [
                    `((EXTRACT(YEAR FROM ${t}) - EXTRACT(YEAR FROM ${f})) * 12 + EXTRACT(MONTH FROM ${t}) - EXTRACT(MONTH FROM ${f}))`
                ],
                ([m]) =>
                    `(${m} - CASE WHEN ${m} > 0 AND ${until} < ${since} THEN 1 WHEN ${m} < 0 AND ${until} > ${since} THEN -1 ELSE 0 END)`
            );
        });
    }

    secondsBetween(from: string, to: string): string {
        return this.shared([from, to], ([f, t]) => {
            const interval = `(${t} - ${f})`;
            return (
                `(EXTRACT(DAY FROM ${interval}) * 86400 + EXTRACT(HOUR FROM ${interval}) * 3600 + ` +
                `EXTRACT(MINUTE FROM ${interval}) * 60 + EXTRACT(SECOND FROM ${interval}))`
            );
        });
    }

    truncate(unit: string, timestamp: string): string | undefined {
        // Its own units alone: `constructor` is no unit.
        const format = Object.prototype.hasOwnProperty.call(FORMATS, unit) ? FORMATS[unit] : undefined;
        if (format) {
            return `CAST(TRUNC(CAST(${timestamp} AS DATE), '${format}') AS TIMESTAMP)`;
        }
        if (unit === 'second') {
            return `CAST(CAST(${timestamp} AS DATE) AS TIMESTAMP)`;
        }
        if (unit === 'millisecond') {
            return `TO_TIMESTAMP(TO_CHAR(${timestamp}, 'YYYY-MM-DD HH24:MI:SS.FF3'), 'YYYY-MM-DD HH24:MI:SS.FF3')`;
        }
        return undefined;
    }
}

/** The moment the ISO 8601 text `text` writes, as Oracle reads it out of JSON, as `type`. */
function iso(text: string, type: string): string {
    return `JSON_VALUE(JSON_SCALAR(${text}), '$' RETURNING ${type})`;
}
