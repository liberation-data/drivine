/**
 * A kind of temporal value, as openCypher has them. On a SQL store a temporal value is the ISO 8601 text a store keeps a
 * moment as, and `pattern` tells the kind from the text: a regular expression both stores read, written with capturing
 * groups alone, for Oracle's take no other kind.
 */
export interface Temporal {
    readonly name: 'DATE' | 'LOCAL_TIME' | 'TIME' | 'LOCAL_DATE_TIME' | 'DATE_TIME' | 'DURATION';
    readonly pattern: string;
    readonly zoned: boolean;
    /** Whether a value of this kind is a moment or a time of day, which a duration is added to. */
    readonly instant: boolean;
}

function kind(name: Temporal['name'], pattern: string, zoned: boolean = false): Temporal {
    return { name, pattern, zoned, instant: name !== 'DURATION' };
}

const DATE = kind('DATE', '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
const LOCAL_TIME = kind('LOCAL_TIME', '^[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?$');
const TIME = kind('TIME', '^[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?(Z|[+-][0-9]{2}:?[0-9]{2})$', true);
const LOCAL_DATE_TIME = kind(
    'LOCAL_DATE_TIME',
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?$'
);
const DATE_TIME = kind(
    'DATE_TIME',
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?(Z|[+-][0-9]{2}:?[0-9]{2})$',
    true
);
/** `P1Y2M3W4DT5H6M7.5S`, each part optional and signed, or the whole negated: its parts are read by `DURATION_PARTS`. */
const DURATION = kind(
    'DURATION',
    '^(-?)P((-?[0-9.]+)Y)?((-?[0-9.]+)M)?((-?[0-9.]+)W)?((-?[0-9.]+)D)?(T((-?[0-9.]+)H)?((-?[0-9.]+)M)?((-?[0-9.]+)S)?)?$'
);

/**
 * The days of a duration, from its start: its sign, then years, months, weeks and days, in groups `DURATION_PARTS`
 * names, the sign aside. A duration is read in two patterns, its days and its time, for Oracle reads no group past the
 * ninth.
 */
const DURATION_DAYS = '^(-?)P((-?[0-9.]+)Y)?((-?[0-9.]+)M)?((-?[0-9.]+)W)?((-?[0-9.]+)D)?';

/** The time of a duration, to its end: hours, minutes and seconds, in groups `DURATION_PARTS` names. */
const DURATION_TIME = 'T((-?[0-9.]+)H)?((-?[0-9.]+)M)?((-?[0-9.]+)S)?$';

export const Temporal = {
    DATE,
    LOCAL_TIME,
    TIME,
    LOCAL_DATE_TIME,
    DATE_TIME,
    DURATION,

    /** Every kind. */
    entries: [DATE, LOCAL_TIME, TIME, LOCAL_DATE_TIME, DATE_TIME, DURATION],

    /** The kinds of a moment or a time of day, the zoned before the local of each, as a text is told apart. */
    instants: [DATE_TIME, LOCAL_DATE_TIME, DATE, TIME, LOCAL_TIME],

    DURATION_DAYS,
    DURATION_TIME,

    /** The pattern, `DURATION_DAYS` or `DURATION_TIME`, and the group of it, that holds each part of a duration. */
    DURATION_PARTS: {
        years: [DURATION_DAYS, 3],
        months: [DURATION_DAYS, 5],
        weeks: [DURATION_DAYS, 7],
        days: [DURATION_DAYS, 9],
        hours: [DURATION_TIME, 2],
        minutes: [DURATION_TIME, 4],
        seconds: [DURATION_TIME, 6]
    } as Record<string, [string, number]>,

    /** The offset a zoned text ends with. */
    OFFSET: '(Z|[+-][0-9]{2}:?[0-9]{2})$',

    /** The kind of a function that makes a temporal value, by its name in lower case: `date`, `datetime`… */
    ofFunction(name: string): Temporal | undefined {
        const kinds: Record<string, Temporal> = {
            date: DATE,
            localtime: LOCAL_TIME,
            time: TIME,
            localdatetime: LOCAL_DATE_TIME,
            datetime: DATE_TIME,
            duration: DURATION
        };
        return kinds[name];
    },

    /** The kind a parameter bound to `value` is, as Drivine writes such a value: a `Date` is a moment. */
    ofValue(value: any): Temporal | undefined {
        return value instanceof Date ? DATE_TIME : undefined;
    }
};
