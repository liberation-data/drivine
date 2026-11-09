/**
 * A float, bound to a Cypher statement as one even where it is a whole number. A JavaScript number can't tell `5.0` from
 * `5`, so Drivine binds a whole number as an integer, as Neo4j's types and the SQL stores do: `toString($f)` of `f = 5`
 * gives `'5'`. Bind `cypherFloat(5)` where it is a float, and it gives `'5.0'` on every store, as drivine4j's double does.
 *
 * On a SQL store it is compiled as a float (the shared compiler's `{"$float": …}`). A graph engine is given the number
 * itself: Neo4j's driver sends a JavaScript number as a float, and FalkorDB's client writes it as it writes any number.
 */
export class CypherFloat {
    constructor(readonly value: number) {}

    /** As the JVM writes a double: `5.0`, `2.5`, `1.0E20`. */
    toString(): string {
        const text = String(this.value);
        return Number.isInteger(this.value) && !/e/i.test(text) ? `${text}.0` : text;
    }
}

/** `value` bound as a float: see {@link CypherFloat}. */
export function cypherFloat(value: number): CypherFloat {
    return new CypherFloat(value);
}

/** `value` with each {@link CypherFloat} in it, at any depth, the number it holds: as a graph engine is given it. */
export function withFloatsAsNumbers(value: any): any {
    if (value instanceof CypherFloat) {
        return value.value;
    }
    if (Array.isArray(value)) {
        return value.map(withFloatsAsNumbers);
    }
    if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withFloatsAsNumbers(item)]));
    }
    return value;
}
