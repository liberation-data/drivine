/**
 * The `$name` parameters of a SQL statement, read as drivine4j's `SqlParameters.positional` reads them.
 *
 * A parameter is a `$` that doesn't continue an identifier, followed by a name: Oracle and Postgres allow `$` inside an
 * identifier (`v$session`), never at its start. A name is as Cypher's grammar reads one, past ASCII too (`$größe`), but
 * for the currency symbols it allows after the first character: a `$` ends it, and the longest name is read, so `$id`
 * is not read in `$idList`.
 *
 * Text inside a string literal (`'…'`, `n'…'`, `q'[…]'` or `nq'[…]'`, or Postgres's `e'…'`, where a backslash escapes
 * the quote after it), Postgres's dollar-quoted text (`$$…$$`, `$tag$…$tag$`), a quoted identifier or a comment is left
 * as it is. So the `'$t'` of a temporal value's tag, the
 * `'$$score'` key of a property whose name begins with `$`, and a JSON path such as `'$."$t"'` or `'$.name'` are never
 * read as parameters, whatever the statement binds (drivine#789).
 */

/** A parameter's name, read from where it begins. */
const NAME = /[\p{ID_Start}\p{Pc}]\p{ID_Continue}*/uy;

/** A character an identifier goes on with: one before a `$` makes the `$` part of it. */
const CONTINUES = /[\p{ID_Continue}$#]/u;

/**
 * [sql] with each parameter outside quoted text given to [replace], by its name: what it gives stands in the
 * parameter's place, or the parameter is kept as it is where it gives `undefined`.
 */
export function replaceParameters(sql: string, replace: (name: string) => string | undefined): string {
    let out = '';
    walk(
        sql,
        (text) => (out += text),
        (name, text) => (out += replace(name) ?? text)
    );
    return out;
}

/** The names of the parameters outside quoted text in [sql]. */
export function parameterNames(sql: string): Set<string> {
    const names = new Set<string>();
    walk(
        sql,
        () => undefined,
        (name) => names.add(name)
    );
    return names;
}

/** Reads [sql] once, left to right, giving [text] what is no parameter and [parameter] each parameter. */
function walk(sql: string, text: (text: string) => void, parameter: (name: string, text: string) => void): void {
    let i = 0;
    let plain = 0;
    while (i < sql.length) {
        const end = endOfSkipped(sql, i);
        if (end >= 0) {
            i = end;
            continue;
        }
        const name = sql[i] === '$' && !continuesIdentifier(sql, i) ? nameAt(sql, i + 1) : undefined;
        if (name === undefined) {
            i++;
            continue;
        }
        text(sql.slice(plain, i));
        parameter(name, sql.slice(i, i + 1 + name.length));
        i += 1 + name.length;
        plain = i;
    }
    text(sql.slice(plain));
}

/** The index after the quoted text or comment that opens at [start]; -1 where none does. */
function endOfSkipped(sql: string, start: number): number {
    const c = sql[start];
    if (c === "'" || c === '"') {
        return endOfQuoted(sql, start, c);
    }
    const prefix = literalPrefix(sql, start);
    if (prefix !== undefined) {
        const kind = prefix.toLowerCase();
        return kind.endsWith('q')
            ? endOfAlternativeQuoted(sql, start + prefix.length - 1)
            : endOfQuoted(sql, start + prefix.length, "'", kind === 'e');
    }
    const tag = dollarTag(sql, start);
    if (tag !== undefined) {
        return sql.indexOf(tag, start + tag.length) + tag.length;
    }
    if (sql.startsWith('--', start)) {
        return atOr(sql.indexOf('\n', start), sql.length);
    }
    if (sql.startsWith('/*', start)) {
        return atOr(sql.indexOf('*/', start + 2), sql.length - 2) + 2;
    }
    return -1;
}

function atOr(index: number, missing: number): number {
    return index < 0 ? missing : index;
}

/** The name of a parameter that begins at [start], past its `$`; undefined where none does. */
function nameAt(sql: string, start: number): string | undefined {
    NAME.lastIndex = start;
    return NAME.exec(sql)?.[0];
}

/**
 * Whether the character before [index] is part of an identifier, which the one at [index] would then continue. The
 * character is read whole where it is past the BMP, so the letter `𝑥` continues `𝑥$a`.
 */
function continuesIdentifier(sql: string, index: number): boolean {
    if (index === 0) {
        return false;
    }
    const low = sql.charCodeAt(index - 1);
    const pair = index > 1 && low >= 0xdc00 && low <= 0xdfff && /[\uD800-\uDBFF]/.test(sql[index - 2]);
    return CONTINUES.test(sql.slice(pair ? index - 2 : index - 1, index));
}

/**
 * The prefix of a national, alternatively quoted or escaped literal that opens at [start] (`n`, `q`, `nq` or `e`, in
 * either case), where one does.
 */
function literalPrefix(sql: string, start: number): string | undefined {
    if (continuesIdentifier(sql, start)) {
        return undefined;
    }
    const ahead = sql.slice(start, start + 3).toLowerCase();
    return ["nq'", "q'", "n'", "e'"].find((it) => ahead.startsWith(it))?.slice(0, -1);
}

/**
 * The tag of a Postgres dollar quote that opens at [start], `$$` or `$tag$`, the dollars and all, where one does. A
 * quote is one only where the tag comes again to close it: so `$a$b` is still the parameter `a` and the text `$b`, as
 * Oracle reads it. `$$` before a name is a PL/SQL inquiry directive (`$$PLSQL_UNIT`), not a quote.
 */
function dollarTag(sql: string, start: number): string | undefined {
    if (sql[start] !== '$' || continuesIdentifier(sql, start)) {
        return undefined;
    }
    const name = nameAt(sql, start + 1) ?? '';
    const close = start + 1 + name.length;
    if (sql[close] !== '$') {
        return undefined;
    }
    if (name === '' && nameAt(sql, close + 1) !== undefined) {
        return undefined;
    }
    const tag = sql.slice(start, close + 1);
    return sql.indexOf(tag, close + 1) >= 0 ? tag : undefined;
}

/**
 * The index after the literal or quoted identifier that opens at [start]; a doubled quote is part of it, and so is one
 * after a backslash where [escapes] (Postgres's `e'it\'s'`).
 */
function endOfQuoted(sql: string, start: number, quote: string, escapes: boolean = false): number {
    let i = start + 1;
    while (i < sql.length) {
        if (escapes && sql[i] === '\\') {
            i += 2;
        } else if (sql[i] !== quote) {
            i++;
        } else if (sql[i + 1] === quote) {
            i += 2;
        } else {
            return i + 1;
        }
    }
    return sql.length;
}

/** The index after an Oracle `q'[…]'` literal whose `q` is at [start]. */
function endOfAlternativeQuoted(sql: string, start: number): number {
    if (start + 2 >= sql.length) {
        return sql.length;
    }
    const open = sql[start + 2];
    const close = { '[': ']', '(': ')', '{': '}', '<': '>' }[open] ?? open;
    return atOr(sql.indexOf(`${close}'`, start + 3), sql.length - 2) + 2;
}
