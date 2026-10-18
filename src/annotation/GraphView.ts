import { ClassKind, defineClassMetadata } from '@/annotation/Metadata';

/**
 * Composes a root fragment, marked {@link Root}, and its relationships, marked {@link GraphRelationship}, into one
 * object loaded by one query.
 */
export function GraphView(): ClassDecorator {
    return (target: Function) => defineClassMetadata(target, { kind: ClassKind.GRAPH_VIEW });
}
