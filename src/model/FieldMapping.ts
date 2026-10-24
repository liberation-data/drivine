import { EmptyCollectionKind } from '@/annotation/Metadata';

/**
 * How a class's plain fields are stored and loaded, beyond their names: shared by node and relationship fragments.
 */
export interface FieldMapping {
    /** Fields stored under another name, field → graph property. */
    graphProperties: Map<string, string>;
    /** Fields that are neither loaded nor saved. */
    transientFields: Set<string>;
    /** Fields stored as JSON strings. */
    jsonPacked: Set<string>;
    /** Fields that keep their initializer when the stored value is null. */
    defaults: Set<string>;
    /** Fields loaded as an empty collection when absent: field → the empty value's kind. */
    emptyWhenAbsent: Map<string, EmptyCollectionKind>;
}

/** What a load gives an `@EmptyWhenAbsent` field of the kind where the node holds no value for it, or holds null. */
export function emptyCollection(kind: EmptyCollectionKind): any[] | Set<any> | Record<string, any> {
    return kind === 'array' ? [] : kind === 'set' ? new Set() : {};
}
