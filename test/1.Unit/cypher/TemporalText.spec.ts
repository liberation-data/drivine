import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { Temporal } from '@/cypher/sql/Temporal';
import { Temporals } from '@/cypher/sql/Temporals';

/**
 * A temporal value written as a text of its kind's shape that is no such value is refused with what drivine4j says of
 * it, which ends with what `java.time` says: the text it parsed (without its offset), and the first thing wrong, found
 * in the order `java.time` looks. Not in the spec, since the message ends with the JVM's own text.
 */
describe('A temporal text that is no such value', () => {
    it.each([
        [
            "date('2024-02-30')",
            "'2024-02-30' is no date: Text '2024-02-30' could not be parsed: Invalid date 'FEBRUARY 30'"
        ],
        [
            "date('2023-02-29')",
            "'2023-02-29' is no date: Text '2023-02-29' could not be parsed: Invalid date 'February 29' as '2023' is not a leap year"
        ],
        [
            "date('2024-02-32')",
            "'2024-02-32' is no date: Text '2024-02-32' could not be parsed: Invalid value for DayOfMonth (valid values 1 - 28/31): 32"
        ],
        [
            "date('2024-13-32')",
            "'2024-13-32' is no date: Text '2024-13-32' could not be parsed: Invalid value for MonthOfYear (valid values 1 - 12): 13"
        ],
        [
            "datetime('2024-02-30T10:00Z')",
            "'2024-02-30T10:00Z' is no datetime: Text '2024-02-30T10:00' could not be parsed: Invalid date 'FEBRUARY 30'"
        ],
        [
            "time('25:00+01:00')",
            "'25:00+01:00' is no time: Text '25:00' could not be parsed: Invalid value for HourOfDay (valid values 0 - 23): 25"
        ],
        [
            "localtime('25:61:61')",
            "'25:61:61' is no localtime: Text '25:61:61' could not be parsed: Invalid value for MinuteOfHour (valid values 0 - 59): 61"
        ],
        [
            "localdatetime('2024-02-10T25:61')",
            "'2024-02-10T25:61' is no localdatetime: Text '2024-02-10T25:61' could not be parsed: Invalid value for MinuteOfHour (valid values 0 - 59): 61"
        ],
        [
            "localtime('10:00:60')",
            "'10:00:60' is no localtime: Text '10:00:60' could not be parsed: Invalid value for SecondOfMinute (valid values 0 - 59): 60"
        ],
        [
            "localdatetime('2024-02-30T10:00:00.1234567890')",
            "'2024-02-30T10:00:00.1234567890' is no localdatetime: Text '2024-02-30T10:00:00.1234567890' could not be parsed, unparsed text found at index 29"
        ],
        [
            "date('-0001-02-29')",
            "'-0001-02-29' is no date: Text '-0001-02-29' could not be parsed: Invalid date 'February 29' as '-1' is not a leap year"
        ],
        ["date('-0000-01-01')", "'-0000-01-01' is no date: Text '-0000-01-01' could not be parsed at index 0"],
        [
            "datetime('-0000-01-01T10:00:00.1234567890Z')",
            "'-0000-01-01T10:00:00.1234567890Z' is no datetime: Text '-0000-01-01T10:00:00.1234567890' could not be parsed at index 0"
        ],
        [
            "time('10:00:00.1234567890Z')",
            "'10:00:00.1234567890Z' is no time: Text '10:00:00.1234567890' could not be parsed, unparsed text found at index 18"
        ]
    ])('%s is refused as drivine4j refuses it', (written, message) => {
        [new PostgresCypherCompiler('g'), new OracleCypherCompiler('g')].forEach((compiler) => {
            expect(() => compiler.compile(`RETURN ${written}`)).toThrow(message);
        });
    });

    it('past 64 characters is cut short in the message, as java.time cuts it', () => {
        const text = `10:00:00.${'1'.repeat(60)}`;
        expect(() => new PostgresCypherCompiler('g').compile(`RETURN localtime('${text}')`)).toThrow(
            `'${text}' is no localtime: Text '${text.substring(
                0,
                64
            )}...' could not be parsed, unparsed text found at index 18`
        );
    });

    it('of nine digits of a fraction of a second is a time', () => {
        expect(() => new PostgresCypherCompiler('g').compile("RETURN localtime('10:00:00.123456789')")).not.toThrow();
    });
});

