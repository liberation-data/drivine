import { ClassKind, defineClassMetadata } from '@/annotation/Metadata';

export interface NodeFragmentOptions {
    /** The node's labels. A subclass's labels are added to those of its superclasses. */
    labels?: string[];
}

/**
 * Maps a class to a node: its properties are the node's properties.
 */
export function NodeFragment(options: NodeFragmentOptions = {}): ClassDecorator {
    return (target: Function) => defineClassMetadata(target, { kind: ClassKind.NODE_FRAGMENT, labels: options.labels });
}
