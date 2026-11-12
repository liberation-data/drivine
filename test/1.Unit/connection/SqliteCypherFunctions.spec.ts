import { openSqlite, SqliteDatabase, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { SqliteGraph } from '@/backend/sqlite/SqliteGraph';

/**
 * The functions compiled Cypher calls on SQLite, each asked directly in SQL: what each gives, and what it gives of null,
 * as drivine4j's `SqliteCypherFunctionsTest` asks them. A whole number is read as a bigint, so one SQLite holds as an
 * integer is told from one it holds as a real.
 */
describe('SqliteCypherFunctions', () => {
    let db: SqliteDatabase;

    beforeEach(() => {
        db = openSqlite(':memory:');
        SqliteFunctions.register(db);
    });

    afterEach(() => db.close());

    const row = (sql: string): SqliteValue[] => {
        const statement = db.prepare(sql);
        statement.setReadBigInts(true);
        statement.setReturnArrays(true);
        return statement.get() as unknown as SqliteValue[];
    };
    const one = (sql: string): SqliteValue => row(`SELECT ${sql}`)[0];
    const n = BigInt;
    /** NaN as SQLite's JSON writes it, where it holds no NaN: the one map that is NaN (liberation-data/drivine4j#295). */
    const NAN = '{"$numberDouble":"NaN"}';
    /** A test of a flag group within the expression, which JavaScript reads only as a group of its own: Node 22's does not. */
    const withScopedFlags = (() => {
        try {
            return new RegExp('(?i:a)') && it;
        } catch {
            return it.skip;
        }
    })();

    it('exports each function by drivine4j SQL name', () => {
        expect(SqliteFunctions).toMatchObject({
            EQUAL: 'drivine_equal',
            ADD: 'drivine_add',
            CANONICAL: 'drivine_canonical',
            CYPHER: 'drivine_cypher',
            UPPER: 'drivine_upper',
            SPLIT: 'drivine_split',
            REVERSE: 'drivine_reverse',
            UUID: 'drivine_uuid',
            REGEX_GROUP: 'drivine_regex_group',
            REGEX_REPLACE: 'drivine_regexp_replace',
            TRUNC: 'drivine_trunc',
            TO_CHAR: 'drivine_to_char',
            TEMPORAL: 'drivine_temporal',
            FLOAT_TEXT: 'drivine_float_text',
            SORT_KEY: 'drivine_sort_key',
            LIST_ORDER: 'drivine_list_order',
            MATH: 'drivine_math',
            ROUND: 'drivine_round',
            FAIL: 'drivine_fail'
        });
    });

    it('reads a real number given as text as SQLite writes one, to 15 digits', () => {
        expect(
            row(
                `SELECT drivine_upper(2.0), drivine_upper(1.0 / 3), drivine_upper(1e20), drivine_upper(1e-7), ` +
                    `drivine_upper(855.4482850851075), drivine_to_char(1e20, 'FM0'), drivine_upper(12)`
            )
        ).toEqual([
            '2.0',
            '0.333333333333333',
            '1.0E+20',
            '1.0E-07',
            '855.448285085108',
            '100000000000000000000',
            '12'
        ]);
    });

    describe('drivine_equal', () => {
        it('compares as Cypher does, and null with anything is null', () => {
            expect(
                row(
                    `SELECT drivine_equal('1', '1.0'), drivine_equal('{"a":1,"b":[1,2]}', '{"b":[1,2.0],"a":1}'), ` +
                        `drivine_equal('[1,2]', '[2,1]'), drivine_equal('"x"', '"x"'), drivine_equal('true', '1'), ` +
                        `drivine_equal('"7"', '7')`
                )
            ).toEqual([n(1), n(1), n(0), n(1), n(0), n(0)]);
            expect(row(`SELECT drivine_equal('null', '1'), drivine_equal(NULL, '1')`)).toEqual([null, null]);
        });

        it('is null where a null a list or map holds decides, and false where a pair differs', () => {
            expect(
                row(
                    `SELECT drivine_equal('[1,null]', '[1,null]'), drivine_equal('[2,null]', '[1,null]'), ` +
                        `drivine_equal('[1]', '[1,null]'), drivine_equal('{"a":null}', '{"b":null}'), ` +
                        `drivine_equal('9007199254740993', '9007199254740992.0'), drivine_equal('{"1":1,"b":2}', '{"b":2,"1":1}')`
                )
            ).toEqual([null, n(0), n(0), n(0), n(0), n(1)]);
        });

        it('finds NaN equal to nothing, itself too, and an infinity equal to itself (liberation-data/drivine4j#295)', () => {
            expect(
                row(
                    `SELECT drivine_equal('${NAN}', '${NAN}'), drivine_equal('[${NAN}]', '[${NAN}]'), drivine_equal('${NAN}', '1'), ` +
                        `drivine_equal('{"a":${NAN}}', '{"a":${NAN}}'), drivine_equal('[${NAN},null]', '[${NAN},null]'), ` +
                        `drivine_equal('${NAN}', 'null')`
                )
            ).toEqual([n(0), n(0), n(0), n(0), n(0), null]);
            expect(
                row(
                    `SELECT drivine_equal('9e999', '9e999'), drivine_equal('[-9e999]', '[-9e999]'), drivine_equal('9e999', '-9e999'), ` +
                        `drivine_equal('9e999', '9223372036854775807'), drivine_equal('-9e999', '-1e308')`
                )
            ).toEqual([n(1), n(1), n(0), n(0), n(0)]);
        });

        it('takes only the one map for NaN: another key, or another number, is a map as any is', () => {
            expect(
                row(
                    `SELECT drivine_equal('{"$numberDouble":"NaN","b":1}', '{"$numberDouble":"NaN","b":1}'), ` +
                        `drivine_equal('{"$numberDouble":"2.0"}', '{"$numberDouble":"2.0"}'), drivine_equal('{"$numberDouble":"Nan"}', '{"$numberDouble":"Nan"}')`
                )
            ).toEqual([n(1), n(1), n(1)]);
        });
    });

    describe('drivine_add', () => {
        it('sums, joins lists, takes a null into a list, and writes texts and numbers one after the other', () => {
            expect(
                row(
                    `SELECT drivine_add('1', '2'), drivine_add('1', '2.5'), drivine_add('[1]', '[2,3]'), drivine_add('[1]', NULL), ` +
                        `drivine_add('0', '[1]'), drivine_add('"a"', '1'), drivine_add('1.5', '"b"'), drivine_add('true', '"b"'), ` +
                        `drivine_add('1', NULL)`
                )
            ).toEqual(['3', '3.5', '[1,2,3]', '[1,null]', '[0,1]', '"a1"', '"1.5b"', null, null]);
        });

        it('stays whole past a long, and writes a double as Java does', () => {
            expect(
                row(
                    `SELECT drivine_add('9223372036854775807', '9223372036854775807'), drivine_add('1e2', '0'), ` +
                        `drivine_add('"x"', '1e7'), drivine_add('[{"b":1,"1":2}]', '1.50'), drivine_add('"\\u0001"', '""')`
                )
            ).toEqual(['18446744073709551614', '100.0', '"x1.0E7"', '[{"b":1,"1":2},1.5]', '"\\u0001"']);
        });

        it('adds a whole number already past a long whole, not by its low 64 bits (liberation-data/drivine4j#547)', () => {
            expect(row(`SELECT drivine_add('18446744073709551617', '1')`)).toEqual(['18446744073709551618']);
        });

        it('adds NaN as a number, writes NaN as its map and an infinity as SQLite does, and NaN as text by its name (liberation-data/drivine4j#295)', () => {
            expect(
                row(
                    `SELECT drivine_add('${NAN}', '1'), drivine_add('1.5', '${NAN}'), drivine_add('9e999', '-9e999'), drivine_add('9e999', '1'), ` +
                        `drivine_add('1e308', '1e308'), drivine_add('-1e308', '-1e308'), drivine_add('"a"', '${NAN}'), drivine_add('${NAN}', '"b"'), ` +
                        `drivine_add('"a"', '9e999'), drivine_add('[1]', '${NAN}'), drivine_add('${NAN}', '{}'), drivine_add('{"$numberDouble":"2.0"}', '1')`
                )
            ).toEqual([
                NAN,
                NAN,
                NAN,
                '9e999',
                '9e999',
                '-9e999',
                '"aNaN"',
                '"NaNb"',
                '"aInfinity"',
                `[1,${NAN}]`,
                null,
                null
            ]);
        });
    });

    it('drivine_canonical writes NaN as its map and an infinity as SQLite does, which JSON reads', () => {
        expect(one(`drivine_canonical('{"b":${NAN},"a":[9e999,-9e999]}')`)).toEqual(`{"a":[9e999,-9e999],"b":${NAN}}`);
    });

    it("drivine_canonical puts a map's keys in order at any depth", () => {
        expect(row(`SELECT drivine_canonical('{"b":1,"a":[{"y":2,"x":1}]}'), drivine_canonical(NULL)`)).toEqual([
            '{"a":[{"x":1,"y":2}],"b":1}',
            null
        ]);
        expect(row(`SELECT drivine_canonical('null'), drivine_canonical('{"b":1.50,"2":0,"10":0}')`)).toEqual([
            'null',
            '{"10":0,"2":0,"b":1.5}'
        ]);
    });

    describe('the text functions', () => {
        it('raise, split, reverse and make a UUID', () => {
            expect(
                row(
                    `SELECT drivine_upper('école'), drivine_split('a,,b,', ','), drivine_split('a😀', ''), drivine_split('', ','), ` +
                        `drivine_reverse('ab😀'), drivine_split(NULL, ','), drivine_upper('straße'), drivine_upper(NULL)`
                )
            ).toEqual(['ÉCOLE', '["a","","b",""]', '["a","😀"]', '[""]', '😀ba', null, 'STRASSE', null]);
            expect(one('drivine_uuid()')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(one('drivine_uuid() <> drivine_uuid()')).toEqual(n(1));
        });

        it('lowers as Unicode does', () => {
            expect(row(`SELECT drivine_lower('ÉCOLE'), drivine_lower(NULL)`)).toEqual(['école', null]);
        });
    });

    describe('regular expressions', () => {
        it('read a group, and replace matches naming groups with a backslash', () => {
            expect(
                row(
                    `SELECT drivine_regex_group('10:00+02:00', '([+-][0-9]{2}:?[0-9]{2})$', 1), drivine_regex_group('10:00', 'Z$', 1), ` +
                        `drivine_regexp_replace('+0200', '^([+-][0-9]{2})([0-9]{2})$', '\\1:\\2'), drivine_regexp_replace('ab', 'a', 'a$1')`
                )
            ).toEqual(['+02:00', null, '+02:00', 'a$1b']);
        });

        it('give null of a group past the expression, or one that takes no part', () => {
            expect(
                row(
                    `SELECT drivine_regex_group('ab', '(a)(x)?', 2), drivine_regex_group('ab', '(a)', 2), ` +
                        `drivine_regex_group('ab', '(a)b', 0), drivine_regex_group(NULL, 'a', 1)`
                )
            ).toEqual([null, null, 'ab', null]);
        });

        it('replace with the whole match, a literal backslash, and nothing for a group that takes no part', () => {
            expect(
                row(
                    `SELECT drivine_regexp_replace('abc', 'b', '[\\0]'), drivine_regexp_replace('abc', 'b', '\\x'), ` +
                        `drivine_regexp_replace('abc', '(b)(z)?', '<\\2>'), drivine_regexp_replace('abc', '(b)', '\\10'), ` +
                        `drivine_regexp_replace(NULL, 'b', 'x')`
                )
            ).toEqual(['a[b]c', 'a\\xc', 'a<>c', 'ab0c', null]);
            expect(() => one(`drivine_regexp_replace('abc', 'b', '\\2')`)).toThrow('No group 2');
        });

        withScopedFlags('read a flag group anywhere in the expression, as Java does', () => {
            expect(
                row(
                    `SELECT 'ABC' REGEXP '^(?:(?i)abc)\\z', 'ABC' REGEXP '^(?:abc)\\z', 'xABC' REGEXP '^(?:x(?i)abc)$', ` +
                        `'XABC' REGEXP '^(?:x(?i)abc)$', 'a[(?i)]' REGEXP '\\[\\(\\?i\\)\\]'`
                )
            ).toEqual([n(1), n(0), n(1), n(0), n(1)]);
        });

        // Each result as Java gives it, `Pattern.compile("^(?:" + pattern + ")\\z").matcher(text).find()`. Node 22 reads
        // none of these: see SqlitePatterns.spec.ts for what it reads.
        withScopedFlags.each([
            ['a(?i)b|c', 'C', 1],
            ['a(?i)b|c', 'ac', 0],
            ['a(?i)b|c', 'aB', 1],
            ['a(?i)b|c', 'xC', 0],
            ['a(?i)b|c|d', 'D', 1],
            ['a(?i)b|c|d', 'aC', 0],
            ['(?:x|y(?i)z|w)', 'W', 1],
            ['(?:x|y(?i)z|w)', 'yZ', 1],
            ['(?:x|y(?i)z|w)', 'x', 1],
            ['(?:x|y(?i)z|w)', 'X', 0],
            ['a(?i)(?:b|c)d|e', 'aCD', 1],
            ['a(?i)(?:b|c)d|e', 'E', 1],
            ['a(?i)(?:b|c)d|e', 'aE', 0],
            ['a(?i)[b|c]', 'A|', 0],
            ['a(?i)[b|c]', 'a|', 1],
            ['a(?i)[b|c]', 'aC', 1],
            ['a(?i)[b|c]', 'C', 0],
            ['a(?i)b\\|c', 'aB|C', 1],
            ['a(?i)b\\|c', 'C', 0],
            ['a(?i)b\\|c', 'aB', 0],
            ['a(?i)b(?-i)c|d', 'D', 0],
            ['a(?i)b(?-i)c|d', 'd', 1],
            ['a(?i)b(?-i)c|d', 'aBc', 1],
            ['x|(?i)a|b', 'B', 1],
            ['x|(?i)a|b', 'X', 0],
            ['a(?i)|b', 'B', 1],
            ['(?:a(?i)b|c)+', 'aBC', 1],
            ['(?:a(?i)b|c)+', 'AB', 0],
            ['(a)(?i)\\1', 'aA', 1],
            ['a(?i)(?:[(|]|x)b|c', 'a(B', 1],
            ['a(?i)(?:[(|]|x)b|c', 'C', 1],
            ['x(?:a(?i)b|c(?-i)d|e)y', 'xCdy', 1],
            ['x(?:a(?i)b|c(?-i)d|e)y', 'xCDy', 0],
            ['x(?:a(?i)b|c(?-i)d|e)y', 'xEy', 0]
        ])(
            'read a flag group before a | as Java does, to the group end with each alternative its own: %s on %s',
            (pattern, text, expected) => {
                expect(one(`'${text}' REGEXP '^(?:${pattern})\\z'`)).toEqual(n(expected));
            }
        );

        it('read \\z as the text end, and an escaped backslash before a z as itself', () => {
            expect(
                row(`SELECT 'a\\z' REGEXP '^(?:a\\\\z)\\z', 'a' REGEXP '^(?:a)\\z', 'ab' REGEXP '^(?:a)\\z'`)
            ).toEqual([n(1), n(1), n(0)]);
        });

        it('count matches as an integer', () => {
            expect(row(`SELECT drivine_regexp_count('aXa', 'a'), drivine_regexp_count(NULL, 'a')`)).toEqual([
                n(2),
                n(0)
            ]);
        });
    });

    describe('drivine_trunc', () => {
        it('cuts to a whole number', () => {
            expect(
                row(
                    `SELECT drivine_trunc(2.9), drivine_trunc(-2.9), drivine_trunc(7), drivine_trunc(NULL), drivine_trunc(1e300)`
                )
            ).toEqual([n(2), n(-2), n(7), null, 1e300]);
        });

        it('takes a real number a unit of its last place short of a whole number as that number', () => {
            expect(
                row(
                    `SELECT drivine_trunc(33.001 * 1000000), drivine_trunc(-33.001 * 1000000), drivine_trunc(3599.999999 / 3600), ` +
                        `drivine_trunc(9223372036854775807)`
                )
            ).toEqual([n(33001000), n(-33001000), n(0), n('9223372036854775807')]);
        });
    });

    describe('drivine_to_char', () => {
        it('writes a timestamp or a number in a pattern', () => {
            expect(
                row(
                    `SELECT drivine_to_char('2024-03-15T10:30:05.000000', 'YYYY-MM-DD"T"HH24:MI:SS'), ` +
                        `drivine_to_char('2024-12-30T00:00:00.000000', 'IYYY'), drivine_to_char('2024-03-15T00:00:00.000000', 'IW'), ` +
                        `drivine_to_char('2024-03-15T00:00:00.000000', 'DDD'), drivine_to_char(42, 'FM0000'), ` +
                        `drivine_to_char(2.5, 'FM9990.999'), drivine_to_char(3, 'FM9990.999'), drivine_to_char(-1.25, 'FM9990.999'), ` +
                        `drivine_to_char(NULL, 'FM00')`
                )
            ).toEqual(['2024-03-15T10:30:05', '2025', '11', '075', '0042', '2.5', '3.', '-1.25', null]);
        });

        it('writes a year before 1 as ISO 8601 numbers it: four digits after its sign, 0000 for 1 BC', () => {
            expect(
                row(
                    `SELECT drivine_to_char('-0044-03-15T10:30:05.000000', 'YYYY-MM-DD"T"HH24:MI:SS'), ` +
                        `drivine_to_char('0000-01-01T00:00:00.000000', 'YYYY-MM-DD'), drivine_to_char('0000-01-01T00:00:00.000000', 'IYYY'), ` +
                        `drivine_to_char('-1234-06-01T00:00:00.000000', 'YYYY')`
                )
            ).toEqual(['-0044-03-15T10:30:05', '0000-01-01', '-0001', '-1234']);
        });

        it('rounds a number half up, in decimal, and writes zero without a sign', () => {
            expect(
                row(
                    `SELECT drivine_to_char(2.345, 'FM0.00'), drivine_to_char(-2.5, 'FM0'), drivine_to_char(-0.0001, 'FM0.99'), ` +
                        `drivine_to_char(0.5, 'FM0'), drivine_to_char(1.0 / 3, 'FM0.999999999999999999'), ` +
                        `drivine_to_char('2024-01-01 10:00:00', 'HH24"h"')`
                )
            ).toEqual(['2.35', '-3', '0.', '1', '0.333333333333333', '10h']);
        });

        it('numbers ISO weeks as java.time does at the ends of a year', () => {
            expect(
                row(
                    `SELECT drivine_to_char('2021-01-03T00:00:00.000000', 'IYYY-IW'), drivine_to_char('2020-12-31T00:00:00.000000', 'IYYY-IW'), ` +
                        `drivine_to_char('2026-01-01T00:00:00.000000', 'IYYY-IW'), drivine_to_char('2024-12-31T00:00:00.000000', 'DDD')`
                )
            ).toEqual(['2020-53', '2020-53', '2026-01', '366']);
        });
    });

    it('drivine_float_text writes a real as Java writes a double', () => {
        expect(
            row(
                `SELECT drivine_float_text(2.0), drivine_float_text(1e7), drivine_float_text(1.2e-4), drivine_float_text(1.0 / 3), ` +
                    `drivine_float_text(-2.5), drivine_float_text(NULL), drivine_float_text(3)`
            )
        ).toEqual(['2.0', '1.0E7', '1.2E-4', '0.3333333333333333', '-2.5', null, '3.0']);
    });

    describe('drivine_sort_key', () => {
        it('orders lists as Cypher does, a text before one it begins', () => {
            const lists =
                '[[1, null], ["ab"], [true], [], [1e300], ["a\\u0002"], [[1]], [-1], [null], ["a"], [{"a": 1}], [1, 2], ' +
                '[false], ["a\\u0001"], [-2.5], [1], [0]]';
            expect(
                one(`(SELECT json_group_array(t.key ORDER BY drivine_sort_key(t.value)) FROM json_each('${lists}') t)`)
            ).toEqual('[3,10,6,9,13,5,1,12,2,14,7,16,15,11,0,4,8]');
        });

        it('orders NaN after every number, the infinities too (liberation-data/drivine4j#295)', () => {
            const lists = `[[1, ${NAN}], [1, 9e999], [1, 2.0], [1, -9e999], [1, "a"], [${NAN}], [null]]`;
            expect(
                one(`(SELECT json_group_array(t.key ORDER BY drivine_sort_key(t.value)) FROM json_each('${lists}') t)`)
            ).toEqual('[4,3,2,1,0,5,6]');
        });

        it('leaves any other value as it is', () => {
            expect(row(`SELECT drivine_sort_key('"x"'), drivine_sort_key(NULL), drivine_sort_key('null')`)).toEqual([
                '"x"',
                null,
                null
            ]);
        });
    });

    describe('drivine_list_order', () => {
        it('orders two lists as Cypher compares them', () => {
            expect(
                row(
                    `SELECT drivine_list_order('[1, 2]', '[1, 3]'), drivine_list_order('[1, 2.0]', '[1.0, 2]'), ` +
                        `drivine_list_order('[[1, 2]]', '[[1]]'), drivine_list_order('["\\uffff"]', '["\\ud83d\\ude00"]'), ` +
                        `drivine_list_order('[9007199254740993]', '[9007199254740992]'), drivine_list_order('[false]', '[true]'), ` +
                        `drivine_list_order('[{"a": 1}]', '[{"a": 1.0}]')`
                )
            ).toEqual([n(-1), n(0), n(1), n(-1), n(1), n(-1), n(0)]);
        });

        it('gives null where either is no list, or the pair that decides is not ordered', () => {
            expect(
                row(
                    `SELECT drivine_list_order('[null]', '[1]'), drivine_list_order('[1]', '["1"]'), ` +
                        `drivine_list_order('[{"a": 1}]', '[{"a": 2}]'), drivine_list_order('1', '[1]'), ` +
                        `drivine_list_order('[1]', '{}'), drivine_list_order(NULL, '[1]')`
                )
            ).toEqual([null, null, null, null, null, null]);
        });

        it('orders NaN with nothing, and an infinity as the double it is (liberation-data/drivine4j#295)', () => {
            expect(
                row(
                    `SELECT drivine_list_order('[${NAN}]', '[${NAN}]'), drivine_list_order('[${NAN}]', '[1]'), drivine_list_order('[1]', '[${NAN}]'), ` +
                        `drivine_list_order('[1, ${NAN}]', '[2, ${NAN}]'), drivine_list_order('[9e999]', '[1]'), ` +
                        `drivine_list_order('[-9e999]', '[-9223372036854775808]'), drivine_list_order('[9e999]', '[9e999]')`
                )
            ).toEqual([null, null, null, n(-1), n(1), n(-1), n(0)]);
        });
    });

    describe('drivine_math', () => {
        it("works out openCypher's functions of numbers as Java's Math does", () => {
            expect(
                row(
                    `SELECT drivine_math('exp', 0), drivine_math('log10', 1000), drivine_math('sqrt', 16), drivine_math('atan2', 1, 1), ` +
                        `drivine_math('degrees', pi()), drivine_math('radians', 180), drivine_math('haversin', 0), ` +
                        `drivine_math('cot', 1), drivine_math('sin', NULL)`
                )
            ).toEqual([1, 3, 4, Math.PI / 4, 180, Math.PI, 0, 1 / Math.tan(1), null]);
            expect(one(`typeof(drivine_math('sqrt', 16))`)).toEqual('real');
        });

        it('fails where Java gives NaN or an infinity, which JSON holds no value for', () => {
            expect(() => one(`drivine_math('log', 0)`)).toThrow('log() of 0.0 is -Infinity, which JSON holds no value');
            expect(() => one(`drivine_math('sqrt', -1)`)).toThrow('sqrt() of -1.0 is NaN');
            expect(() => one(`drivine_math('nope', 1)`)).toThrow('drivine_math has no function nope.');
        });
    });

    describe('drivine_round', () => {
        it('rounds in decimal by each mode', () => {
            expect(
                row(
                    `SELECT drivine_round(2.345, 2, 'HALF_UP'), drivine_round(2.345, 2, 'HALF_DOWN'), drivine_round(2.345, 2, 'HALF_EVEN'), ` +
                        `drivine_round(2.355, 2, 'HALF_EVEN'), drivine_round(-2.341, 2, 'CEILING'), drivine_round(-2.341, 2, 'FLOOR'), ` +
                        `drivine_round(2.341, 2, 'UP'), drivine_round(-2.349, 2, 'DOWN'), drivine_round(-2.5, 0, 'HALF_UP')`
                )
            ).toEqual([2.35, 2.34, 2.34, 2.36, -2.34, -2.35, 2.35, -2.34, -3]);
        });

        it('leaves a number of no more places as it is, and gives a real number of a whole one', () => {
            expect(
                row(
                    `SELECT drivine_round(2.5, 1000000000, NULL), drivine_round(7, 0, 'HALF_UP'), typeof(drivine_round(7, 0, 'UP')), ` +
                        `drivine_round(1234.5, -2, 'HALF_UP'), drivine_round(NULL, 1, 'UP'), drivine_round(1.5, NULL, 'UP')`
                )
            ).toEqual([2.5, 7, 'real', 1200, null, null]);
            expect(() => one(`drivine_round(2.25, 1, 'UNNECESSARY')`)).toThrow('Rounding necessary');
            expect(() => one(`drivine_round(2.25, 1, 'SIDEWAYS')`)).toThrow('RoundingMode.SIDEWAYS');
        });

        it('leaves an infinity as it is', () => {
            // An infinity, which SQLite stores and a statement may work out (liberation-data/drivine4j#295), as Neo4j rounds it.
            expect(
                row(
                    `SELECT drivine_round(2.345, 2, 'HALF_UP'), drivine_round(9e999, 2, 'HALF_UP'), drivine_round(-9e999, 0, 'HALF_DOWN'), ` +
                        `drivine_round(NULL, 0, 'HALF_UP')`
                )
            ).toEqual([2.35, Infinity, -Infinity, null]);
        });
    });

    describe('drivine_temporal', () => {
        it('reads, moves, measures and cuts a timestamp', () => {
            expect(
                row(
                    `SELECT drivine_temporal('local', '2024-03-15', 'DATE'), drivine_temporal('utc', '2024-03-15T10:30+0200', 'DATE_TIME'), ` +
                        `drivine_temporal('utc', '10:00+01:00', 'TIME'), drivine_temporal('add_months', '2024-01-31T10:00:00.000000', 1), ` +
                        `drivine_temporal('add_time', '2024-03-15T10:00:00.000000', 1, 1.5), ` +
                        `drivine_temporal('months_between', '2024-01-31T00:00:00.000000', '2024-03-31T00:00:00.000000'), ` +
                        `drivine_temporal('seconds_between', '2024-03-15T10:00:00.500000', '2024-03-15T10:00:00.000000'), ` +
                        `drivine_temporal('truncate', '2024-03-15T10:30:00.000000', 'week'), ` +
                        `drivine_temporal('extract', '2024-03-15T10:30:30.250000', 'SECOND')`
                )
            ).toEqual([
                '2024-03-15T00:00:00.000000',
                '2024-03-15T08:30:00.000000',
                '1970-01-01T09:00:00.000000',
                '2024-02-29T10:00:00.000000',
                '2024-03-16T10:00:01.500000',
                n(2),
                -0.5,
                '2024-03-11T00:00:00.000000',
                30.25
            ]);
        });

        it('rounds a number of months that is no whole number half away from zero, as Postgres casts one', () => {
            expect(
                row(
                    `SELECT drivine_temporal('add_months', '2024-01-31T10:00:00.000000', 1.5), ` +
                        `drivine_temporal('add_months', '2024-01-31T10:00:00.000000', -1.5)`
                )
            ).toEqual(['2024-03-31T10:00:00.000000', '2023-11-30T10:00:00.000000']);
        });

        it("reads a year before 1, which SQLite's own date functions don't", () => {
            expect(
                row(
                    `SELECT drivine_temporal('local', '-0044-03-15', 'DATE'), drivine_temporal('day_of_week', '-0044-03-15T00:00:00.000000'), ` +
                        `drivine_temporal('extract', '-0044-03-15T00:00:00.000000', 'YEAR')`
                )
            ).toEqual(['-0044-03-15T00:00:00.000000', n(4), n(-44)]);
        });

        it('counts months as a calendar does, a time of day not yet come round not counting', () => {
            expect(
                row(
                    `SELECT drivine_temporal('months_between', '2024-01-31T10:00:00.000000', '2024-02-29T09:00:00.000000'), ` +
                        `drivine_temporal('months_between', '2024-03-15T10:00:00.000000', '2024-01-15T10:00:00.000000'), ` +
                        `drivine_temporal('months_between', '2024-03-15T10:00:00.000000', '2024-01-15T11:00:00.000000'), ` +
                        `drivine_temporal('seconds_between', '2024-03-15T10:00:00.000000', '2024-03-16T10:00:01.250000')`
                )
            ).toEqual([n(0), n(-2), n(-1), 86401.25]);
        });

        it('cuts to each unit as Neo4j cuts', () => {
            const cut = (unit: string, at = '2017-11-11T12:31:14.645876123'): SqliteValue =>
                one(`drivine_temporal('truncate', '${at}', '${unit}')`);
            expect(
                [
                    'millennium',
                    'century',
                    'decade',
                    'year',
                    'weekYear',
                    'quarter',
                    'month',
                    'day',
                    'hour',
                    'minute'
                ].map((unit) => cut(unit))
            ).toEqual([
                '2000-01-01T00:00:00.000000',
                '2000-01-01T00:00:00.000000',
                '2010-01-01T00:00:00.000000',
                '2017-01-01T00:00:00.000000',
                '2017-01-02T00:00:00.000000',
                '2017-10-01T00:00:00.000000',
                '2017-11-01T00:00:00.000000',
                '2017-11-11T00:00:00.000000',
                '2017-11-11T12:00:00.000000',
                '2017-11-11T12:31:00.000000'
            ]);
            expect([
                cut('second'),
                cut('millisecond'),
                cut('microsecond'),
                cut('millennium', '-1234-05-06T00:00')
            ]).toEqual([
                '2017-11-11T12:31:14.000000',
                '2017-11-11T12:31:14.645000',
                '2017-11-11T12:31:14.645876',
                '-1000-01-01T00:00:00.000000'
            ]);
            expect(cut('weekYear', '2021-01-03T00:00')).toEqual('2019-12-30T00:00:00.000000');
            expect(() => cut('fortnight')).toThrow('A timestamp is not truncated to fortnight.');
        });

        it('reads a local text of each kind, its fraction cut to the microsecond', () => {
            expect(
                row(
                    `SELECT drivine_temporal('local', '2024-03-15T10:30:00.1234567+05:30', 'DATE_TIME'), ` +
                        `drivine_temporal('local', '10:30', 'LOCAL_TIME'), drivine_temporal('utc', '2024-03-15T10:30', 'LOCAL_DATE_TIME'), ` +
                        `drivine_temporal('utc', '00:30Z', 'TIME'), drivine_temporal('utc', '2024-01-01T00:30-0100', 'DATE_TIME')`
                )
            ).toEqual([
                '2024-03-15T10:30:00.123456',
                '1970-01-01T10:30:00.000000',
                '2024-03-15T10:30:00.000000',
                '1970-01-01T00:30:00.000000',
                '2024-01-01T01:30:00.000000'
            ]);
        });

        it('is null where an argument is, and fails on a text that names no value', () => {
            expect(one(`drivine_temporal('local', NULL, 'DATE')`)).toBeNull();
            expect(() => one(`drivine_temporal('local', '2024-02-30', 'DATE')`)).toThrow(
                "'2024-02-30' is no temporal value: Text '2024-02-30' could not be parsed: Invalid date 'FEBRUARY 30'"
            );
            expect(() => one(`drivine_temporal('local', '2023-02-29', 'DATE')`)).toThrow('is not a leap year');
            expect(() => one(`drivine_temporal('local', 'P1D', 'DURATION')`)).toThrow('A duration is no moment.');
            expect(() => one(`drivine_temporal('utc', '2024-01-01T00:00+1900', 'DATE_TIME')`)).toThrow(
                'Zone offset not in valid range'
            );
            expect(() => one(`drivine_temporal('jump', '2024-01-01')`)).toThrow(
                'drivine_temporal has no operation jump.'
            );
        });
    });

    it('drivine_fail fails the statement with its text', () => {
        expect(() => one(`drivine_fail('round() of a precision below 0')`)).toThrow('round() of a precision below 0');
        expect(one(`CASE WHEN 1 = 0 THEN drivine_fail('never') ELSE 'fine' END`)).toEqual('fine');
    });

    describe('drivine_cypher', () => {
        const graph = new SqliteGraph('cyfunctions');
        const steps = (...given: object[]): string => JSON.stringify({ steps: given }).replace(/'/g, "''");
        const set = { op: 'select', sql: `SELECT '{"n":1}'`, variables: [], variable: 'cy_value' };
        const insert = {
            op: 'execute',
            sql: `INSERT INTO cyfunctions_node (labels, props) VALUES ('[]', ?1) RETURNING nid`,
            variables: ['cy_value'],
            variable: 'cy_id'
        };
        const returned = { op: 'return', sql: 'SELECT json_quote(?1) AS result', variables: ['cy_id'] };
        const count = (): SqliteValue => one('count(*) FROM cyfunctions_node');

        beforeEach(() => graph.ddl.forEach((it) => db.exec(it)));

        it('carries out its steps, and gives the rows it returns as a JSON list', () => {
            expect(one(`drivine_cypher('${steps(set, insert, returned)}', '{}')`)).toEqual('[1]');
            expect(one(`props FROM cyfunctions_node`)).toEqual('{"n":1}');
        });

        it('binds a variable that holds a number as one, and not as its text', () => {
            const real = { op: 'select', sql: 'SELECT 1.5', variables: [], variable: 'cy_value' };
            const big = { op: 'select', sql: 'SELECT 9007199254740993', variables: [], variable: 'cy_id' };
            const typed = {
                op: 'return',
                sql: 'SELECT json_quote(?1) AS result UNION ALL SELECT json_quote(?2) UNION ALL SELECT ?1',
                variables: ['cy_value', 'cy_id']
            };
            expect(one(`drivine_cypher('${steps(real, big, typed)}', '{}')`)).toEqual('[1.5,9007199254740993,1.5]');
        });

        it('binds the parameters, loops over rows read before the loop writes, and runs a body where its condition holds', () => {
            const program = steps(
                {
                    op: 'loop',
                    sql: `SELECT value FROM json_each(?1 ->> '$.names')`,
                    variables: ['cy_params'],
                    record: 'cy_record.item',
                    body: [
                        {
                            op: 'execute',
                            sql: `INSERT INTO cyfunctions_node (labels, props) VALUES ('[]', json_object('name', ?1))`,
                            variables: ['cy_record.item'],
                            variable: null
                        },
                        {
                            op: 'if',
                            sql: `SELECT CASE WHEN ?1 = 'b' THEN 1 ELSE 0 END`,
                            variables: ['cy_record.item'],
                            body: [{ op: 'return', sql: `SELECT json_quote(?1)`, variables: ['cy_record.item'] }]
                        }
                    ]
                },
                { op: 'return', sql: 'SELECT count(*) FROM cyfunctions_node', variables: [] }
            );
            expect(one(`drivine_cypher('${program}', '{"names":["a","b","c"]}')`)).toEqual('["b",3]');
        });

        it('undoes the steps before one that fails', () => {
            expect(() => one(`drivine_cypher('${steps(set, insert, { op: 'raise', message: 'no' })}', '{}')`)).toThrow(
                'no'
            );
            expect(count()).toEqual(n(0));
            expect(() => one(`drivine_cypher('${steps(set, insert, { op: 'jump' })}', '{}')`)).toThrow('no step jump');
            expect(count()).toEqual(n(0));
            expect(one(`drivine_cypher('${steps(set, insert, returned)}', '{}')`)).toEqual('[1]');
            expect(count()).toEqual(n(1));
        });
    });
});
