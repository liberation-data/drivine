import { SqlitePatterns } from '@/connection/sqlite/SqlitePatterns';

/**
 * The regular expressions of a SQLite connection, read as Java reads them, where JavaScript reads no flag group of its
 * own, `(?i:…)`, as Node 22's does not: each flag group in force over the whole expression is turned on for the whole,
 * and any other fails rather than match what Java does not.
 */
describe('SqlitePatterns without flag groups of their own', () => {
    const NativeRegExp = RegExp;

    beforeEach(() => {
        // As Node 22's: `(?i:…)` is an invalid group.
        (globalThis as any).RegExp = function (source: string, flags?: string) {
            if (/\(\?[ims-]+:/.test(source)) {
                throw new SyntaxError(`Invalid regular expression: /${source}/: Invalid group`);
            }
            return new NativeRegExp(source, flags);
        };
    });

    afterEach(() => {
        globalThis.RegExp = NativeRegExp;
    });

    const matches = (expression: string, text: string): boolean => new SqlitePatterns().of(expression, '').test(text);

    it('turns on a flag group that opens the whole expression, and keeps the text start and end', () => {
        expect(matches('^(?:(?i)abc)\\z', 'ABC')).toBe(true);
        expect(matches('^(?:(?i)abc)$', 'ABC')).toBe(true);
        expect(matches('^(?:(?s)a.b)\\z', 'a\nb')).toBe(true);
        expect(matches('^(?:(?m)a$)\\z', 'a\nb')).toBe(false);
    });

    it('turns on a flag group that opens the whole expression before a |, which Java reads over each alternative', () => {
        expect(matches('^(?:(?i)a|b)\\z', 'B')).toBe(true);
        expect(matches('^(?:(?i)a|b)\\z', 'A')).toBe(true);
    });

    it('fails on a flag group in force over only part of the expression', () => {
        expect(() => matches('^(?:x(?i)abc)$', 'XABC')).toThrow('Invalid group');
        expect(() => matches('^(?:(?:(?i)a)b)\\z', 'AB')).toThrow('Invalid group');
        expect(() => matches('^(?:(?m)a)$', 'a\nb')).toThrow('Invalid group');
        expect(() => matches('^(?:x|(?i)a|b)\\z', 'B')).toThrow('Invalid group');
        expect(() => matches('^(?:a(?i)b|c)\\z', 'C')).toThrow('Invalid group');
    });
});
