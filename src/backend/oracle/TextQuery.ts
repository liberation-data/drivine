import { DrivineError } from '@/DrivineError';

/** What stands between two words: a run of anything but letters, digits and underscores. */
const GAP = /[^\p{L}\p{N}_]+/u;
const GAP_CHAR = /^[^\p{L}\p{N}_]$/u;

/** The characters that end a term. */
const SPACES = ' \t\n\u000B\u000C\r';

const BOUNDARY_BEFORE = '(^|[^[:alnum:]_])';
const BOUNDARY_AFTER = '($|[^[:alnum:]_])';

/** What an operator does to the token after it. */
const OPERATORS: Record<string, 'MUST' | 'NOT' | 'OR'> = {
    AND: 'MUST',
    '&&': 'MUST',
    NOT: 'NOT',
    '!': 'NOT',
    OR: 'OR',
    '||': 'OR'
};

/** One character of a query, and whether a backslash before it made it text. */
interface Char {
    char: string;
    escaped: boolean;
}

/** One term as it is written: its sign, whether it stood in quotes, and its characters after any field. */
interface Token {
    sign?: string;
    quoted: boolean;
    chars: Char[];
}

/** One term as Oracle is asked it: as a whole-word expression, and for Oracle Text. */
interface Term {
    pattern: string;
    oracleText: string;
}

/** The parts of a query as they are read, each kind as expressions and as Oracle Text. */
interface Parts {
    scored: string[];
    required: string[];
    excluded: string[];
    scoredText: string[];
    requiredText: string[];
    excludedText: string[];
}

/**
 * A full-text query as Oracle is asked it (drivine4j's TextQuery, read alike). Without a text index it is the terms
 * that score a node, those it must hold and those it must not, each a regular expression that matches the term as a
 * whole word in lower-cased text. Through an Oracle Text index it is `oracleText`.
 *
 * It reads the plain core of the Lucene syntax the graph engines take: words, a `"quoted phrase"`, `+must`, `-not` and
 * `NOT not`, a `prefix*`, and `field:word` as the word. `AND` makes the word after it one a node must hold; `OR` is the
 * default between words. Anything else is read as text. A backslash before a character that is not part of a word
 * makes that character text; before a letter, a digit or an underscore it is itself text.
 */
export class TextQuery {
    /** Reads the query. It must name at least one term that scores. */
    static parse(query: string): TextQuery {
        const parts: Parts = {
            scored: [],
            required: [],
            excluded: [],
            scoredText: [],
            requiredText: [],
            excludedText: []
        };
        let must = false;
        let not = false;
        for (const token of tokens(query)) {
            const operator = OPERATORS[operatorOf(token) ?? ''];
            if (operator === 'MUST' || operator === 'NOT') {
                must ||= operator === 'MUST';
                not ||= operator === 'NOT';
            } else if (operator !== 'OR') {
                add(parts, token, must, not);
                // An operator applies to the token after it and to no other, whether or not that token holds a word.
                must = false;
                not = false;
            }
        }
        if (!parts.scored.length) {
            throw new DrivineError(`A full-text query needs a word to look for: '${query}' has none.`);
        }
        const text =
            [`(${parts.scoredText.join(' ACCUM ')})`, ...parts.requiredText].join(' AND ') +
            parts.excludedText.map((it) => ` NOT ${it}`).join('');
        return new TextQuery(parts.scored, parts.required, parts.excluded, text);
    }

    private constructor(
        readonly scored: string[],
        readonly required: string[],
        readonly excluded: string[],
        /**
         * The same query for an Oracle Text index: the scoring terms accumulated, each required one conjoined and each
         * excluded one taken away. A word is in braces, so it is a word and never one of Oracle Text's operators.
         */
        readonly oracleText: string
    ) {}
}

/** Adds the token's term, if it holds one, to what scores, what is required and what is excluded. */
function add(parts: Parts, token: Token, must: boolean, not: boolean): void {
    const term = termOf(token);
    if (!term) {
        return;
    }
    if (token.sign === '-' || not) {
        parts.excluded.push(term.pattern);
        parts.excludedText.push(term.oracleText);
        return;
    }
    if (token.sign === '+' || must) {
        parts.required.push(term.pattern);
        parts.requiredText.push(term.oracleText);
    }
    parts.scored.push(term.pattern);
    parts.scoredText.push(term.oracleText);
}

const isSpace = (it: Char): boolean => !it.escaped && SPACES.includes(it.char);

/** Whether the character is `other` with its meaning in the syntax, which a backslash takes away. */
const isBare = (it: Char, other: string): boolean => !it.escaped && it.char === other;

