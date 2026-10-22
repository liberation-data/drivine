import { TextQuery } from '@/backend/sql/TextQuery';

// drivine4j's TextQueryTest, ported: the same queries read the same way on the JVM and in Node.
const word = (text: string): string => `(^|[^[:alnum:]_])${text}($|[^[:alnum:]_])`;
const oracleText = (query: string): string => TextQuery.parse(query).oracleText;

describe('TextQuery', () => {
    it('should score words, each matched whole and in lower case', () => {
        const query = TextQuery.parse('Graph databases');
        expect(query.scored).toEqual([word('graph'), word('databases')]);
        expect(query.required).toEqual([]);
        expect(query.excluded).toEqual([]);
    });

    it('should make a word one a node must hold with a plus or AND, and one it must not with a minus or NOT', () => {
        const query = TextQuery.parse('+kotlin graph AND store -python NOT rust');
        expect(query.scored).toEqual([word('kotlin'), word('graph'), word('store')]);
        expect(query.required).toEqual([word('kotlin'), word('store')]);
        expect(query.excluded).toEqual([word('python'), word('rust')]);
    });

    it('should give the words of each scoring term, which a store narrows a search by', () => {
        const query = TextQuery.parse('"Graph data" data* -python +Kotlin');
        expect(query.scoredWords).toEqual([['graph', 'data'], ['data'], ['kotlin']]);
    });

    it("should read a quoted phrase as its words in turn, a star as the start of a word, and a field's word as the word", () => {
        expect(TextQuery.parse('"graph data" data* name:Ada').scored).toEqual([
            '(^|[^[:alnum:]_])graph[^[:alnum:]_]+data($|[^[:alnum:]_])',
            '(^|[^[:alnum:]_])data',
            word('ada')
        ]);
    });

    it('should not look for what is not a word, so it cannot be read as an expression', () => {
        expect(TextQuery.parse('c++ (.*)').scored).toEqual([word('c')]);
        expect(TextQuery.parse('a.b').scored[0]).not.toContain('.');
    });

    it('should accumulate, require and take away for Oracle Text, each word in braces', () => {
        expect(oracleText('Graph databases')).toEqual('({graph} ACCUM {databases})');
        expect(oracleText('+kotlin graph AND store -python NOT rust')).toEqual(
            '({kotlin} ACCUM {graph} ACCUM {store}) AND {kotlin} AND {store} NOT {python} NOT {rust}'
        );
        expect(oracleText('"graph data" data* name:Ada')).toEqual('({graph data} ACCUM data% ACCUM {ada})');
        // A word that is one of Oracle Text's own is still a word.
        expect(oracleText('near about')).toEqual('({near} ACCUM {about})');
    });

    it('should refuse a query with no word to look for', () => {
        expect(() => TextQuery.parse('-only')).toThrow(/needs a word/);
        expect(() => TextQuery.parse('  ')).toThrow(/needs a word/);
    });

    it('should read the symbols for AND, OR and NOT as the words', () => {
        const query = TextQuery.parse('graph && store || index ! python');
        expect(query.scored).toEqual([word('graph'), word('store'), word('index')]);
        expect(query.required).toEqual([word('store')]);
        expect(query.excluded).toEqual([word('python')]);
    });

    it('should read an operator with nothing after it as nothing', () => {
        const query = TextQuery.parse('graph AND');
        expect(query.scored).toEqual([word('graph')]);
        expect(query.required).toEqual([]);
        expect(query.oracleText).toEqual('({graph})');
    });

    it('should refuse an empty phrase and a star alone, which hold no word', () => {
        expect(() => TextQuery.parse('""')).toThrow();
        expect(() => TextQuery.parse('*')).toThrow();
        expect(() => TextQuery.parse('title:""')).toThrow();
    });

    it('should read a field scoped to a phrase as the phrase, and one scoped to a word as the word', () => {
        const phrase = TextQuery.parse('title:"graph data"');
        expect(phrase.scored).toEqual(['(^|[^[:alnum:]_])graph[^[:alnum:]_]+data($|[^[:alnum:]_])']);
        expect(phrase.oracleText).toEqual('({graph data})');
        const field = TextQuery.parse('name:Ada');
        expect(field.scored).toEqual([word('ada')]);
        expect(field.oracleText).toEqual('({ada})');
    });

    it('should read a star in the middle of a word as a gap between two words', () => {
        const query = TextQuery.parse('foo*bar');
        expect(query.scored).toEqual(['(^|[^[:alnum:]_])foo[^[:alnum:]_]+bar($|[^[:alnum:]_])']);
        expect(query.oracleText).toEqual('({foo bar})');
    });

    it('should accumulate and conjoin a required word, take away an excluded one, and end a prefix in a percent', () => {
        expect(oracleText('+kotlin')).toEqual('({kotlin}) AND {kotlin}');
        expect(oracleText('kotlin -python')).toEqual('({kotlin}) NOT {python}');
        expect(oracleText('kotlin NOT python ! rust')).toEqual('({kotlin}) NOT {python} NOT {rust}');
        expect(oracleText('pre*')).toEqual('(pre%)');
        expect(oracleText('"graph pre*"')).toEqual('({graph} pre%)');
    });

    it('should read a sign after a backslash as text, neither required nor excluded', () => {
        const query = TextQuery.parse('graph \\+kotlin \\-python');
        expect(query.scored).toEqual([word('graph'), word('kotlin'), word('python')]);
        expect(query.required).toEqual([]);
        expect(query.excluded).toEqual([]);
    });

    it('should read a closing star after a backslash as text, matching the word whole', () => {
        const query = TextQuery.parse('pre\\*');
        expect(query.scored).toEqual([word('pre')]);
        expect(query.oracleText).toEqual('({pre})');
    });

    it('should read a star after a backslash that is itself text as the start of a word', () => {
        expect(oracleText('pre\\\\*')).toEqual('(pre%)');
    });

    it('should keep what stands before a backslashed colon, where a bare colon makes it a field', () => {
        expect(oracleText('https\\:\\/\\/example.com\\/docs')).toEqual('({https example com docs})');
        expect(oracleText('https://example.com/docs')).toEqual('({example com docs})');
    });

    it('should keep a backslashed quote from opening or closing a phrase', () => {
        expect(oracleText('say \\"hello world\\"')).toEqual('({say} ACCUM {hello} ACCUM {world})');
        expect(oracleText('"say \\"hello\\" now"')).toEqual('({say hello now})');
    });

    it('should join two words a backslashed space stands between into one term', () => {
        expect(oracleText('graph\\ data')).toEqual('({graph data})');
    });

    it('should read an operator written with backslashes as text, holding no word', () => {
        const query = TextQuery.parse('graph \\&\\& store \\! python');
        expect(query.scored).toEqual([word('graph'), word('store'), word('python')]);
        expect(query.required).toEqual([]);
        expect(query.excluded).toEqual([]);
    });

    it('should read a backslash before a letter as text, a gap between two words', () => {
        expect(oracleText('foo\\bar')).toEqual('({foo bar})');
        expect(oracleText('DOMAIN\\user')).toEqual('({domain user})');
        // "C:" is a field, so the term is what follows it.
        expect(oracleText('C:\\Users\\bob')).toEqual('({users bob})');
    });

    it('should read a backslash that ends the query as text', () => {
        expect(oracleText('graph\\')).toEqual('({graph})');
    });

    it('should require a word whose punctuation is escaped as the phrase of its parts', () => {
        const query = TextQuery.parse('+PN\\-4471\\-B order');
        expect(query.oracleText).toEqual('({pn 4471 b} ACCUM {order}) AND {pn 4471 b}');
        expect(query.required).toHaveLength(1);
    });

    it('should close a phrase that only a backslashed quote can close with it', () => {
        expect(oracleText('"C:\\" foo')).toEqual('({c} ACCUM {foo})');
        // The star is not the last character of the phrase, the backslash is.
        expect(oracleText('"pre*\\" foo')).toEqual('({pre} ACCUM {foo})');
    });

    it('should not close a phrase with a backslashed quote when a bare quote stands later', () => {
        expect(oracleText('"C:\\" and "D:\\"')).toEqual('({c and})');
    });

    it('should keep a phrase one phrase across a backslashed line break', () => {
        expect(oracleText('"foo\\\nbar"')).toEqual('({foo bar})');
    });

    it('should not read a star before a line break that ends a phrase as the end of the phrase', () => {
        expect(oracleText('"graph pre*\n"')).toEqual('({graph pre})');
    });

    it('should not let an operator before a token with no word reach the word after it', () => {
        const negated = TextQuery.parse('graph NOT \\! python');
        expect(negated.scored).toEqual([word('graph'), word('python')]);
        expect(negated.excluded).toEqual([]);
        const conjoined = TextQuery.parse('graph AND \\&\\& store');
        expect(conjoined.scored).toEqual([word('graph'), word('store')]);
        expect(conjoined.required).toEqual([]);
    });

    it('should read a word or a phrase of any length', () => {
        const long = 'a'.repeat(200_000);
        expect(oracleText(long)).toEqual(`({${long}})`);
        expect(oracleText(`"${long}"`)).toEqual(`({${long}})`);
        expect(oracleText(`title:${long}`)).toEqual(`({${long}})`);
    });

    it('should read a query of many phrases that never close in one pass', () => {
        expect(TextQuery.parse('"graph '.repeat(50_000)).scored).toHaveLength(50_000);
    });
});
