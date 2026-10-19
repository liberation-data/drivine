import { ClassThunk, definePropertyMetadata } from '@/annotation/Metadata';

/**
 * Marks the property of a relationship fragment that holds the node the relationship leads to.
 *
 * drivine4j finds this property by its type; TypeScript keeps too little type information at runtime to do so.
 * @param target the node's class (a node fragment or a view). Defaults to the property's declared type.
 */
export function TargetNode(target?: ClassThunk): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { targetNode: { target } });
}
