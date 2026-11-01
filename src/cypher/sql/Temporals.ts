import { Temporal } from '@/cypher/sql/Temporal';
import { Shared, TemporalSql } from '@/cypher/sql/TemporalSql';
import { canonicalTemporal } from '@/cypher/sql/TemporalText';
import { literal } from '@/cypher/sql/CypherSyntax';

/** A duration's parts, SQL numbers each: whole months, whole days, and seconds with their fraction. */
interface Parts {
    months: string;
    days: string;
    seconds: string;
}

/**
 * The fields the third argument of a truncation gives the value cut short, in place of its own: SQL numbers by Cypher's
 * names (`year`, `month`, `day`, `hour`, `minute`, `second`, `millisecond`, `microsecond`), `dayOfWeek`, and `timezone`,
 * an offset's text.
 */
export interface Overrides {
    fields: Record<string, string>;
    timezone?: string;
}

/** A field of a value: its SQL, and whether it is a text, where it is not a number. */
export interface Field {
    sql: string;
    text: boolean;
}

/** The kinds of a time of day, which no months are between. */
const TIMES = [Temporal.TIME, Temporal.LOCAL_TIME];

/** The fields of a moment or a time of day read off its wall clock. */
const INSTANT_FIELDS = [
    'year',
    'quarter',
    'month',
    'week',
    'weekYear',
    'day',
    'ordinalDay',
    'dayOfQuarter',
    'dayOfWeek',
    'weekDay',
    'hour',
    'minute',
    'second',
    'millisecond',
    'microsecond',
    'nanosecond'
];

/** The fields that give a date by the calendar's other fields, beside the year, in place of a month and a day: see {@link Temporals.ofCalendar}. */
export const CALENDAR_FIELDS = ['week', 'dayOfWeek', 'ordinalDay', 'quarter', 'dayOfQuarter'];

/** The fields of a map that give another temporal value to make one of: see {@link Temporals.over}. */
export const SELECTORS = ['date', 'time', 'datetime'];

/** The fields of a date by its month: see {@link Temporals.over}. */
const DAY = ['year', 'month', 'day'];

/** The fields of a fraction of a second, which make the whole fraction where any is given: see {@link Temporals.over}. */
const FRACTION = ['millisecond', 'microsecond', 'nanosecond'];

/**
 * A temporal value that a map's `date`, `time` or `datetime` gives {@link Temporals.over}: its `text`, and the `kinds`
 * it may be, one where the statement tells its kind, else those of the kind that give what it is to give (a date, a
 * time of day, both), its text telling which, as a value read from the store does.
 */
export interface TemporalBase {
    text: string;
    kinds: Temporal[];
}

/** The fields of a zoned value that are of its zone. */
const ZONE_FIELDS = ['timezone', 'offset', 'offsetMinutes', 'offsetSeconds'];

/** The names of the fields a temporal value may have, of a moment's or a duration's. */
const FIELD_NAMES = [
    ...INSTANT_FIELDS,
    'epochSeconds',
    'epochMillis',
    ...ZONE_FIELDS,
    'years',
    'quarters',
    'months',
    'weeks',
    'days',
    'hours',
    'minutes',
    'seconds',
    'milliseconds',
    'microseconds',
    'nanoseconds',
    'quartersOfYear',
    'monthsOfQuarter',
    'monthsOfYear',
    'daysOfWeek',
    'minutesOfHour',
    'secondsOfMinute',
    'millisecondsOfSecond',
    'microsecondsOfSecond',
    'nanosecondsOfSecond'
];

/** A field of a duration of the parts `[m, d, s]`, by Cypher's name for it. */
const DURATION_FIELDS: Record<string, (m: string, d: string, s: string) => string> = {
    years: (m) => `TRUNC(${m} / 12)`,
    quarters: (m) => `TRUNC(${m} / 3)`,
    months: (m) => m,
    weeks: (_, d) => `TRUNC(${d} / 7)`,
    days: (_, d) => d,
    hours: (_, __, s) => `TRUNC(${s} / 3600)`,
    minutes: (_, __, s) => `TRUNC(${s} / 60)`,
    seconds: (_, __, s) => `TRUNC(${s})`,
    milliseconds: (_, __, s) => `TRUNC(${s} * 1000)`,
    microseconds: (_, __, s) => `TRUNC(${s} * 1000000)`,
    nanoseconds: (_, __, s) => `TRUNC(${s} * 1000000000)`,
    quartersOfYear: (m) => `(TRUNC(${m} / 3) - TRUNC(${m} / 12) * 4)`,
    monthsOfQuarter: (m) => `(${m} - TRUNC(${m} / 3) * 3)`,
    monthsOfYear: (m) => `(${m} - TRUNC(${m} / 12) * 12)`,
    daysOfWeek: (_, d) => `(${d} - TRUNC(${d} / 7) * 7)`,
    minutesOfHour: (_, __, s) => `(TRUNC(${s} / 60) - TRUNC(${s} / 3600) * 60)`,
    secondsOfMinute: (_, __, s) => `(TRUNC(${s}) - TRUNC(${s} / 60) * 60)`,
    millisecondsOfSecond: (_, __, s) => `(TRUNC(${s} * 1000) - TRUNC(${s}) * 1000)`,
    microsecondsOfSecond: (_, __, s) => `(TRUNC(${s} * 1000000) - TRUNC(${s}) * 1000000)`,
    nanosecondsOfSecond: (_, __, s) => `(TRUNC(${s} * 1000000000) - TRUNC(${s}) * 1000000000)`
};

