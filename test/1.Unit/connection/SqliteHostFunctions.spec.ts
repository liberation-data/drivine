import { openSqlite, SqliteDatabase, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import {
    answered,
    registerHostFunctions,
    SQLITE_HOST_FUNCTIONS,
    written
} from '@/connection/sqlite/SqliteHostFunctions';
import { nodeRequire } from '@/utils/NodeRequire';

const PACKAGE = '@liberation-data/drivine-cypher-compiler';

/**
 * The shared compiler's own SQLite host functions, registered as calls of its package's `hostCall`
 * (liberation-data/drivine#757): what each gives is the spec's host.yaml's (HostSpec), so this tests the registration:
 * that it registers every one the package has, hands each argument over typed as SQLite gives it, takes its answer back
 * as the value it is, and fails the statement where the function does.
 */
describe('SqliteHostFunctions', () => {
    it('lists every host function the package has, by its number of arguments, each deterministic', () => {
        const listed = JSON.parse(nodeRequire<{ hostFunctions(): string }>(PACKAGE).hostFunctions()) as Record<
            string,
            { arity: number; deterministic: boolean }
        >;
        expect(Object.fromEntries(Object.entries(listed).map(([name, it]) => [name, it.arity]))).toEqual(
            SQLITE_HOST_FUNCTIONS
        );
        expect(Object.values(listed).every((it) => it.deterministic)).toBe(true);
    });

    it('writes each argument as its kind, its length in UTF-16 units and its text', () => {
        expect(written(null)).toBe('n');
        expect(written(BigInt('9007199254740993'))).toBe('i16:9007199254740993');
        expect(written(2)).toBe('r1:2');
        expect(written(-0)).toBe('r2:-0');
        expect(written(1e21)).toBe('r5:1e+21');
        expect(written(NaN)).toBe('r3:NaN');
        expect(written('a:é😀')).toBe('t5:a:é😀');
        expect(written(new Uint8Array([1, 2]))).toBe('b4:AQI=');
    });

    it('reads each answer as the value it is, and throws the message of one that fails', () => {
        expect(answered('n')).toBeNull();
        expect(answered('i9007199254740993')).toBe(BigInt('9007199254740993'));
        expect(answered('r1.0E21')).toBe(1e21);
        expect(answered('r-0.0')).toBe(-0);
        expect(answered('rNaN')).toBeNaN();
        expect(answered('r-Infinity')).toBe(-Infinity);
        expect(answered('t')).toBe('');
        expect(answered('ta:b')).toBe('a:b');
        expect(answered('bAQI=')).toEqual(new Uint8Array([1, 2]));
        expect(() => answered('eno such value')).toThrow('no such value');
    });

    describe('on a connection', () => {
        let db: SqliteDatabase;

        beforeEach(() => {
            db = openSqlite(':memory:');
            registerHostFunctions(db);
        });

        afterEach(() => db.close());

        const row = (sql: string, ...values: SqliteValue[]): SqliteValue[] => {
            const statement = db.prepare(sql);
            statement.setReadBigInts(true);
            statement.setReturnArrays(true);
            return statement.get(...values) as unknown as SqliteValue[];
        };

        it('hands an integer, a float and a text of the same digits over apart', () => {
            expect(row('SELECT drivine_float_text(2), drivine_float_text(2.0), drivine_float_text(?)', '2')).toEqual([
                '2.0',
                '2.0',
                '2.0'
            ]);
            expect(row(`SELECT drivine_equal('[1]', '[1.0]'), drivine_add('9007199254740993', '1')`)).toEqual([
                BigInt(1),
                '9007199254740994'
            ]);
            expect(row('SELECT drivine_host_version()')).toEqual([BigInt(2)]);
        });

        it('gives null back as null, and a float back as a float', () => {
            expect(row(`SELECT drivine_equal(NULL, '1'), typeof(drivine_round(2.5, 0, 'HALF_UP'))`)).toEqual([
                null,
                'real'
            ]);
        });

        it("fails the statement with the function's message, and with the call's where it can't be made", () => {
            expect(() => row(`SELECT drivine_round(1.5, 0, NULL)`)).toThrow(
                'drivine_round: no rounding mode is named null.'
            );
            expect(() => row(`SELECT drivine_equal('1')`)).toThrow('drivine_equal takes 2 argument(s), not 1.');
        });

        /**
         * `REGEXP` reads a pattern as Java does, with `UNICODE_CHARACTER_CLASS`, by the module's matcher and not V8's
         * (#632, #568, #560, drivine-python#379). Each answer is `java.util.regex`'s: `Pattern.compile(pattern,
         * UNICODE_CHARACTER_CLASS).matcher(text).find()` on JDK 25.
         */
        it.each([
            ['^(?:a(?i)(?:[(|]|x)b|c)\\z', 'a(B', 1], // #632
            ['[a-z&&b]', 'c', 0], // #568: a class's && is an intersection
            ['[a-z&&b]', '&', 0],
            ['[a-z&&[^aeiou]]', 'b', 1],
            ['[a-z&&[^aeiou]]', 'a', 0],
            ['^\\w+$', 'café', 1], // #560: \w, \d, \b and \s are Unicode's
            ['^\\d$', '٣', 1],
            ['\\bé', 'é', 1],
            ['\\s', '﻿', 0],
            ['\\s', '\u0085', 1],
            ['^.$', '\u0085', 0], // a dot matches no U+0085
            ['[a&&&b]', '&', 1], // drivine-python#379
            ['[a\\Q\\E-c]', 'b', 1],
            ['(?i)ß', 'ẞ', 0],
            ['^a\\Z', 'a\n', 1], // \Z and \p{…} are Java's
            ['^\\p{L}$', 'é', 1],
            // The one departure, on purpose, as drivine4j's and drivine-python's: a POSIX class is read as Java names it,
            // \p{Alpha}, where Java reads [[:alpha:]] as a class of the characters :, a, l, p and h (and gives 0, then 1).
            ['[[:alpha:]]+', 'é', 1],
            ['[[:alpha:]]', ':', 0]
        ])('matches %j in %j as Java does', (pattern, text, expected) => {
            expect(row('SELECT ? REGEXP ?', text, pattern)).toEqual([BigInt(expected)]);
        });

        it.each([
            ['a++b', 'a possessive quantifier is not supported on this platform; rewrite the pattern without it.'],
            ['(?<=a)b', 'a lookbehind is not supported on this platform; rewrite the pattern without it.'],
            [
                'x'.repeat(2_000_001),
                'a pattern written as more than 2000000 characters is not supported on this platform; rewrite the pattern without it.'
            ],
            ['[&&]', 'Bad class syntax'],
            ['\\p{IsAll}', 'Unknown character property name {IsAll}']
        ])('refuses %#, naming what it refuses, with no prefix', (pattern, message) => {
            expect(() => row('SELECT ? REGEXP ?', 'a', pattern)).toThrow(new Error(message));
        });

        it('takes a pattern of 2,000,000 characters', () => {
            expect(row('SELECT ? REGEXP ?', 'a', 'x'.repeat(2_000_000))).toEqual([BigInt(0)]);
        });
    });

    it('loads the package on the first call of a function, not on registering them', async () => {
        await jest.isolateModulesAsync(async () => {
            const required = jest.fn();
            jest.doMock(PACKAGE, () => {
                required();
                return jest.requireActual(PACKAGE);
            });
            const host: typeof import('@/connection/sqlite/SqliteHostFunctions') = await import(
                '@/connection/sqlite/SqliteHostFunctions'
            );
            const driver: typeof import('@/connection/sqlite/SqliteDriver') = await import(
                '@/connection/sqlite/SqliteDriver'
            );
            const db = driver.openSqlite(':memory:');
            try {
                host.registerHostFunctions(db);
                expect(required).not.toHaveBeenCalled();
                expect(db.prepare(`SELECT drivine_canonical('{"b":1,"a":2}') AS c`).get()).toEqual({
                    c: '{"a":2,"b":1}'
                });
                expect(required).toHaveBeenCalledTimes(1);
            } finally {
                db.close();
            }
        });
    });
});
