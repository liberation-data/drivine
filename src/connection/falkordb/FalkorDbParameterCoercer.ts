import { DrivineError } from '@/DrivineError';

const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Prepares parameters for FalkorDB, whose client writes them into the statement as text (`CYPHER name=value ...`)
 * rather than sending them apart from it.
 *
 * - A `Date` is written as ISO 8601 with all nine digits of its second (`2040-01-01T00:00:00.000000000Z`). FalkorDB
 *   holds it as text and compares it as text, which sorts as time only when every value is the same width. Nine
 *   digits matches drivine4j, so a store written from the JVM and from Node compares alike.
 * - A `Set` (or any other iterable that is not a string) is written as a list; Cypher has no set.
 * - `undefined` is written as `null`.
 * - A map key or parameter name that is not a plain name is refused: the client writes keys unquoted, and FalkorDB
 *   accepts no quoted form, so such a key would corrupt the statement or change what it does.
 * - A number that is not finite is refused, as Cypher has no literal for it.
 *
 * Lists and maps are coerced all the way down.
 */
export class FalkorDbParameterCoercer {
    coerce(parameters: Record<string, any>): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [name, value] of Object.entries(parameters)) {
            this.assertPlainName(name, 'parameter name');
            result[name] = this.coerceValue(value);
        }
        return result;
    }

    private coerceValue(value: any): any {
        if (value === undefined || value === null) {
            return null;
        }
        if (value instanceof Date) {
            return toFixedWidthIso(value);
        }
        switch (typeof value) {
            case 'number':
                if (!Number.isFinite(value)) {
                    throw new DrivineError(`FalkorDB can't take ${value} as a parameter value.`);
                }
                return value;
            case 'string':
            case 'boolean':
                return value;
            case 'bigint':
                return Number(value);
            case 'object':
                return this.coerceCollection(value);
            default:
                throw new DrivineError(`FalkorDB can't take a ${typeof value} as a parameter value.`);
        }
    }

    private coerceCollection(value: object): any {
        if (Array.isArray(value) || value instanceof Set) {
            return Array.from(value, (it) => this.coerceValue(it));
        }
        const result: Record<string, any> = {};
        for (const [key, item] of Object.entries(value)) {
            this.assertPlainName(key, 'map key');
            result[key] = this.coerceValue(item);
        }
        return result;
    }

    private assertPlainName(name: string, what: string): void {
        if (!PLAIN_NAME.test(name)) {
            throw new DrivineError(
                `FalkorDB can't take the ${what} '${name}': it must be letters, digits and underscores, not ` +
                    `starting with a digit.`
            );
        }
    }
}

export function toFixedWidthIso(date: Date): string {
    // toISOString always writes three digits of the second; pad them to nine.
    return date.toISOString().replace(/\.(\d{3})Z$/, '.$1000000Z');
}