/**
 * openCypher's temporal values on a SQL store, worked out of a store's {@link TemporalSql}. A value is its ISO 8601
 * text, as a store keeps a moment: `2024-03-01`, `10:30:00`, `10:30:00+02:00`, `2024-03-01T10:30:00`,
 * `2024-03-01T10:30:00.500Z`, `P1Y2M3DT4H`. A zoned value keeps the offset it was written with, its fields read on its
 * wall clock and compared as the moment it is. A duration is months, days and seconds, as Cypher's is, and as a
 * Postgres interval is.
 *
 * Every argument and result is SQL: a text, a number, or with `shared` a value written once where it is read more than
 * once.
 */
export class Temporals {
    /** The names of the fields a temporal value may have, of a moment's or a duration's. */
    readonly fieldNames: string[] = FIELD_NAMES;

    /**
     * The canonical text of `kind` of the text `text`, worked out as the store's SQL would work it out, for a value the
     * statement writes: undefined where the text is of no temporal kind.
     */
    static canonical(text: string, kind: Temporal): string | undefined {
        return canonicalTemporal(text, kind);
    }

    constructor(
        private readonly sql: TemporalSql,
        private readonly shared: Shared
    ) {}

    // ----- Kinds -----

    /** Whether the text `text` is of `kind`. */
    isKind(text: string, kind: Temporal): string {
        return this.sql.matches(text, literal(kind.pattern));
    }

    /**
     * `body` of the kind among `kinds` that the text `text` is, as its shape tells, and of the text, written once: null
     * where it is none.
     */
    byKind(
        text: string,
        body: (kind: Temporal, text: string) => string,
        kinds: Temporal[] = Temporal.instants
    ): string {
        return this.shared(
            [text],
            ([t]) => `CASE ${kinds.map((it) => `WHEN ${this.isKind(t, it)} THEN ${body(it, t)}`).join(' ')} END`
        );
    }

    // ----- Moments and times of day -----

    /**
     * The text of `kind` the wall clock `timestamp` reads, with `offset`, a text, where the kind is zoned: null where
     * `timestamp` is null, which Oracle would otherwise write out as the text's punctuation alone (`.`, `.Z`), for its
     * null joins a text as the empty text.
     */
    format(timestamp: string, kind: Temporal, offset?: string): string {
        return this.shared([timestamp], ([t]) => {
            const time = `to_char(${t}, 'HH24:MI:SS') || ${this.fraction(t)}`;
            const zone = offset ?? "'Z'";
            const texts: Partial<Record<Temporal['name'], string>> = {
                DATE: `to_char(${t}, 'YYYY-MM-DD')`,
                LOCAL_DATE_TIME: `to_char(${t}, 'YYYY-MM-DD"T"') || ${time}`,
                DATE_TIME: `to_char(${t}, 'YYYY-MM-DD"T"') || ${time} || ${zone}`,
                LOCAL_TIME: time,
                TIME: `${time} || ${zone}`
            };
            const text = texts[kind.name];
            if (text === undefined) {
                throw new Error('a duration is no moment');
            }
            return kind === Temporal.DATE ? text : `CASE WHEN ${t} IS NOT NULL THEN ${text} END`;
        });
    }

    /**
     * The offset the zoned text `text` ends with, as Cypher gives it: with a colon where it is written without one, and
     * `Z` where it is none, however written (`+00:00`, `-0000`), so a value at UTC is equal to another however each
     * writes it.
     */
    offset(text: string): string {
        const utc = this.sql.replace(this.sql.group(text, literal(Temporal.OFFSET), 1), "'^[+-]00:?00$'", "'Z'");
        return this.sql.replace(utc, "'^([+-][0-9]{2})([0-9]{2})$'", "'\\1:\\2'");
    }

    /** The text of `to` the text `text` of `from` is: a moment's date, a date's midnight, a local value's in UTC. */
    convert(text: string, from: Temporal, to: Temporal): string {
        return this.shared([text], ([t]) => this.format(this.sql.local(t, from), to, this.offsetOf(t, from, to)));
    }

    /** The text of `to` the text `text` is, whatever kind its shape tells: null where it is none. */
    convertAny(text: string, to: Temporal): string {
        return this.byKind(text, (from, t) => this.convert(t, from, to));
    }

    /** The text of `kind` the statement runs at, in UTC. */
    now(kind: Temporal): string {
        return this.format(this.sql.now, kind);
    }

    /**
     * The text of `kind` of the fields `fields`, SQL numbers each by Cypher's names (`year`, `month`, `day`, `hour`,
     * `minute`, `second`, `millisecond`, `microsecond`, `nanosecond`), and `timezone`, a text.
     */
    of(fields: Record<string, string>, timezone: string | undefined, kind: Temporal): string {
        const field = (name: string, otherwise: string, digits: number): string =>
            `to_char(${fields[name] ?? otherwise}, 'FM${'0'.repeat(digits)}')`;
        const micros = `TRUNC(${fields.millisecond ?? '0'} * 1000 + ${fields.microsecond ?? '0'} + ${
            fields.nanosecond ?? '0'
        } / 1000)`;
        const date = `${field('year', '1970', 4)} || '-' || ${field('month', '1', 2)} || '-' || ${field(
            'day',
            '1',
            2
        )}`;
        const time =
            `${field('hour', '0', 2)} || ':' || ${field('minute', '0', 2)} || ':' || ${field(
                'second',
                '0',
                2
            )} || '.' || ` + `to_char(${micros}, 'FM000000')`;
        const zone = timezone ?? "'Z'";
        const texts: Partial<Record<Temporal['name'], string>> = {
            DATE: date,
            LOCAL_DATE_TIME: `${date} || 'T' || ${time}`,
            DATE_TIME: `${date} || 'T' || ${time} || ${zone}`,
            LOCAL_TIME: time,
            TIME: `${time} || ${zone}`
        };
        const text = texts[kind.name];
        if (text === undefined) {
            throw new Error('a duration is made of its own fields');
        }
        return this.convert(text, kind, kind);
    }

