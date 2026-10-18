import { ClassKind, defineClassMetadata } from '@/annotation/Metadata';

/**
 * Maps a class to a relationship and the node it leads to: its properties are the relationship's, and the property
 * marked {@link TargetNode} holds the node.
 */
export function RelationshipFragment(): ClassDecorator {
    return (target: Function) => defineClassMetadata(target, { kind: ClassKind.RELATIONSHIP_FRAGMENT });
}
