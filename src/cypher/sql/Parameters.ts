import { isInt } from 'neo4j-driver';
import { DrivineError } from '@/DrivineError';
import { jsonText } from '@/cypher/sql/JsonText';

/** The marker every parameter is bound at, as one JSON object, where they are bound so. */
export const PARAMETERS_OBJECT = '_cy_params';

/**
 * The parameters of a statement as the SQL binds them. A Cypher parameter is a value, so it is bound as the JSON text of
 * its value and read as JSON, and compares as a property it is compared with does. A count (`SKIP`, `LIMIT`) is bound
 * as the number it is. A parameter the statement names and the caller did not bind is refused, as on a graph engine.
 *
 * With `inObject`, every parameter is bound at once, as one JSON object at {@link PARAMETERS_OBJECT}, and `asJson` and
 * `asCount` are given a parameter's name and read it from there: a procedure takes its parameters so.
 */
export class Parameters {
    private readonly bound: Record<string, any> = {};

    /**
     * @param asJson the bound JSON text at a marker, or with `inObject` the parameter of a name, as the store's JSON
     * @param asCount the bound whole number at a marker, or with `inObject` the parameter of a name, as the store's
     * number
     * @param text a value as the JSON text it is bound as
     */
    constructor(
        private readonly given: Record<string, any>,
        private readonly asJson: (marker: string) => string,
        private readonly asCount: (marker: string) => string,
        private readonly inObject: boolean = false,
        private readonly text: (value: any) => string = jsonText
    ) {}

    /** What the SQL binds. */
    get values(): Record<string, any> {
        return this.inObject ? { [PARAMETERS_OBJECT]: this.text(this.given) } : this.bound;
    }

    /** The parameter `name`, as JSON. */
    json(name: string): string {
        const value = this.value(name);
        if (this.inObject) {
            return this.asJson(name);
        }
        const key = `_cy_${name}`;
        // Written once: an iterator gives its items only once, and a parameter is read where the statement names it.
        if (!(key in this.bound)) {
            this.bound[key] = value === null || value === undefined ? null : this.text(value);
        }
        return this.asJson(`$${key}`);
    }

    /** The parameter `name`, as a whole number. */
    count(name: string): string {
        const value = this.value(name);
        if (this.inObject) {
            return this.asCount(name);
        }
        const key = `_cyn_${name}`;
        // The Neo4j driver's Integer, as a number the driver of the store binds.
        this.bound[key] = isInt(value) ? BigInt(value.toString()) : value;
        return this.asCount(`$${key}`);
    }

    /** The value bound to the parameter `name`, as the caller gave it. */
    value(name: string): any {
        if (!Object.prototype.hasOwnProperty.call(this.given, name)) {
            throw new DrivineError(`The statement has a parameter $${name}, and no value is bound to it.`);
        }
        return this.given[name];
    }
}
