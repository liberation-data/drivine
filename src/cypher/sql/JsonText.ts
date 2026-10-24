import { isInt } from 'neo4j-driver';
import { CypherFloat } from '@/cypher/ast/Expression';

/**
 * A value as JSON text, as drivine4j writes a statement's values: a map's entries in the order given, a whole number
 * as one, and a floating-point number the statement writes ({@link CypherFloat}) with its fraction, `2.0`, so it stays
 * a float. A date is its ISO 8601 text. The Neo4j driver's `Integer`, which an app binds a whole number as for Neo4j,
 * is the number it holds, and a `Buffer` or an `Int8Array` (the Neo4j driver's bytes) its base64 text, as drivine4j
 * writes a byte array. Any other iterable, a `Set` or a `Map`, is the list of its items, as the Neo4j driver sends it.
 */
export function jsonText(value: any): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (value instanceof CypherFloat) {
        return value.toString();
    }
    if (typeof value === 'bigint' || isInt(value)) {
        return value.toString();
    }
    if (Array.isArray(value)) {
        return `[${value.map(jsonText).join(',')}]`;
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
        return objectText(value);
    }
    return JSON.stringify(value) ?? 'null';
}

/** An object other than a list or a date: bytes, an iterable's items, or a map's entries. */
function objectText(value: any): string {
    if (value instanceof Uint8Array || value instanceof Int8Array) {
        return JSON.stringify(Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64'));
    }
    if (typeof value[Symbol.iterator] === 'function') {
        return jsonText(Array.from(value));
    }
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${jsonText(item)}`).join(',')}}`;
}
