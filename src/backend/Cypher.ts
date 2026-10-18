const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A label, relationship type or property name as Cypher must write it: as it is when plain, otherwise in backticks.
 */
export function quoteName(name: string): string {
    return PLAIN_NAME.test(name) ? name : `\`${name.replace(/`/g, '``')}\``;
}

export function labelExpression(labels: string[]): string {
    return labels.map((it) => `:${quoteName(it)}`).join('');
}
