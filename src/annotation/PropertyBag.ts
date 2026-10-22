import { definePropertyMetadata } from '@/annotation/Metadata';

export interface PropertyBagOptions {
    /** The graph namespace of the entries. Defaults to the field's name. */
    prefix?: string;
    /** Between prefix and key. Defaults to '.'. */
    delimiter?: string;
    /**
     * No prefix: each entry is stored under its bare key, and the bag reads back every property that no other field
     * or bag accounts for. One to a fragment. A field the bag should not take must be decorated or have an initializer:
     * TypeScript keeps no list of a class's other fields. A save refuses an entry whose key another field, the id,
     * another bag or the stamp is stored under.
     */
    flat?: boolean;
}

/**
 * Maps an object field of a node fragment to a set of node properties, one per entry, stored as
 * `<prefix><delimiter><key>`: real properties, visible and indexable, unlike @JsonPacked's one JSON string. Values
 * must be storable: a string, number, boolean or Date, or an array of them.
 *
 * Under NullPolicy.CLEAR a save removes the entries the map no longer has; under IGNORE, the default, it leaves them.
 */
export function PropertyBag(options: PropertyBagOptions = {}): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { propertyBag: options });
}
