import { Temporal } from '@/cypher/sql/Temporal';
import { BC_BELOW, Shared, TemporalSql, yearsOf } from '@/cypher/sql/TemporalSql';

/** `TRUNC`'s format model of each unit: `IYYY` is the first day of the ISO week-based year. */
const FORMATS: Record<string, string> = {
    year: 'YYYY',
    weekYear: 'IYYY',
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
                return `TO_TIMESTAMP(${this.eraOf(text)}, 'SYYYY-MM-DD')`;
            case Temporal.LOCAL_DATE_TIME:
                return iso(this.eraOf(text), 'TIMESTAMP');
            case Temporal.DATE_TIME:
                return iso(this.eraOf(text, true), 'TIMESTAMP');
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
            return `CAST(SYS_EXTRACT_UTC(${iso(this.eraOf(text), 'TIMESTAMP WITH TIME ZONE')}) AS TIMESTAMP)`;
        }
        if (kind === Temporal.TIME) {
            return `CAST(SYS_EXTRACT_UTC(${iso(`'1970-01-01T' || ${text}`, 'TIMESTAMP WITH TIME ZONE')}) AS TIMESTAMP)`;
        }
        return this.local(text, kind);
    }

    /**
     * Oracle numbers a year BC from -1, with no year 0, in ISO text as in its own: so 1 BC, the year `0000`, is `-0001`,
     * and 45 BC, the year `-0044`, is `-0045`. See {@link bcOnly}.
     */
    era(text: string): string {
        return this.shared([text], ([t]) =>
            this.bcOnly(
                t,
                `ASCII(${t}) < ${BC_BELOW}`,
                `REGEXP_REPLACE(${t}, '^(-[0-9]{4}|0000)', TO_CHAR(TO_NUMBER(REGEXP_SUBSTR(${t}, '^-?[0-9]{4}')) - 1, 'FM0000'))`
            )
        );
    }

    /**
     * The digits the text opens with, and their sign; but the year of the timestamp where the text is
     * {@link knownAd}, whose year Oracle numbers so too, as reading the timestamp's is quicker on Oracle than a regular
     * expression.
     */
    textYear(text: string, kind: Temporal): string | undefined {
        if (kind !== Temporal.DATE && kind !== Temporal.LOCAL_DATE_TIME && kind !== Temporal.DATE_TIME) {
            return undefined;
        }
        if (this.readsAd(text)) {
            return `EXTRACT(YEAR FROM ${this.local(text, kind)})`;
        }
        return `TO_NUMBER(REGEXP_SUBSTR(${text}, '^-?[0-9]+'))`;
    }

    /** Where it may be BC ({@link bcOnly}), `SYYYY` writes a year with its sign, as Oracle numbers it. */
    date(timestamp: string, then: string = ''): string {
        return this.bcOnly(
            timestamp,
            `${timestamp} < TIMESTAMP '0001-01-01 00:00:00'`,
            `REGEXP_REPLACE(LTRIM(TO_CHAR(${timestamp}, 'SYYYY-MM-DD${then}')), '^-[0-9]{4}', TO_CHAR(EXTRACT(YEAR FROM ${timestamp}) + 1, 'FM0000'))`,
            super.date(timestamp, then)
        );
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

    sortable(timestamp: string): string {
        return `TO_CHAR(${timestamp}, 'YYYY-MM-DD"T"HH24:MI:SS.FF6')`;
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
                [`((${this.year(t)} - ${this.year(f)}) * 12 + EXTRACT(MONTH FROM ${t}) - EXTRACT(MONTH FROM ${f}))`],
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

    /**
     * `TRUNC` of a date to a format model. A millennium, a century and a decade are the year less its years into the span
     * (see {@link yearsOf}), as months before the year's first day.
     */
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
            return `TO_TIMESTAMP(TO_CHAR(${timestamp}, 'SYYYY-MM-DD HH24:MI:SS.FF3'), 'SYYYY-MM-DD HH24:MI:SS.FF3')`;
        }
        if (unit === 'microsecond') {
            return timestamp;
        }
        const years = yearsOf(unit);
        if (years !== undefined) {
            return this.shared(
                [timestamp],
                ([t]) =>
                    `CAST(ADD_MONTHS(TRUNC(CAST(${t} AS DATE), 'YYYY'), -12 * MOD(${this.year(
                        t
                    )}, ${years})) AS TIMESTAMP)`
            );
        }
        return undefined;
    }
}

/** The moment the ISO 8601 text `text` writes, as Oracle reads it out of JSON, as `type`. */
function iso(text: string, type: string): string {
    return `JSON_VALUE(JSON_SCALAR(${text}), '$' RETURNING ${type})`;
}
