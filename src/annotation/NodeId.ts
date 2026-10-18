import { definePropertyMetadata } from '@/annotation/Metadata';

/**
 * Marks the property of a node fragment that identifies the node.
 */
export function NodeId(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { nodeId: true });
}
