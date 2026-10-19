import { definePropertyMetadata } from '@/annotation/Metadata';

/**
 * Marks the property of a node fragment that holds the node's stamp, for optimistic locking: a save of an object
 * whose stamp is no longer the node's is refused with StaleObjectException. The property is a string, or undefined
 * for an object that has not been loaded or saved. Treat its value as opaque.
 */
export function NodeStamp(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { nodeStamp: true });
}
