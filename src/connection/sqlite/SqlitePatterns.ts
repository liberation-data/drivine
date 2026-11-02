/**
 * The POSIX classes a bracket expression may name, as JavaScript's Unicode expressions name them: the same classes as
 * drivine4j's, Java's with UNICODE_CHARACTER_CLASS, so a letter is any alphabetic character, a vowel sign among them.
 */
const POSIX: [string, string][] = [
    ['[:alnum:]', '\\p{Alphabetic}\\p{Nd}'],
    ['[:alpha:]', '\\p{Alphabetic}'],
    ['[:digit:]', '\\p{Nd}'],
    ['[:space:]', '\\p{White_Space}'],
    ['[:upper:]', '\\p{Uppercase}'],
    ['[:lower:]', '\\p{Lowercase}'],
    ['[:punct:]', '\\p{P}']
];

/** A flag group as Java writes one, `(?i)`, which sets its flags for the rest of the group it is in. */
const FLAGS = /^\(\?([ims]+(?:-[ims]*)?|-[ims]+)\)/;

/**
 * The regular expressions the functions of one connection have read, compiled once each: a search asks the same few of
 * every node it reads. An expression is Java's, as drivine4j's `SqlitePatterns` reads it, written as JavaScript reads
 * one: a class written as POSIX names it, `[:alnum:]`, is the same class, of letters and digits in any script, as on a
 * Postgres database whose text is Unicode, so a full-text search written for Postgres reads alike here.
 */
export class SqlitePatterns {
    private static readonly MAX = 256;
    private readonly compiled = new Map<string, RegExp>();

    of(expression: string, flags: string): RegExp {
        const key = `${flags}/${expression}`;
        let found = this.compiled.get(key);
        if (!found) {
            // A leading `(?i)` ignores case, as Cypher's `=~` reads it, and `\z` is the end of the text, as Java writes it.
            const ignoreCase = expression.startsWith('(?i)');
            const java = POSIX.reduce(
                (text, [posix, js]) => text.split(posix).join(js),
                ignoreCase ? expression.slice(4) : expression
            );
            found = compiled(java, `u${flags}${ignoreCase ? 'i' : ''}`);
            if (this.compiled.size >= SqlitePatterns.MAX) {
                this.compiled.delete(this.compiled.keys().next().value!);
            }
            this.compiled.set(key, found);
        }
        found.lastIndex = 0;
        return found;
    }
}

/**
 * `java` as JavaScript reads it, with `flags`. A flag group within it is a group of its own (see {@link scopedFlags}),
 * which Node 22's JavaScript does not read: there, where each flag group only turns flags on, they are turned on for the
 * whole expression, which is the same where the group runs to its end but for the text's start and end, as in the `^(?:(?i)abc)\z`
 * compiled Cypher's `=~ '(?i)abc'` gives.
 */
function compiled(java: string, flags: string): RegExp {
    try {
        return new RegExp(scopedFlags(java).replace(/\\z/g, '$'), flags);
    } catch (e) {
        const groups = [...java.matchAll(new RegExp(FLAGS.source.slice(1), 'g'))].map((it) => it[1]);
        if (groups.length === 0 || groups.some((it) => it.includes('-'))) {
            throw e;
        }
        const on = [...new Set(groups.join(''))].filter((it) => !flags.includes(it)).join('');
        // The text's start and end, which `m` turned on for the whole expression would move to each line's.
        const anchored = java
            .replace(/^\^/, '(?<![\\s\\S])')
            .replace(/\\z/g, '(?![\\s\\S])')
            .replace(new RegExp(FLAGS.source.slice(1), 'g'), '');
        return new RegExp(anchored, `${flags}${on}`);
    }
}

/**
 * `source` with each flag group that is not at its start, `(?i)`, written as JavaScript writes one, a group of its own
 * around the rest of the group it is in, `(?i:…)`: Java reads a flag group anywhere, as in the `^(?:(?i)abc)\z` compiled
 * Cypher's `=~ '(?i)abc'` gives, and JavaScript only as a group around what it is for.
 */
function scopedFlags(source: string): string {
    let written = '';
    let inClass = false;
    for (let at = 0; at < source.length; at++) {
        const c = source[at];
        if (c === '\\') {
            written += source.substring(at, at + 2);
            at++;
            continue;
        }
        if (inClass) {
            inClass = c !== ']';
            written += c;
            continue;
        }
        if (c === '[') {
            inClass = true;
            written += c;
            continue;
        }
        const flags = c === '(' ? FLAGS.exec(source.substring(at)) : null;
        if (!flags) {
            written += c;
            continue;
        }
        const from = at + flags[0].length;
        const end = groupEnd(source, from);
        return `${written}(?${flags[1]}:${scopedFlags(source.substring(from, end))})${scopedFlags(
            source.substring(end)
        )}`;
    }
    return written;
}

/** Where the group `source` is in at `from` ends: at its closing parenthesis, or at the end of the text. */
function groupEnd(source: string, from: number): number {
    let depth = 0;
    let inClass = false;
    for (let at = from; at < source.length; at++) {
        const c = source[at];
        if (c === '\\') {
            at++;
        } else if (inClass) {
            inClass = c !== ']';
        } else if (c === '[') {
            inClass = true;
        } else if (c === '(') {
            depth++;
        } else if (c === ')') {
            if (depth === 0) {
                return at;
            }
            depth--;
        }
    }
    return source.length;
}