    /**
     * {@link of} for `fields` that give the date by the calendar's other fields beside the `year`, SQL numbers each: a
     * `week` of the ISO week-based year and its `dayOfWeek`, an `ordinalDay`, or a `quarter` and its `dayOfQuarter`. The
     * date is so many days after the first of the year, of the quarter, or of the year's first ISO week, the week of
     * January 4th. As Neo4j has them, a field that is null is given as its least (the year 0, the first week, day or
     * quarter), and a week runs to 53 and a day of the quarter to 92 in any year, carried into the next where it has
     * fewer. A field that is not whole or is past its range gives the day 0, which the store fails on as it fails on
     * `{day: 0}`.
     */
    ofCalendar(fields: Record<string, string>, timezone: string | undefined, kind: Temporal): string {
        const time = Object.fromEntries(
            Object.entries(fields).filter(([name]) => name !== 'year' && !CALENDAR_FIELDS.includes(name))
        );
        const given = (name: string, least: number): string =>
            fields[name] !== undefined ? `COALESCE(${fields[name]}, ${least})` : `${least}`;
        const january = (y: string, day: number): string =>
            this.sql.local(`to_char(${y}, 'FM0000') || '-01-0${day}'`, Temporal.DATE);
        const whole = (...values: string[]): string => values.map((it) => `${it} = TRUNC(${it})`).join(' AND ');
        const year = given('year', 0);
        if (fields.week !== undefined) {
            return this.shared([year, given('week', 1), given('dayOfWeek', 1)], ([y, w, d]) =>
                this.shared([january(y, 4)], ([january4]) =>
                    this.calendarDate(
                        this.sql.addTime(january4, `(${w} - 1) * 7 + ${d} - ${this.sql.dayOfWeek(january4)}`, '0'),
                        time,
                        timezone,
                        kind,
                        () => `${whole(y, w, d)} AND ${w} BETWEEN 1 AND 53 AND ${d} BETWEEN 1 AND 7`
                    )
                )
            );
        }
        if (fields.ordinalDay !== undefined) {
            return this.shared([year, given('ordinalDay', 1)], ([y, n]) =>
                this.calendarDate(
                    this.sql.addTime(january(y, 1), `${n} - 1`, '0'),
                    time,
                    timezone,
                    kind,
                    (day) => `${whole(y, n)} AND ${n} >= 1 AND EXTRACT(YEAR FROM ${day}) = ${y}`
                )
            );
        }
        return this.shared([year, given('quarter', 1), given('dayOfQuarter', 1)], ([y, q, n]) =>
            this.calendarDate(
                this.sql.addTime(this.sql.addMonths(january(y, 1), `(${q} - 1) * 3`), `${n} - 1`, '0'),
                time,
                timezone,
                kind,
                () => `${whole(y, q, n)} AND ${q} BETWEEN 1 AND 4 AND ${n} BETWEEN 1 AND 92`
            )
        );
    }

    // ----- Values made from another -----

    /**
     * The text of `kind` made of the value `date` gives its date and the value `time` gives its time of day (one value
     * where a map's `datetime` gives both), with the fields `fields` laid over theirs, SQL numbers each by Cypher's
     * names, and the offset's text `timezone`, as Neo4j lays them:
     * - A `week` is of the base's week-based year or the `year` given, and keeps its day of the week unless one is
     *   given; an `ordinalDay` is of its year or the one given; a `dayOfQuarter` of its quarter or the one given. Each
     *   is worked out as {@link ofCalendar} works it out.
     * - Else a `year`, a `month` and a `day` given make a date with the base's others, which fails where it is none
     *   (February 29th of another year); then a `quarter` alone moves it so many quarters, to the month's last day where
     *   it has fewer, and a `dayOfWeek` alone to that day of its week. Beside a `dayOfWeek` the `year` moves the date so
     *   many years, to the month's last day where it has fewer, and doesn't fail.
     * - A millisecond, a microsecond or a nanosecond given makes the whole fraction of the second.
     * - A time of day or a moment that gives the time keeps its offset, else UTC's; with a `timezone` it is moved there,
     *   the same moment, where it has an offset, and given that offset where it has none.
     *
     * Without `date`, the fields give the date as a map's fields do; without `time`, the time. Fails as the statement
     * runs where a value given is null, or of a kind that hasn't what it is to give, or the `timezone` is null or no
     * offset, as Neo4j fails. As drivine4j's.
     */
    over(
        date: TemporalBase | undefined,
        time: TemporalBase | undefined,
        fields: Record<string, string>,
        timezone: string | undefined,
        kind: Temporal
    ): string {
        const bases = [...new Set([date, time].filter((it): it is TemporalBase => it !== undefined))];
        return this.shared(
            bases.map((it) => it.text),
            (texts) => {
                const text = (base: TemporalBase): string => texts[bases.indexOf(base)];
                const clocks = bases.map((it) => this.clock(text(it), it.kinds));
                return this.shared(clocks, (bound) => {
                    const day = date !== undefined ? bound[bases.indexOf(date)] : undefined;
                    const clock = time !== undefined ? bound[bases.indexOf(time)] : undefined;
                    const own = time !== undefined && kind.zoned ? this.ownOffset(text(time), time.kinds) : undefined;
                    // Where what gives the time may be local, as its text tells.
                    const open = own !== undefined && time!.kinds.some((it) => !it.zoned);
                    let made: string;
                    if (!kind.zoned) {
                        made = this.overFields(day, clock, fields, undefined, kind);
                    } else if (timezone === undefined) {
                        made = this.overFields(day, clock, fields, open ? `COALESCE(${own}, 'Z')` : own, kind);
                    } else if (own === undefined) {
                        made = this.overFields(day, clock, fields, timezone, kind);
                    } else {
                        const offset = open ? `COALESCE(${own}, ${timezone})` : own;
                        made = this.movedTo(this.overFields(day, clock, fields, offset, kind), kind, timezone);
                    }
                    // A value given that is null, or of a kind that hasn't what it is to give, or a time zone an
                    // expression gives that is null or none, fails as on Neo4j: its date is the day 0, which every
                    // store fails on, written of the condition so that a store can't fail on it where it isn't reached.
                    return this.shared([made], ([value]) => {
                        // The time zone too, which Oracle's `||` would drop where it is null, not make the text null.
                        const given = [...bound, ...(timezone !== undefined ? [timezone] : []), value]
                            .map((it) => `${it} IS NOT NULL`)
                            .join(' AND ');
                        const none = this.of({ day: `CASE WHEN ${given} THEN 1 ELSE 0 END` }, undefined, Temporal.DATE);
                        return `CASE WHEN ${given} THEN ${value} ELSE ${none} END`;
                    });
                });
            }
        );
    }

