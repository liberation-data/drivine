import { ClassThunk, definePropertyMetadata } from '@/annotation/Metadata';

/**
 * Marks the property of a view that holds its root fragment, the node the view's query starts from.
 * @param target the fragment's class. Defaults to the property's declared type.
 */
export function Root(target?: ClassThunk): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { root: { target } });
}
