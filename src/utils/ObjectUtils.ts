import { instanceToPlain } from 'class-transformer';
import neo4j from "neo4j-driver";

export interface PrimitivePropsOptions {
    classToPlain: boolean;
    neo4jDateToDateTime: boolean;
}

export class ObjectUtils {
    /**
     * Returns a new object that contains only the 'primitive' properties, or arrays of them, from the source object.
     * @param object
     * @returns {{}}
     */
    static primitiveProps = (
        object: any,
        options: PrimitivePropsOptions = { classToPlain: true, neo4jDateToDateTime: true }
    ): any => {
        const props: Record<string, any> = {};
        if (object) {
            const source = options.classToPlain ? instanceToPlain(object) : object;
            const strings = Object.keys(source);
            strings.forEach((key: string) => {
                const candidate = source[key];
                // Array of primitives
                if (
                    candidate != undefined &&
                    candidate.constructor === Array &&
                    candidate.filter((it: any) => typeof it === 'object').length === 0
                ) {
                    props[key] = candidate;
                } else if (candidate != undefined && candidate instanceof Date && options.neo4jDateToDateTime) {
                    props[key] = neo4j.types.DateTime.fromStandardDate(candidate);
                } else if (candidate != undefined && typeof candidate !== 'object') {
                    props[key] = candidate;
                }
            });
        }
        return props;
    };

    /**
     * A deep copy of plain data and class instances, each copy keeping its prototype. Dates, sets and maps are copied;
     * functions and other values are shared. A value met twice is copied once.
     */
    static deepCopy<T>(value: T, seen: Map<any, any> = new Map()): T {
        if (value === null || typeof value !== 'object') {
            return value;
        }
        if (value instanceof Date) {
            return new Date(value.getTime()) as any;
        }
        if (seen.has(value)) {
            return seen.get(value);
        }
        if (value instanceof Set || value instanceof Map) {
            // A set or a map holds its items in no key, so a copy of its keys would be empty.
            const copy: any = value instanceof Set ? new Set() : new Map();
            seen.set(value, copy);
            value.forEach((item: any, key: any) =>
                copy instanceof Set
                    ? copy.add(ObjectUtils.deepCopy(item, seen))
                    : copy.set(key, ObjectUtils.deepCopy(item, seen))
            );
            return copy;
        }
        const copy: any = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
        seen.set(value, copy);
        for (const key of Object.keys(value)) {
            copy[key] = ObjectUtils.deepCopy((value as any)[key], seen);
        }
        return copy;
    }

    /**
     * Whether two values hold the same data: equal primitives, dates of one time, sets of the same primitives, or
     * arrays, maps and objects alike.
     */
    static deepEqual(a: any, b: any): boolean {
        if (a === b) {
            return true;
        }
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime();
        }
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
            return false;
        }
        if (Array.isArray(a) !== Array.isArray(b)) {
            return false;
        }
        if (isCollection(a) || isCollection(b)) {
            return ObjectUtils.collectionsEqual(a, b);
        }
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every((key) => ObjectUtils.deepEqual(a[key], b[key]));
    }

    /** Whether two sets hold the same items, or two maps the same entries alike. */
    private static collectionsEqual(a: any, b: any): boolean {
        if (a instanceof Set && b instanceof Set) {
            return a.size === b.size && [...a].every((it) => b.has(it));
        }
        if (a instanceof Map && b instanceof Map) {
            return (
                a.size === b.size && [...a].every(([key, it]) => b.has(key) && ObjectUtils.deepEqual(it, b.get(key)))
            );
        }
        return false;
    }
}

function isCollection(value: object): boolean {
    return value instanceof Set || value instanceof Map;
}
