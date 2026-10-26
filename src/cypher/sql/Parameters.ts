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
     * Each parameter given as an iterator, by name, as the list of its items: an iterator gives them only once, and the
     * statement reads a parameter's value to compile it (whether it holds a null) as well as to bind it.
     */
    private readonly items: Map<string, unknown[]> = new Map();

    /**
     * @param asJson the bound JSON text at a marker, or with `inObject` the parameter of a name, as the store's JSON
     * @param asCount the bound whole number at a marker, or with `inObject` the parameter of a name, as the store's
     * number
     * @param text a value as the JSON text it is bound as
     * @param asPath the value at a path of keys in a parameter that is a map, read straight from the text it is bound
     * as: given the marker (or with `inObject` the parameter's name) and the keys; none where the store reads the
     * parameter as JSON, then each key of it
     */
    constructor(
        private readonly given: Record<string, any>,
        private readonly asJson: (marker: string) => string,
        private readonly asCount: (marker: string) => string,
        private readonly inObject: boolean = false,
        private readonly text: (value: any) => string = jsonText,
        private readonly asPath?: (marker: string, keys: string[]) => string
    ) {}

    /** What the SQL binds. */
    get values(): Record<string, any> {
        return this.inObject
            ? { [PARAMETERS_OBJECT]: this.text({ ...this.given, ...Object.fromEntries(this.items) }) }
            : this.bound;
    }

    /** The parameter `name`, as JSON. */
    json(name: string): string {
        const value = this.value(name);
        if (this.inObject) {
            return this.asJson(name);
        }
        return this.asJson(this.bind(name, value));
    }

    /**
     * The value at `keys` in the parameter `name`, as JSON, where the store reads it from the text the parameter is bound
     * as (see `asPath`) and the parameter is a map that holds a map at each key but the last; undefined otherwise.
     */
    jsonAt(name: string, keys: string[]): string | undefined {
        if (this.asPath === undefined) {
            return undefined;
        }
        const value = this.value(name);
        let map = value;
        for (const key of keys.slice(0, -1)) {
            map = isMap(map) ? map[key] : undefined;
        }
        if (!isMap(map)) {
            return undefined;
        }
        if (this.inObject) {
            return this.asPath(name, keys);
        }
        return this.asPath(this.bind(name, value), keys);
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

    /** The value bound to the parameter `name`, as the caller gave it: an iterator as the list of its items. */
    value(name: string): any {
        if (!Object.prototype.hasOwnProperty.call(this.given, name)) {
            throw new DrivineError(`The statement has a parameter $${name}, and no value is bound to it.`);
        }
        const value = this.given[name];
        if (!isIterator(value)) {
            return value;
        }
        if (!this.items.has(name)) {
            this.items.set(name, Array.from(value));
        }
        return this.items.get(name);
    }

    /** The marker the parameter `name`, of value `value`, is bound at as JSON text. */
    private bind(name: string, value: any): string {
        const key = `_cy_${name}`;
        // Written once: an iterator gives its items only once, and a parameter is read where the statement names it.
        if (!(key in this.bound)) {
            this.bound[key] = value === null || value === undefined ? null : this.text(value);
        }
        return `$${key}`;
    }
}

/** Whether `value` is an iterator, which is its own iterable, so gives its items once: a generator's, as one. */
function isIterator(value: any): value is Iterable<unknown> {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof value[Symbol.iterator] === 'function' &&
        value[Symbol.iterator]() === value
    );
}

/** Whether `value` is a map, as the JSON text it is bound as writes one: no list, date, number, bytes or iterable. */
function isMap(value: any): value is Record<string, any> {
    if (value === null || typeof value !== 'object' || typeof value[Symbol.iterator] === 'function') {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