    /**
     * A field of the text `text` of `kind`, by Cypher's name for it: a number, or for `timezone` and `offset` a text;
     * undefined for a name the kind has no field of. A zoned value's fields are those of its wall clock.
     */
    field(text: string, kind: Temporal, name: string): Field | undefined {
        if (kind === Temporal.DURATION) {
            if (!DURATION_FIELDS[name]) {
                return undefined;
            }
            return { sql: this.shared([text], ([t]) => this.durationField(this.parts(t), name)), text: false };
        }
        if (kind.zoned && ZONE_FIELDS.includes(name)) {
            return this.zoneField(text, name);
        }
        const epoch = "TIMESTAMP '1970-01-01 00:00:00'";
        if (name === 'epochSeconds') {
            return { sql: `TRUNC(${this.sql.secondsBetween(epoch, this.sql.utc(text, kind))})`, text: false };
        }
        if (name === 'epochMillis') {
            return { sql: `TRUNC(${this.sql.secondsBetween(epoch, this.sql.utc(text, kind))} * 1000)`, text: false };
        }
        if (!INSTANT_FIELDS.includes(name)) {
            return undefined;
        }
        return { sql: this.shared([this.sql.local(text, kind)], ([t]) => this.clockField(t, name)), text: false };
    }

    /** The text of `kind` the duration text `duration` after the text `text` of it, or with `sign` -1 before: a zoned value keeps its offset. */
    add(text: string, kind: Temporal, duration: string, sign: number): string {
        return this.shared([text, duration], ([t, d]) =>
            this.format(
                this.moved(this.sql.local(t, kind), d, sign, kind === Temporal.DATE ? '1 = 1' : undefined),
                kind,
                this.offsetOf(t, kind, kind)
            )
        );
    }

    /**
     * {@link add} for a text of whatever kind its shape tells: read as a wall clock once, whatever its kind, the
     * duration added once, and written as the kind it was.
     */
    addToAny(text: string, duration: string, sign: number): string {
        return this.shared([text, duration], ([t, d]) => {
            const clock = `CASE ${Temporal.instants
                .map((it) => `WHEN ${this.isKind(t, it)} THEN ${this.sql.local(t, it)}`)
                .join(' ')} END`;
            return this.shared(
                [this.moved(clock, d, sign, this.isKind(t, Temporal.DATE))],
                ([moved]) =>
                    `CASE ${Temporal.instants
                        .map(
                            (it) =>
                                `WHEN ${this.isKind(t, it)} THEN ${this.format(moved, it, this.offsetOf(t, it, it))}`
                        )
                        .join(' ')} END`
            );
        });
    }

    /**
     * The text of `to` the text `text` of `from` is, cut short to `unit`, with `overrides` in place of its fields where it
     * has any: undefined where the store truncates to no such unit.
     */
    truncate(unit: string, text: string, from: Temporal, to: Temporal, overrides?: Overrides): string | undefined {
        if (this.sql.truncate(unit, 'NULL') === undefined) {
            return undefined;
        }
        if (
            overrides === undefined ||
            (Object.keys(overrides.fields).length === 0 && overrides.timezone === undefined)
        ) {
            return this.shared([text], ([t]) =>
                this.format(this.sql.truncate(unit, this.sql.local(t, from))!, to, this.offsetOf(t, from, to))
            );
        }
        return this.shared([text], ([t]) =>
            this.shared([this.sql.truncate(unit, this.sql.local(t, from))!], ([cut]) =>
                this.overridden(cut, unit, to, overrides, overrides.timezone ?? this.offsetOf(t, from, to))
            )
        );
    }

    /** What the text `text` of `kind` sorts by: the moment it is, whatever its offset, as a timestamp. */
    moment(text: string, kind: Temporal): string {
        return this.sql.utc(text, kind);
    }

