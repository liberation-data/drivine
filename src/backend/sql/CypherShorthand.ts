/** `alias.name` or ``alias.`a name` ``, matched where it starts. */
const SHORTHAND = /([A-Za-z_][A-Za-z0-9_]*)\.(?:`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))/y;

/**
 * An equality or inequality with `true` or `false` that follows a property, in any case: the operator with its space,
 * and the boolean.
 */
const BOOLEAN_COMPARED = /([ \t\n\v\f\r]*(?:=|<>|!=)[ \t\n\v\f\r]*)(true|false)(?![A-Za-z0-9_])/iy;

/** A character that continues a name, so a name after it is not the start of one. */
const CONTINUES_NAME = /[\p{L}\p{Nd}_.]/u;

/** What a row of a node has of its own; a predicate that names one means the column. */
const COLUMNS = new Set(['nid', 'labels', 'props', 'stamp']);

/** The match of a sticky pattern at `at`, or undefined. */
function matchAt(pattern: RegExp, text: string, at: number): RegExpExecArray | undefined {
    pattern.lastIndex = at;
    return pattern.exec(text) ?? undefined;
}

/**
 * Rewrites a predicate the caller wrote, with a property of the root written as Cypher writes it, `issue.state` or
 * ``issue.`metadata.source` ``, to read that property. So the plain comparisons a Cypher predicate makes are the same
 * text on a SQL store; anything more is SQL, over the root's columns `issue.props`, `issue.labels` and `issue.stamp`.
 * Text inside a string literal is left as it is. A property compared with `true` or `false` (`issue.locked = true`) is
 * compared with the text a store reads a JSON boolean as, since SQL compares no text with a boolean. drivine4j's
 * `CypherShorthand`, rule for rule.
 */
export class CypherShorthand {
    /**
     * @param alias what the predicate calls the root
     * @param row what the statement calls the root's row
     * @param property how the store reads the property of a row, given the row and the property's name
     */
    constructor(
        private readonly alias: string,
        private readonly row: string,
        private readonly property: (row: string, key: string) => string
    ) {}

    /** `predicate` with each `alias.name` of the root read as that property, or as that column of the row. */
    rewrite(predicate: string): string {
        let out = '';
        let at = 0;
        while (at < predicate.length) {
            if (predicate[at] === "'") {
                const stop = this.endOfLiteral(predicate, at);
                out += predicate.slice(at, stop);
                at = stop;
                continue;
            }
            const read = this.rootAt(predicate, at);
            if (read) {
                out += read.text;
                at = read.end;
            } else {
                out += predicate[at++];
            }
        }
        return out;
    }

    /**
     * The `alias.name` of the root that starts at `at`, as the store reads it, and the index after it: undefined where
     * none does, as where a name goes on from before `at`, the alias is another's, or the name is a function's.
     */
    private rootAt(predicate: string, at: number): { text: string; end: number } | undefined {
        const match =
            at === 0 || !CONTINUES_NAME.test(predicate[at - 1]) ? matchAt(SHORTHAND, predicate, at) : undefined;
        const end = match ? at + match[0].length : at;
        if (!match || match[1] !== this.alias || predicate[end] === '(') {
            return undefined;
        }
        const key = match[2] ?? match[3];
        // One of the row's own columns is the column; any other name is a property.
        if (COLUMNS.has(key)) {
            return { text: `${this.row}.${key}`, end };
        }
        // A property compared with a boolean is compared with the boolean's text, which is what a property is read as.
        const compared = matchAt(BOOLEAN_COMPARED, predicate, end);
        return compared
            ? {
                  text: `${this.property(this.row, key)}${compared[1]}'${compared[2].toLowerCase()}'`,
                  end: end + compared[0].length
              }
            : { text: this.property(this.row, key), end };
    }

    /** The index after the string literal that opens at `start`; a doubled quote is part of it. */
    private endOfLiteral(predicate: string, start: number): number {
        let end = start + 1;
        while (end < predicate.length) {
            if (predicate[end] !== "'") {
                end++;
            } else if (predicate[end + 1] === "'") {
                end += 2;
            } else {
                break;
            }
        }
        return Math.min(end + 1, predicate.length);
    }
}