/**
 * A year as Neo4j and ISO 8601 number it, read off a text the statement writes and written back as `toString` writes it:
 * `0000` is 1 BC, `-0044` is 45 BC (#511). A year of five digits is of no kind, as in drivine4j.
 */
describe('The canonical text of a year before 1', () => {
    it.each([
        ['0000-01-01', Temporal.DATE, '0000-01-01'],
        ['-0001-12-31', Temporal.DATE, '-0001-12-31'],
        ['-0044-03-15', Temporal.DATE, '-0044-03-15'],
        ['0000-02-29', Temporal.DATE, '0000-02-29'],
        ['-0004-02-29', Temporal.DATE, '-0004-02-29'],
        ['-0044-03-15T12:00:00.5+0200', Temporal.DATE_TIME, '-0044-03-15T12:00:00.500+02:00'],
        ['-0044-03-15T12:00:00.5+02:00', Temporal.DATE, '-0044-03-15'],
        ['-0044-03-15T12:00', Temporal.LOCAL_DATE_TIME, '-0044-03-15T12:00:00'],
        ['-0044-03-15T12:00:00.5+02:00', Temporal.LOCAL_TIME, '12:00:00.500'],
        ['12345-01-01', Temporal.DATE, undefined],
        ['-12345-01-01', Temporal.DATE, undefined]
    ])('of %s, as the kind asked for, is written back as it reads', (text, kind, canonical) => {
        expect(Temporals.canonical(text, kind)).toEqual(canonical);
        if (canonical !== undefined) {
            expect(Temporals.canonical(canonical, kind)).toEqual(canonical);
        }
    });
});

/**
 * Postgres and Oracle read a text whose year is 1000 to 9999 as it is, in a `WHEN` of its own ahead of its kind's, with
 * no test of its era: such a year is AD, written as ISO 8601 writes it. A year after 0 but before 1000, `0999`, opens
 * with `0` as 1 BC does, `0000`, so takes the kind's `WHEN`, which reads it by its era (#511).
 */
describe('A text of a year from 1000 on', () => {
    it.each([
        ['1000-01-01', true],
        ['9999-12-31', true],
        ['0999-12-31', false],
        ['0001-01-01', false],
        ['0000-01-01', false],
        ['-0044-03-15', false]
    ])('%s is read as it is: %s', (text, ad) => {
        expect(new RegExp(Temporal.DATE.adPattern!).test(text)).toEqual(ad);
        expect(new RegExp(Temporal.LOCAL_DATE_TIME.adPattern!).test(`${text}T12:00`)).toEqual(ad);
        expect(new RegExp(Temporal.DATE_TIME.adPattern!).test(`${text}T12:00:00+02:00`)).toEqual(ad);
        expect(new RegExp(Temporal.DATE.pattern).test(text)).toEqual(true);
    });

    it('has no pattern of its own for a time of day or a duration', () => {
        expect([Temporal.LOCAL_TIME, Temporal.TIME, Temporal.DURATION].map((it) => it.adPattern)).toEqual([
            undefined,
            undefined,
            undefined
        ]);
    });

    it.each([
        ['oracle', () => new OracleCypherCompiler('g')],
        ['postgres', () => new PostgresCypherCompiler('g')]
    ])('is compared with no test of its era on %s, ahead of a text of any year', (_, compilerFor) => {
        const sql = compilerFor().compile("MATCH (n:C) WHERE n.day < date('0001-01-01') RETURN n.id").sql;
        const where = sql.substring(sql.indexOf('CASE WHEN', sql.indexOf('WHERE')));
        const [ad, any] = [Temporal.DATE.adPattern!, Temporal.DATE.pattern].map((it) => where.indexOf(`'${it}'`));
        expect(ad).toBeGreaterThan(-1);
        expect(ad).toBeLessThan(any);
        // The era is tested for only after the kind's own test.
        expect(where.substring(0, any).toLowerCase()).not.toContain('ascii(');
        expect(where.substring(any).toLowerCase()).toContain('ascii(');
    });
});