    /** Whether the text `a` stands to the text `b`, both of `kind`, as `operator` says: null where either is no such text. */
    compare(a: string, b: string, kind: Temporal, operator: string): string {
        return this.shared([a, b], ([x, y]) => {
            let test: string;
            if (kind === Temporal.DURATION) {
                // A duration is equal to another of the same parts, and is in no order.
                if (operator !== '=' && operator !== '<>') {
                    test = 'NULL';
                } else {
                    const [p, q] = [this.parts(x), this.parts(y)];
                    const equal = `(${p.months} = ${q.months} AND ${p.days} = ${q.days} AND ${p.seconds} = ${q.seconds})`;
                    test = operator === '=' ? equal : `NOT ${equal}`;
                }
            } else if (kind.zoned && (operator === '=' || operator === '<>')) {
                // Two zoned values are equal where they are the same moment at the same offset, as Neo4j has them.
                const equal = `(${this.sql.utc(x, kind)} = ${this.sql.utc(y, kind)} AND ${this.offset(
                    x
                )} = ${this.offset(y)})`;
                test = operator === '=' ? equal : `NOT ${equal}`;
            } else {
                test = `${this.sql.utc(x, kind)} ${operator} ${this.sql.utc(y, kind)}`;
            }
            return `CASE WHEN ${this.isKind(x, kind)} AND ${this.isKind(y, kind)} THEN ${test} END`;
        });
    }

    // ----- Durations -----

    /** The duration text of the fields `fields`, SQL numbers each by Cypher's names (`years`, `months`, `weeks`, `days`, `hours`…). */
    duration(fields: Record<string, string>): string {
        const f = (name: string): string => fields[name] ?? '0';
        return this.text({
            months: `(${f('years')} * 12 + ${f('quarters')} * 3 + ${f('months')})`,
            days: `(${f('weeks')} * 7 + ${f('days')})`,
            seconds:
                `(${f('hours')} * 3600 + ${f('minutes')} * 60 + ${f('seconds')} + ${f('milliseconds')} / 1000 + ` +
                `${f('microseconds')} / 1000000 + ${f('nanoseconds')} / 1000000000)`
        });
    }

    /** The duration text of the sum of the duration texts `a` and `b`, or with `sign` -1 their difference. */
    sum(a: string, b: string, sign: number): string {
        return this.shared([a, b], ([x, y]) => {
            const [p, q] = [this.parts(x), this.parts(y)];
            const op = sign < 0 ? '-' : '+';
            return this.text({
                months: `(${p.months} ${op} ${q.months})`,
                days: `(${p.days} ${op} ${q.days})`,
                seconds: `(${p.seconds} ${op} ${q.seconds})`
            });
        });
    }

    /** The duration text of the duration text `duration` times `factor`, a SQL number. */
    times(duration: string, factor: string): string {
        return this.shared([duration, factor], ([d, f]) => {
            const p = this.parts(d);
            return this.text({
                months: `(${p.months} * ${f})`,
                days: `(${p.days} * ${f})`,
                seconds: `(${p.seconds} * ${f})`
            });
        });
    }

    /** The canonical duration text of the duration text `text`: null where it is none. */
    durationOf(text: string): string {
        return this.shared(
            [text],
            ([t]) => `CASE WHEN ${this.isKind(t, Temporal.DURATION)} THEN ${this.text(this.parts(t))} END`
        );
    }

    /**
     * `duration.between`: the duration from the text `from` of `kind` to the text `to` of `toKind`, in whole months as a
     * calendar counts them, then days, then seconds; with `unit` `months`, `days` or `seconds`, in that alone. Two zoned
     * values are read as the moments they are; where either is local, both are read on their wall clocks.
     */
    between(from: string, to: string, kind: Temporal, unit?: string, toKind: Temporal = kind): string {
        const zoned = kind.zoned && toKind.zoned;
        const read = (text: string, of: Temporal): string =>
            zoned ? this.sql.utc(text, of) : this.sql.local(text, of);
        return this.betweenClocks(
            read(from, kind),
            read(to, toKind),
            TIMES.includes(kind) || TIMES.includes(toKind),
            unit
        );
    }

    /**
     * The text of `kind` of the timestamp `cut`, cut short to `unit`, with the fields `overrides` gives in place of its
     * own, and the offset `offset`, as Neo4j lays a truncation's fields over the value: the year, month and day, then the
     * time, then the day of the week, which moves the value within its ISO week. A millisecond or a microsecond given makes
     * the whole fraction of the second, but a microsecond given a value cut to the millisecond is added to the millisecond
     * kept.
     */
    private overridden(cut: string, unit: string, kind: Temporal, overrides: Overrides, offset?: string): string {
        const given = overrides.fields;
        const own: Record<string, string> = Object.fromEntries(
            ['year', 'month', 'day', 'hour', 'minute', 'second'].map((it) => [
                it,
                given[it] ?? this.clockField(cut, it)
            ])
        );
        const micros = this.sql.number(this.sql.micros(cut));
        const carried = unit === 'millisecond' && given.microsecond !== undefined;
        let fraction: string;
        if (given.millisecond !== undefined) {
            fraction =
                `${given.millisecond} * 1000` +
                (carried || given.microsecond === undefined ? '' : ` + ${given.microsecond}`);
        } else if (given.microsecond !== undefined) {
            fraction = carried ? `(${micros} + ${given.microsecond})` : given.microsecond;
        } else {
            fraction = micros;
        }
        const made = this.of({ ...own, microsecond: fraction }, offset, kind);
        const day = given.dayOfWeek;
        if (day === undefined) {
            return made;
        }
        return this.shared([made], ([m]) =>
            this.shared([this.sql.local(m, kind)], ([clock]) =>
                this.format(
                    this.sql.addTime(clock, `${day} - ${this.sql.dayOfWeek(clock)}`, '0'),
                    kind,
                    kind.zoned ? this.offset(m) : undefined
                )
            )
        );
    }

