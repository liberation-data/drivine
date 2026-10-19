import { definePropertyMetadata } from '@/annotation/Metadata';

/**
 * A property that is neither loaded nor saved.
 */
export function GraphTransient(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { transient: true });
}
