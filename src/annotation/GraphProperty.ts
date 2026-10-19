import { definePropertyMetadata } from '@/annotation/Metadata';

/**
 * Stores the property under another name in the graph.
 */
export function GraphProperty(name: string): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { graphProperty: name });
}
