import { definePropertyMetadata } from '@/annotation/Metadata';

/**
 * Stores the property as a JSON string, for a value an engine can't store as a property: a list of maps, a map, or a
 * list on an engine without list properties. Packed on every write and unpacked on load.
 */
export function JsonPacked(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { jsonPacked: true });
}

/**
 * Keeps the property's initializer when the stored value is null. (A property the node doesn't have keeps its
 * initializer anyway.)
 */
export function Default(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { default: true });
}

/** Loads an absent or null collection as an empty one: `[]` for an array, `{}` for an object. */
export function EmptyWhenAbsent(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { emptyWhenAbsent: true });
}

/**
 * Sorts a list relationship of a view after it is loaded, by a property path (`'name'`, or `'person.name'` into a
 * related view or relationship fragment). Nulls go last.
 */
export function SortedBy(property: string, ascending: boolean = true): PropertyDecorator {
    return (prototype: object, field: string | symbol) =>
        definePropertyMetadata(prototype, String(field), { sortedBy: { property, ascending } });
}
