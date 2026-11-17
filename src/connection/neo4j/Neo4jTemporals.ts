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

/** The Neo4j driver's value of the `Temporal` value `it`; undefined where it is no `Temporal` value. */
function driverValue(it: any): unknown {
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
        case 'Temporal.Duration':
            return new Duration(
                it.years * 12 + it.months,
                it.weeks * 7 + it.days,
                it.hours * 3600 + it.minutes * 60 + it.seconds,
                // As a bigint: a duration's milliseconds may be past 2^53 nanoseconds, where a number would round.
                BigInt(it.milliseconds) * BigInt(1e6) + BigInt(it.microseconds) * BigInt(1e3) + BigInt(it.nanoseconds)
            );
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
