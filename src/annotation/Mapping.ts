import { definePropertyMetadata, EmptyWhenAbsentOptions } from '@/annotation/Metadata';

/**
 * Stores the property as a JSON string, for a value an engine can't store as a property: a list of maps, a map, or a
 * list on an engine without list properties. Packed on every write and unpacked on load.
 */
export function JsonPacked(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { jsonPacked: true });
}

/**
 * Loads the property's whole numbers as bigints, those past 2^53 with the digits a store saved them with: the property
 * itself, a list's items, a map's or a property bag's values, and a packed value. Any other property loads a whole
 * number as a JavaScript number, past 2^53 the nearest. A property TypeScript records as `bigint`, or
 * one the class initializes with a bigint, loads so without it; this is for one TypeScript records otherwise: a union
 * such as `bigint | null`, a list, a map or a bag. On Oracle, whose driver reads a number as a JavaScript number, a
 * load still gives a bigint, but of the nearest number past 2^53 (#737).
 */
export function BigIntProperty(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { bigInt: true });
}

/**
 * Keeps the property's initializer when the stored value is null. (A property the node doesn't have keeps its
 * initializer anyway.)
 */
export function Default(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { default: true });
}

/**
 * Loads an absent or null collection as an empty one: `[]` for an array, an empty `Set` for a set, `{}` for an object
 * or a map. The kind is read from the property's declared type. TypeScript records a union, such as
 * `string[] | null` under strict null checks, as Object, which can't be told from a map: name the kind for such a
 * field, `@EmptyWhenAbsent({ kind: 'array' })`, or declare it `tags?: string[]`.
 */
export function EmptyWhenAbsent(options: EmptyWhenAbsentOptions = {}): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { emptyWhenAbsent: { kind: options.kind } });
}

/**
 * Sorts a list relationship of a view after it is loaded, by a property path (`'name'`, or `'person.name'` into a
 * related view or relationship fragment). Nulls go last.
 */
export function SortedBy(property: string, ascending: boolean = true): PropertyDecorator {
    return (prototype: object, field: string | symbol) =>
        definePropertyMetadata(prototype, String(field), { sortedBy: { property, ascending } });
}
