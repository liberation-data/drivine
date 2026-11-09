import { javaDouble } from '@/connection/sqlite/JavaDouble';

/**
 * A float, bound to a Cypher statement as one even where it is a whole number. A JavaScript number can't tell `5.0` from
 * `5`, so a SQL store binds a whole number as an integer: `toString($f)` of `f = 5` gives `'5'` there. Bind
 * `cypherFloat(5)` where it is a float, and it gives `'5.0'` on the SQL stores, Neo4j, Memgraph and Neptune, as
 * drivine4j's double does.
 *
 * On a SQL store it is compiled as a float (the shared compiler's `{"$float": …}`). A graph engine is given the number
 * itself: Neo4j's driver sends any JavaScript number as a float, so `5` is `5.0` there with or without it. FalkorDB's
 * client writes the number into the statement as JavaScript writes it, so a whole one is still an integer there, `5`.
 */
export class CypherFloat {
    constructor(readonly value: number) {}

    /** As the JVM writes a double: `5.0`, `2.5`, `1.0E20`. */
    toString(): string {
        return javaDouble(this.value);
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
