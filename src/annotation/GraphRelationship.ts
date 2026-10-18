import { definePropertyMetadata, RelationshipOptions } from '@/annotation/Metadata';

/**
 * Marks the property of a view that holds what the root is related to.
 */
export function GraphRelationship(options: RelationshipOptions): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { relationship: options });
}
