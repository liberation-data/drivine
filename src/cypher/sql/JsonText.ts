import { CypherFloat } from '@/cypher/ast/Expression';

/**
 * A value as JSON text, as drivine4j writes a statement's values: a map's entries in the order given, a whole number
 * as one, and a floating-point number the statement writes ({@link CypherFloat}) with its fraction, `2.0`, so it stays
 * a float. A date is its ISO 8601 text.
 */
export function jsonText(value: any): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (value instanceof CypherFloat) {
        return value.toString();
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return `[${value.map(jsonText).join(',')}]`;
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
        const entries = Object.entries(value).filter(([, item]) => item !== undefined);
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${jsonText(item)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}
