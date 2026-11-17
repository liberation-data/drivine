import neo4j from 'neo4j-driver';

const { Date: DriverDate, DateTime, Duration, LocalDateTime, LocalTime }: typeof neo4j.types = neo4j.types;

/**
 * `value`, a statement's parameters, with each `Temporal` value in it, at any depth of lists and maps, the Neo4j
 * driver's value of its kind, which the driver binds as that kind: the driver writes a `Temporal` value as an empty
 * map (#767). The SQL stores tag each by its kind (see `parametersJson`), so a statement gives alike on each.
 */
export function withTemporalsAsDriverValues(value: any): any {
    if (Array.isArray(value)) {
        const items = value.map(withTemporalsAsDriverValues);
        return items.some((item, i) => item !== value[i]) ? items : value;
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    const driver = driverValue(value);
    if (driver !== undefined) {
        return driver;
    }
    if (Object.getPrototypeOf(value) === Object.prototype) {
        const entries = Object.entries(value).map(([key, item]) => [key, withTemporalsAsDriverValues(item)] as const);
        return entries.some(([key, item]) => item !== value[key]) ? Object.fromEntries(entries) : value;
    }
    return value;
}

/**
 * The Neo4j driver's value of the `Temporal` value `value`; undefined where it is no `Temporal` value. One in another
 * calendar is read in the ISO one first, as Neo4j keeps none other: a hebrew date's `year` is 5784, not 2024.
 */
function driverValue(value: any): unknown {
    const it = typeof value.withCalendar === 'function' ? value.withCalendar('iso8601') : value;
    switch (it[Symbol.toStringTag]) {
        case 'Temporal.PlainDate':
            return new DriverDate(it.year, it.month, it.day);
        case 'Temporal.PlainTime':
            return new LocalTime(it.hour, it.minute, it.second, nanoseconds(it));
        case 'Temporal.PlainDateTime':
            return new LocalDateTime(it.year, it.month, it.day, it.hour, it.minute, it.second, nanoseconds(it));
        case 'Temporal.ZonedDateTime':
            return dateTime(it, it.timeZoneId);
        case 'Temporal.Instant':
            // At an offset of zero and no named zone, as Cypher's datetime('…Z') is.
            return dateTime(it.toZonedDateTimeISO('UTC'));
        case 'Temporal.Duration': {
            // As bigints, the whole seconds of the fraction carried to the seconds: a duration's milliseconds may be
            // past 2^53 nanoseconds, where a number would round, and past 2^63, where the driver's Integer wraps.
            const fraction =
                BigInt(it.milliseconds) * BigInt(1e6) + BigInt(it.microseconds) * BigInt(1e3) + BigInt(it.nanoseconds);
            return new Duration(
                it.years * 12 + it.months,
                it.weeks * 7 + it.days,
                BigInt(it.hours * 3600 + it.minutes * 60 + it.seconds) + fraction / BigInt(1e9),
                fraction % BigInt(1e9)
            );
        }
        default:
            return undefined;
    }
}

/** The driver's datetime of the `Temporal.ZonedDateTime` `it`, at its offset, and in the named zone `zone` where given. */
function dateTime(it: any, zone?: string): unknown {
    return new DateTime(
        it.year,
        it.month,
        it.day,
        it.hour,
        it.minute,
        it.second,
        nanoseconds(it),
        it.offsetNanoseconds / 1e9,
        zone
    );
}

/** The nanoseconds of `it`'s second, from its millisecond, microsecond and nanosecond. */
function nanoseconds(it: any): number {
    return it.millisecond * 1e6 + it.microsecond * 1e3 + it.nanosecond;
}
