import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

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