/** The token as written when it is a word with no backslash in it, which is what an operator is. */
function operatorOf(token: Token): string | undefined {
    return token.quoted || token.chars.some((it) => it.escaped) ? undefined : token.chars.map((it) => it.char).join('');
}

/**
 * The characters of the query. A backslash and a character after it that is not part of a word are that one character,
 * as text. Any other backslash is a character itself.
 */
function charsOf(query: string): Char[] {
    const chars = [...query];
    const out: Char[] = [];
    for (let at = 0; at < chars.length; ) {
        const next = chars[at + 1];
        if (chars[at] === '\\' && next !== undefined && GAP_CHAR.test(next)) {
            out.push({ char: next, escaped: true });
            at += 2;
        } else {
            out.push({ char: chars[at], escaped: false });
            at++;
        }
    }
    return out;
}

/** The query's tokens, read left to right: a sign, a field (read as the term), then a quoted phrase or a word. */
function tokens(query: string): Token[] {
    const chars = charsOf(query);
    const lastQuote = lastIndex(chars, (it) => isBare(it, '"'));
    const lastEscapedQuote = lastIndex(chars, (it) => it.escaped && it.char === '"');
    const hasText = (index: number): boolean => index < chars.length && !isSpace(chars[index]);
    const out: Token[] = [];
    let at = 0;
    for (;;) {
        while (at < chars.length && isSpace(chars[at])) {
            at++;
        }
        if (at === chars.length) {
            return out;
        }
        // A sign is one only when a term follows it.
        const sign = (isBare(chars[at], '+') || isBare(chars[at], '-')) && hasText(at + 1) ? chars[at].char : undefined;
        if (sign) {
            at++;
        }
        at = pastField(chars, at, hasText);
        const phrase = phraseAt(chars, at, lastQuote, lastEscapedQuote);
        if (phrase) {
            out.push({ sign, quoted: true, chars: phrase.chars });
            at = phrase.next;
            continue;
        }
        const start = at;
        while (hasText(at)) {
            at++;
        }
        out.push({ sign, quoted: false, chars: chars.slice(start, at) });
    }
}

/** Where the term starts when a field stands at `from`: after the colon that ends the field. */
function pastField(chars: Char[], from: number, hasText: (index: number) => boolean): number {
    let colon = from;
    while (hasText(colon) && !isBare(chars[colon], ':') && !isBare(chars[colon], '"')) {
        colon++;
    }
    const isField = colon > from && hasText(colon) && isBare(chars[colon], ':') && hasText(colon + 1);
    return isField ? colon + 1 : from;
}

/**
 * The phrase that opens at `open`, and where reading goes on after it; undefined when no quote opens one there or none
 * closes it. While no bare quote closes it, the first `\"` is read as a backslash of text and the closing quote, so
 * `"C:\"` is the phrase `C:\`.
 */
function phraseAt(
    chars: Char[],
    open: number,
    lastQuote: number,
    lastEscapedQuote: number
): { chars: Char[]; next: number } | undefined {
    if (open >= chars.length || !isBare(chars[open], '"')) {
        return undefined;
    }
    if (open < lastQuote) {
        let close = open + 1;
        while (!isBare(chars[close], '"')) {
            close++;
        }
        return { chars: chars.slice(open + 1, close), next: close + 1 };
    }
    if (open >= lastEscapedQuote) {
        return undefined;
    }
    let escaped = open + 1;
    while (!(chars[escaped].escaped && chars[escaped].char === '"')) {
        escaped++;
    }
    return { chars: [...chars.slice(open + 1, escaped), { char: '\\', escaped: false }], next: escaped + 1 };
}

/**
 * The token's term; undefined when it holds no word. A word still holds a field up to its first bare colon. The term is
 * the start of a word when its last character is a bare `*`.
 */
function termOf(token: Token): Term | undefined {
    const text = token.quoted ? token.chars : token.chars.slice(token.chars.findIndex((it) => isBare(it, ':')) + 1);
    const words = text
        .map((it) => it.char)
        .join('')
        .toLowerCase()
        .split(GAP)
        .filter((it) => it.length > 0);
    if (!words.length) {
        return undefined;
    }
    const prefix = isBare(text[text.length - 1], '*');
    return {
        oracleText: prefix
            ? [...words.slice(0, -1).map((it) => `{${it}}`), `${words[words.length - 1]}%`].join(' ')
            : `{${words.join(' ')}}`,
        pattern: BOUNDARY_BEFORE + words.join('[^[:alnum:]_]+') + (prefix ? '' : BOUNDARY_AFTER)
    };
}

function lastIndex<T>(items: T[], test: (it: T) => boolean): number {
    for (let i = items.length - 1; i >= 0; i--) {
        if (test(items[i])) {
            return i;
        }
    }
    return -1;
}