    private betweenClocks(from: string, to: string, times: boolean, unit: string | undefined): string {
        return this.shared([from, to], ([a, b]) => {
            const months = times ? '0' : this.sql.monthsBetween(a, b);
            if (unit === 'months') {
                return this.text({ months, days: '0', seconds: '0' });
            }
            if (unit === 'days') {
                return this.text({
                    months: '0',
                    days: `TRUNC(${this.sql.secondsBetween(a, b)} / 86400)`,
                    seconds: '0'
                });
            }
            if (unit === 'seconds') {
                return this.text({ months: '0', days: '0', seconds: this.sql.secondsBetween(a, b) });
            }
            return this.shared([months], ([m]) =>
                this.shared([this.sql.secondsBetween(this.sql.addMonths(a, m), b)], ([rest]) =>
                    this.text({
                        months: m,
                        days: `TRUNC(${rest} / 86400)`,
                        seconds: `(${rest} - TRUNC(${rest} / 86400) * 86400)`
                    })
                )
            );
        });
    }

    /** A second's fraction as Java writes one: none for a whole second, else three digits or six. */
    private fraction(timestamp: string): string {
        return this.shared(
            [this.sql.micros(timestamp)],
            ([f]) =>
                `CASE WHEN ${f} = '000000' THEN '' WHEN SUBSTR(${f}, 4, 3) = '000' THEN '.' || SUBSTR(${f}, 1, 3) ELSE '.' || ${f} END`
        );
    }

    /** The offset a value of `to` made of the text `text` of `from` has: its own, or UTC's where it has none; none where `to` is local. */
    private offsetOf(text: string, from: Temporal, to: Temporal): string | undefined {
        if (!to.zoned) {
            return undefined;
        }
        return from.zoned ? this.offset(text) : "'Z'";
    }

    /**
     * {@link of} the date the timestamp `date` reads where `valid` holds of it, else of the day 0, and the fields of the
     * time `time`. A moment's date is read as a date first: every store fails on a date's day 0, where Oracle reads a
     * moment's text as a JSON value's, null where it is no moment.
     */
    private calendarDate(
        date: string,
        time: Record<string, string>,
        timezone: string | undefined,
        kind: Temporal,
        valid: (day: string) => string
    ): string {
        return this.shared([date], ([day]) =>
            this.dated(
                {
                    year: `EXTRACT(YEAR FROM ${day})`,
                    month: `EXTRACT(MONTH FROM ${day})`,
                    day: `CASE WHEN NOT (${valid(day)}) THEN 0 ELSE EXTRACT(DAY FROM ${day}) END`
                },
                time,
                timezone,
                kind
            )
        );
    }

    /**
     * {@link of} the date of the fields `date` (`year`, `month`, `day`) and the fields of the time `time`, the date read
     * as a date first where `kind` has a time too, so a store fails on a day its month has none of: see
     * {@link calendarDate}.
     */
    private dated(
        date: Record<string, string>,
        time: Record<string, string>,
        timezone: string | undefined,
        kind: Temporal
    ): string {
        if (kind === Temporal.DATE) {
            return this.of(date, undefined, kind);
        }
        return this.shared([this.sql.local(this.of(date, undefined, Temporal.DATE), Temporal.DATE)], ([checked]) =>
            this.of({ ...time, ...this.dateOf(checked) }, timezone, kind)
        );
    }

    /** The year, the month and the day of the month of the timestamp `timestamp`, as {@link of} takes them. */
    private dateOf(timestamp: string): Record<string, string> {
        return {
            year: `EXTRACT(YEAR FROM ${timestamp})`,
            month: `EXTRACT(MONTH FROM ${timestamp})`,
            day: `EXTRACT(DAY FROM ${timestamp})`
        };
    }

    /**
     * The offset of the text `text` of one of `kinds`, which gives a value made {@link over} its time: undefined where
     * none of them has one, and null where its text tells it is local.
     */
    private ownOffset(text: string, kinds: Temporal[]): string | undefined {
        const zoned = kinds.filter((it) => it.zoned);
        if (zoned.length === 0) {
            return undefined;
        }
        if (zoned.length === kinds.length) {
            return this.offset(text);
        }
        return `CASE WHEN ${zoned.map((it) => this.isKind(text, it)).join(' OR ')} THEN ${this.offset(text)} END`;
    }

    /** The wall clock the text `text` reads, of the one of `kinds` it is: null where it is none. */
    private clock(text: string, kinds: Temporal[]): string {
        if (kinds.length === 1) {
            return this.sql.local(text, kinds[0]);
        }
        return `CASE ${Temporal.instants
            .filter((it) => kinds.includes(it))
            .map((it) => `WHEN ${this.isKind(text, it)} THEN ${this.sql.local(text, it)}`)
            .join(' ')} END`;
    }

    /**
     * {@link over}'s value of the wall clocks `day` and `clock` (undefined where none is given), laid over by `fields`,
     * with the offset `offset`.
     */
    private overFields(
        day: string | undefined,
        clock: string | undefined,
        fields: Record<string, string>,
        offset: string | undefined,
        kind: Temporal
    ): string {
        const time = this.overTime(clock, fields);
        if (kind === Temporal.LOCAL_TIME || kind === Temporal.TIME) {
            return this.of(time, offset, kind);
        }
        if (day === undefined) {
            const calendar = Object.fromEntries(
                Object.entries(fields).filter(([name]) => name === 'year' || CALENDAR_FIELDS.includes(name))
            );
            if (Object.keys(calendar).some((it) => CALENDAR_FIELDS.includes(it))) {
                return this.ofCalendar({ ...calendar, ...time }, offset, kind);
            }
            const date = Object.fromEntries(Object.entries(fields).filter(([name]) => DAY.includes(name)));
            return this.of({ ...date, ...time }, offset, kind);
        }
        return this.overDay(day, fields, time, offset, kind);
    }

