import { SqlitePatterns } from '@/connection/sqlite/SqlitePatterns';
import { openSqlite, SqliteDatabase } from '@/connection/sqlite/SqliteDriver';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { fullTextSearch } from '@/cypher/SharedCypherCompiler';

/** The expression the shared module's SQLite search counts the one term of `query` by: the first value it binds. */
const counting = (query: string): string =>
    fullTextSearch('sqlite', 'g', { labels: ['Doc'], properties: ['body'], query }).parameters._cy_ft1;

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

describe("SqlitePatterns' POSIX classes", () => {
    it("reads [:alnum:] as Unicode's Alphabetic and Nd, as Java does and as the module splits a query into words", () => {
        // drivine4j#616: a vowel sign, a letter number and an Arabic-Indic digit are in a word; a superscript and a
        // fraction are not. Read as \p{L}\p{N}, the text and the query's words would disagree.
        const word = new SqlitePatterns().of('^[[:alnum:]_]$', '');
        for (const [char, inWord] of [
            ['क', true],
            ['ि', true],
            ['ⅻ', true],
            ['٣', true],
            ['_', true],
            ['²', false],
            ['½', false],
            ['-', false]
        ] as [string, boolean][]) {
            expect([char, word.test(char)]).toEqual([char, inWord]);
            // A character between words makes `a…b` the phrase "a b", its words apart by what stands between words.
            expect([char, !counting(`a${char}b`).includes(']+')]).toEqual([char, inWord]);
        }
    });
});

/**
 * How `drivine_regexp_count` counts the terms the shared module's SQLite search binds (drivine4j#607): each time, where a
 * term is written again at once too, holding to the character after it without taking it, and a word in any script as a
 * word, as Postgres counts them. drivine4j's SqlitePatternsTest, and the module's TextQueryCountTest through Java's
 * expressions.
 */
describe('drivine_regexp_count over the module’s search terms', () => {
    let db: SqliteDatabase;

    beforeAll(() => {
        db = openSqlite(':memory:');
        SqliteFunctions.register(db);
    });

    afterAll(() => db.close());

    /** How often the one term of `query` occurs in `text`, by the count the module's search asks of SQLite for it. */
    const counted = (query: string, text: string): number => {
        const statement = db.prepare(`SELECT ${SqliteFunctions.REGEXP_COUNT}(?, ?)`);
        statement.setReturnArrays(true);
        return Number((statement.get(text, counting(query)) as unknown as unknown[])[0]);
    };

    it.each([
        ['kiwi kiwi kiwi', 3],
        ['kiwi,kiwi.kiwi!', 3],
        ['(kiwi)', 1],
        ['kiwi', 1],
        ['kiwis kiwi_kiwi kiwi2 akiwi', 0],
        ['kiwi\nkiwi\n', 2]
    ])('should count a term written again at once each time, wherever it stands: %j', (text, n) => {
        expect(counted('kiwi', text as string)).toEqual(n);
    });

    it.each([
        ['of soup of soup', 2],
        ['of  soup, of -- soup.', 2],
        ['of soups of soup', 1],
        ['of soup_ of soup', 1],
        ['of soup_of soup', 0]
    ])('should count a phrase written again at once each time, its gap any punctuation: %j', (text, n) => {
        expect(counted('"of soup"', text as string)).toEqual(n);
    });

    it('should count each word a prefix term starts', () => {
        expect(counted('kiw*', 'kiwi kiwis kiw akiwi')).toEqual(3);
        // A `*` inside quotes is text (drivine4j#622): "of sou*" is the phrase "of sou", which "of soup of soups" doesn't hold.
        expect(counted('"of sou*"', 'of soup of soups')).toEqual(0);
    });

    it('should read a word in any script as a word', () => {
        expect(counted('café', 'café café cafés caféé')).toEqual(2);
        expect(counted('кот', 'кот кот котик')).toEqual(2);
        expect(counted('किताब', 'किताब किताब')).toEqual(2);
        expect(counted('किताब', 'किताबें')).toEqual(0);
        expect(counted('bⅻb', 'bⅻb bⅻb')).toEqual(2);
    });

    it('should count a phrase whose words begin it again, or whose first word starts a later one, by how often it occurs', () => {
        expect(counted('"la la"', 'la la land')).toEqual(1);
        expect(counted('"kiwis kiwi"', 'kiwis kiwis kiwi')).toEqual(1);
        expect(counted('"kiwi kiwis"', 'kiwi kiwi kiwis kiwis kiwi kiwisx kiwi kiwis')).toEqual(2);
        expect(counted('"ki kiwi bird"', 'ki ki kiwi bird ki kiwi birds ki kiwi bird ki kiwi bird')).toEqual(3);
    });
});
