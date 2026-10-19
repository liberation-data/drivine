const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The Unicode escape of a backtick, with as many `u`s as an escape may have. Neo4j and FalkorDB decode `\u0060` before
 * they read the quoting, even between backticks, so its escape would end a name's quotes as a backtick does.
 */
const ESCAPED_BACKTICK = /\\u+0060/g;

/**
 * A label, relationship type or property name as Cypher must write it: as it is when plain, otherwise between
 * backticks, as one name whatever it holds. A name may come from data (a property bag's key, a label, a property named
 * at runtime), so a backtick is doubled in either spelling, its escape read as one, as drivine4j quotes names.
 */
export function quoteName(name: string): string {
    return PLAIN_NAME.test(name) ? name : `\`${name.replace(ESCAPED_BACKTICK, '`').replace(/`/g, '``')}\``;
}

/**
 * A Cypher string literal of an index's name, as a search procedure takes it: a backslash and a quote escaped, the
 * backslash first, so neither a quote nor the escape of one can end it.
 */
export function quoteString(text: string): string {
    return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function labelExpression(labels: string[]): string {
    return labels.map((it) => `:${quoteName(it)}`).join('');
}