    /** {@link over}'s fields of the time of the wall clock `clock` (undefined where none is given), laid over by `fields`. */
    private overTime(clock: string | undefined, fields: Record<string, string>): Record<string, string> {
        const time: Record<string, string> = {};
        const read: Record<string, (t: string) => string> = {
            hour: (t) => `EXTRACT(HOUR FROM ${t})`,
            minute: (t) => `EXTRACT(MINUTE FROM ${t})`,
            second: (t) => `TRUNC(EXTRACT(SECOND FROM ${t}))`
        };
        Object.entries(read).forEach(([name, of]) => {
            const value = fields[name] ?? (clock !== undefined ? of(clock) : undefined);
            if (value !== undefined) {
                time[name] = value;
            }
        });
        if (FRACTION.some((it) => fields[it] !== undefined)) {
            FRACTION.filter((it) => fields[it] !== undefined).forEach((it) => (time[it] = fields[it]));
        } else if (clock !== undefined) {
            time.microsecond = this.sql.number(this.sql.micros(clock));
        }
        return time;
    }

    /** {@link over}'s value of the wall clock `day` that gives the date, laid over by `fields`, and the time `time`. */
    private overDay(
        day: string,
        fields: Record<string, string>,
        time: Record<string, string>,
        offset: string | undefined,
        kind: Temporal
    ): string {
        const own = (name: string): string => fields[name] ?? this.clockField(day, name);
        if (fields.week !== undefined) {
            return this.ofCalendar(
                {
                    year: fields.year ?? this.clockField(day, 'weekYear'),
                    week: own('week'),
                    dayOfWeek: own('dayOfWeek'),
                    ...time
                },
                offset,
                kind
            );
        }
        if (fields.ordinalDay !== undefined) {
            return this.ofCalendar({ year: own('year'), ordinalDay: own('ordinalDay'), ...time }, offset, kind);
        }
        if (fields.dayOfQuarter !== undefined) {
            return this.ofCalendar(
                { year: own('year'), quarter: own('quarter'), dayOfQuarter: own('dayOfQuarter'), ...time },
                offset,
                kind
            );
        }
        if (!DAY.some((it) => fields[it] !== undefined)) {
            return this.moveDay(day, fields, time, offset, kind);
        }
        if (fields.dayOfWeek !== undefined) {
            // Beside a day of the week (no month or day can be), a year moves the date so many years, to February 28th
            // from the 29th of a common year, as Neo4j moves it, where alone it fails there.
            return this.moveDay(
                this.sql.addMonths(day, `(${own('year')} - ${this.clockField(day, 'year')}) * 12`),
                fields,
                time,
                offset,
                kind
            );
        }
        const date = Object.fromEntries(DAY.map((it) => [it, own(it)]));
        return this.shared([this.sql.local(this.of(date, undefined, Temporal.DATE), Temporal.DATE)], ([checked]) =>
            this.moveDay(checked, fields, time, offset, kind)
        );
    }

    /** {@link over}'s value of the date `day`, moved by a `quarter` or a `dayOfWeek` among `fields` where one is. */
    private moveDay(
        day: string,
        fields: Record<string, string>,
        time: Record<string, string>,
        offset: string | undefined,
        kind: Temporal
    ): string {
        const whole = (value: string, last: number): string =>
            `${value} = TRUNC(${value}) AND ${value} BETWEEN 1 AND ${last}`;
        if (fields.quarter !== undefined) {
            return this.shared([fields.quarter], ([q]) =>
                this.calendarDate(
                    this.sql.addMonths(day, `(${q} - ${this.clockField(day, 'quarter')}) * 3`),
                    time,
                    offset,
                    kind,
                    () => whole(q, 4)
                )
            );
        }
        if (fields.dayOfWeek !== undefined) {
            return this.shared([fields.dayOfWeek], ([d]) =>
                this.calendarDate(
                    this.sql.addTime(day, `${d} - ${this.sql.dayOfWeek(day)}`, '0'),
                    time,
                    offset,
                    kind,
                    () => whole(d, 7)
                )
            );
        }
        return this.of({ ...this.dateOf(day), ...time }, offset, kind);
    }

    /** The text of `kind`, zoned, the same moment as the text `text` of it at the offset's text `timezone`. */
    private movedTo(text: string, kind: Temporal, timezone: string): string {
        return this.shared([text, timezone], ([t, z]) =>
            this.format(
                this.sql.addTime(this.sql.utc(t, kind), '0', this.zoneField(z, 'offsetSeconds').sql),
                kind,
                this.offset(z)
            )
        );
    }

    /** A field of the wall clock `t`, a timestamp, by Cypher's name for it. */
    private clockField(t: string, name: string): string {
        const second = `EXTRACT(SECOND FROM ${t})`;
        const fields: Record<string, () => string> = {
            year: () => `EXTRACT(YEAR FROM ${t})`,
            quarter: () => `TRUNC((EXTRACT(MONTH FROM ${t}) + 2) / 3)`,
            month: () => `EXTRACT(MONTH FROM ${t})`,
            week: () => this.sql.number(`to_char(${t}, 'IW')`),
            weekYear: () => this.sql.number(`to_char(${t}, 'IYYY')`),
            day: () => `EXTRACT(DAY FROM ${t})`,
            ordinalDay: () => this.sql.number(`to_char(${t}, 'DDD')`),
            dayOfQuarter: () =>
                `(${this.sql.number(`to_char(${t}, 'DDD')`)} - ${this.sql.number(
                    `to_char(${this.sql.truncate('quarter', t)!}, 'DDD')`
                )} + 1)`,
            dayOfWeek: () => this.sql.dayOfWeek(t),
            weekDay: () => this.sql.dayOfWeek(t),
            hour: () => `EXTRACT(HOUR FROM ${t})`,
            minute: () => `EXTRACT(MINUTE FROM ${t})`,
            second: () => `TRUNC(${second})`,
            millisecond: () => `(TRUNC(${second} * 1000) - TRUNC(${second}) * 1000)`,
            microsecond: () => `(TRUNC(${second} * 1000000) - TRUNC(${second}) * 1000000)`
        };
        return (fields[name] ?? (() => `((TRUNC(${second} * 1000000) - TRUNC(${second}) * 1000000) * 1000)`))();
    }

