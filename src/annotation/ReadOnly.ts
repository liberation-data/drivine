import { definePropertyMetadata } from '@/annotation/Metadata';

/**
 * A relationship field of a view that is loaded and never written: a save writes no relationship for it and doesn't
 * save the nodes it holds, naming it in `replace` is refused, and a cascading delete leaves those nodes. A list of
 * fragments read over several hops (maxDepth above 1) is read-only whether or not it is marked so.
 */
export function ReadOnly(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { readOnly: true });
}
