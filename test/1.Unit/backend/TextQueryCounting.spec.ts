import { counted, lookingAhead, SEPARATOR, TextQuery } from '@/backend/sql/TextQuery';
import { SqlitePatterns } from '@/connection/sqlite/SqlitePatterns';

/**
 * How a term written again at once is counted on each SQL store (drivine4j#607): Postgres and SQLite hold to the character
 * after it without taking it, and Oracle, whose expressions don't look ahead, counts it ending where its last word does,
 * less those a word goes on from; or, where an occurrence may begin inside another, in the text with each character between
 * words written twice. Each case is counted both ways, through the expressions SQLite reads, as drivine4j's TextQueryTest
 * counts them through Java's.
 */
describe('TextQuery counting', () => {
    const patterns = new SqlitePatterns();
    /** The expression as drivine_regexp_count reads it. */
    const global = (pattern: string): RegExp => patterns.of(pattern, 'g');
    /** How often the expression matches in the text, each match after the last one ends, as the stores count. */
    const count = (pattern: string, text: string): number => [...text.matchAll(global(pattern))].length;
    const term = (query: string): string => {
        const scored = TextQuery.parse(query).scored;
        expect(scored).toHaveLength(1);
        return scored[0];
    };
    /** How often the term occurs in the text, counted as Postgres and SQLite count it. */
    const lookahead = (query: string, text: string): number => count(lookingAhead(term(query)), text);
    /** How often the term occurs in the text, counted as Oracle counts it (OracleSearch.matching). */
    const byOracle = (query: string, text: string): number => {
        const pattern = term(query);
        const two = counted(pattern);
        if (two === undefined) {
            return count(pattern, text.replace(global(SEPARATOR), '$1$1'));
        }
        const [ended, continued] = two;
        return count(ended, text) - (continued === null ? 0 : count(continued, text));
    };
    const both = (query: string, text: string, n: number): void => {
        expect([lookahead(query, text), byOracle(query, text)]).toEqual([n, n]);
    };

    it("should look ahead to a term's trailing boundary, and leave a prefix term, which has none, as it was", () => {
        expect(lookingAhead(term('kiwi'))).toEqual('(^|[^[:alnum:]_])kiwi(?=$|[^[:alnum:]_])');
        expect(lookingAhead(term('kiw*'))).toEqual('(^|[^[:alnum:]_])kiw');
    });

    it.each([
        ['kiwi kiwi kiwi', 3],
        ['kiwi,kiwi.kiwi!', 3],
        ['(kiwi)', 1],
        ['kiwi', 1],
        ['kiwis kiwi_kiwi kiwi2 akiwi', 0],
        ['kiwi\nkiwi\n', 2]
    ])('should count a term written again at once each time, wherever it stands: %j', (text, n) => {
        both('kiwi', text as string, n as number);
    });

    it.each([
        ['of soup of soup', 2],
        ['of  soup, of -- soup.', 2],
        ['of soups of soup', 1],
        ['of soup_ of soup', 1],
        ['of soup_of soup', 0]
    ])('should count a phrase written again at once each time, its gap any punctuation: %j', (text, n) => {
        both('"of soup"', text as string, n as number);
    });

    it('should count each word a prefix term starts', () => {
        both('kiw*', 'kiwi kiwis kiw akiwi', 3);
        both('"of sou*"', 'of soup of soups', 2);
    });

    it('should read a word in any script as a word', () => {
        both('café', 'café café cafés caféé', 2);
        both('кот', 'кот кот котик', 2);
    });

    it('should count on Oracle a term of words each once by two counts, and a phrase that repeats a word otherwise', () => {
        expect(counted(term('kiwi'))).toEqual(['(^|[^[:alnum:]_])kiwi', '(^|[^[:alnum:]_])kiwi[[:alnum:]_]']);
        expect(counted(term('kiw*'))).toEqual(['(^|[^[:alnum:]_])kiw', null]);
        expect(counted(term('"la la"'))).toBeUndefined();
        expect(counted(term('"la di la"'))).toBeUndefined();
        expect(counted(term('"of soup"'))![0]).toEqual('(^|[^[:alnum:]_])of[^[:alnum:]_]+soup');
    });

    it('should count a phrase whose words begin it again, or whose last word starts its first, the same on Oracle', () => {
        // Two counts took different occurrences: "la la" of "la land" going on, the first ending, so counted none.
        both('"la la"', 'la la land', 1);
        expect(counted(term('"kiwis kiwi"'))).toBeUndefined();
        both('"kiwis kiwi"', 'kiwis kiwis kiwi', 1);
        expect(byOracle('"kiwis bird kiwi"', 'kiwis bird kiwis bird kiwi')).toEqual(1);
    });

    it.each([
        ['"kiwi kiwis"', 'kiwi kiwi kiwis kiwis kiwi kiwisx kiwi kiwis'],
        ['"ki kiwi bird"', 'ki ki kiwi bird ki kiwi birds ki kiwi bird ki kiwi bird'],
        ['"a1 a12"', 'a1 a1 a12 a1 a12 a1 a123 a1 a12_'],
        ['"_a a_b"', '_a _a a_b _a a_b _a a_bc'],
        ['a_1', 'a_1 a_1 a_1a a_1_ a_1']
    ])(
        'should count a phrase of distinct words, whose last does not start its first, by two counts alike: %s',
        (query, text) => {
            expect(counted(term(query))).toBeDefined();
            expect(byOracle(query, text)).toEqual(lookahead(query, text));
        }
    );

    it('should count a phrase whose first word starts a later one by how often it occurs', () => {
        both('"kiwi kiwis"', 'kiwi kiwi kiwis kiwis kiwi kiwisx kiwi kiwis', 2);
        both('"ki kiwi bird"', 'ki ki kiwi bird ki kiwi birds ki kiwi bird ki kiwi bird', 3);
    });

    it('should count on Oracle a term with a character not measured as alnum there by its one expression', () => {
        // A circled letter, "ⓐ", is a word's to the query, which reads it as alphabetic, and may not be to Oracle's
        // [[:alnum:]]: an occurrence could begin inside another there, so the one count counts it.
        expect(counted(term('bⓐb'))).toEqual([term('bⓐb'), null]);
        // "²" is between words (drivine4j#616): "b²b" is the phrase "b b", which repeats a word, and still counts the same.
        expect(counted(term('b²b'))).toBeUndefined();
        both('b²b', 'b²b²bx', 1);
    });

    it('should count on Oracle a word with a vowel sign written again at once each time, by its two counts', () => {
        // A vowel sign is in a word (drivine4j#616) and a combining mark is [[:alnum:]] on Oracle, so no occurrence begins
        // inside another: counted by the one expression, "किताब किताब" was once.
        expect(counted(term('किताब'))?.[1]).not.toBeNull();
        both('किताब', 'किताब किताब', 2);
        both('"एक किताब"', 'एक किताब एक किताब', 2);
        // The vowel signs of किताब are spacing marks (Mc); the anusvara of हिंदी is a non-spacing one (Mn).
        expect(counted(term('हिंदी'))?.[1]).not.toBeNull();
        both('हिंदी', 'हिंदी हिंदी', 2);
        // Its next character a vowel sign, the word goes on, as it does in the text on each store: no occurrence.
        expect(byOracle('किताब', 'किताबें')).toEqual(0);
    });

    it('should count on Oracle a word with a letter number written again at once each time, by its two counts', () => {
        // "ⅻ" is [[:alnum:]] on Oracle, as measured (drivine4j#616): counted by the one expression, "bⅻb bⅻb" was once.
        expect(counted(term('bⅻb'))?.[1]).not.toBeNull();
        both('bⅻb', 'bⅻb bⅻb', 2);
    });
});