    private zoneField(text: string, name: string): Field {
        const sql = this.shared([this.offset(text)], ([o]) => {
            const sign = `CASE WHEN SUBSTR(${o}, 1, 1) = '-' THEN -1 ELSE 1 END`;
            const minutes =
                `CASE WHEN ${o} = 'Z' THEN 0 ELSE ${sign} * (${this.sql.number(`SUBSTR(${o}, 2, 2)`)} * 60 + ` +
                `${this.sql.number(`SUBSTR(REPLACE(${o}, ':', ''), 4, 2)`)}) END`;
            if (name === 'timezone' || name === 'offset') {
                return o;
            }
            return name === 'offsetMinutes' ? minutes : `(${minutes}) * 60`;
        });
        return { sql, text: name === 'timezone' || name === 'offset' };
    }

    /**
     * The timestamp `timestamp` the duration text `duration` later, or with `sign` -1 earlier. Where `date`, a SQL
     * condition, holds, the duration's time is taken in whole days alone, as Cypher adds one to a date: a date less
     * `PT1H` is the same date, less `PT25H` the day before.
     */
    private moved(timestamp: string, duration: string, sign: number, date?: string): string {
        const s = sign < 0 ? '-' : '';
        const parts = this.parts(duration);
        const seconds =
            date === undefined
                ? parts.seconds
                : this.shared(
                      [parts.seconds],
                      ([sec]) => `CASE WHEN ${date} THEN TRUNC(${sec} / 86400) * 86400 ELSE ${sec} END`
                  );
        return this.sql.addTime(
            this.sql.addMonths(timestamp, `${s}(${parts.months})`),
            `${s}(${parts.days})`,
            `${s}(${seconds})`
        );
    }

    /**
     * The parts of the duration text `text`, which each read it more than once: `text` is a name, written once. A part
     * it leaves out is 0, and every part of null is null, so a duration of null is added as null. A duration negated
     * whole opens with its sign.
     */
    private parts(text: string): Parts {
        const group = (name: string): string => {
            const [pattern, index] = Temporal.DURATION_PARTS[name];
            return this.sql.group(text, literal(pattern), index);
        };
        const part = (name: string): string => `COALESCE(${this.sql.number(group(name))}, 0)`;
        const sign = `CASE WHEN SUBSTR(${text}, 1, 1) = '-' THEN -1 WHEN ${text} IS NOT NULL THEN 1 END`;
        return {
            months: `(${sign} * (${part('years')} * 12 + ${part('months')}))`,
            days: `(${sign} * (${part('weeks')} * 7 + ${part('days')}))`,
            seconds: `(${sign} * (${part('hours')} * 3600 + ${part('minutes')} * 60 + ${part('seconds')}))`
        };
    }

    /**
     * The duration text of the parts `parts`, as Neo4j writes one: whole years and months, days, then hours, minutes
     * and seconds, each signed, and `PT0S` for none. A fraction of a month or a day goes to the parts below it, as
     * Cypher's does: a month as 30.436875 days. Null where a part is null.
     */
    private text(parts: Parts): string {
        return this.shared([parts.months, parts.days, parts.seconds], ([m0, d0, s0]) => {
            const m = `TRUNC(${m0})`;
            const d = `TRUNC(${d0} + (${m0} - TRUNC(${m0})) * 30.436875)`;
            const s = `(${s0} + (${d0} + (${m0} - TRUNC(${m0})) * 30.436875 - ${d}) * 86400)`;
            return this.shared([m, d, s], ([months, days, seconds]) => {
                const years = `TRUNC(${months} / 12)`;
                const hours = `TRUNC(${seconds} / 3600)`;
                const minutes = `(TRUNC(${seconds} / 60) - ${hours} * 60)`;
                const secs = `(${seconds} - TRUNC(${seconds} / 60) * 60)`;
                const unit = (value: string, letter: string): string =>
                    `CASE WHEN ${value} <> 0 THEN ${durationNumber(value)} || '${letter}' ELSE '' END`;
                return (
                    `CASE WHEN ${months} = 0 AND ${days} = 0 AND ${seconds} = 0 THEN 'PT0S' WHEN ${seconds} IS NOT NULL THEN 'P' || ` +
                    `${unit(years, 'Y')} || ${unit(`(${months} - ${years} * 12)`, 'M')} || ${unit(days, 'D')} || ` +
                    `CASE WHEN ${seconds} <> 0 THEN 'T' || ${unit(hours, 'H')} || ${unit(minutes, 'M')} || ${unit(
                        secs,
                        'S'
                    )} ELSE '' END END`
                );
            });
        });
    }

    /** A field of a duration of the parts `parts`, by Cypher's name for it. */
    private durationField(parts: Parts, name: string): string {
        return DURATION_FIELDS[name](parts.months, parts.days, parts.seconds);
    }
}

/** A number as Neo4j writes one in a duration: no zeros after the point, nor the point where there is no fraction. */
function durationNumber(value: string): string {
    return `RTRIM(to_char(${value}, 'FM9999999999990.999999999'), '.')`;
}
