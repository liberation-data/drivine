import { ClassKind, defineClassMetadata } from '@/annotation/Metadata';

export interface NodeFragmentOptions {
    /** The node's labels. A subclass's labels are added to those of its superclasses. */
    labels?: string[];
    /**
     * Whether the @NodeId field is given a range index under the primary label when the class is read into a catalog
     * (`SchemaCatalog.fromFragments`), unless an item declared serves it. Defaults to true: each save and each load by id
     * finds its node by that property, and without an index reads every node of the label. `false` leaves the index to
     * be declared, or gone without. Of this class alone: a subclass is given the index unless it says so too.
     */
    nodeIdIndex?: boolean;
}

/**
 * Maps a class to a node: its properties are the node's properties.
 */
export function NodeFragment(options: NodeFragmentOptions = {}): ClassDecorator {
    return (target: Function) =>
        defineClassMetadata(target, {
            kind: ClassKind.NODE_FRAGMENT,
            labels: options.labels,
            ...(options.nodeIdIndex === false ? { nodeIdIndex: false } : {})
        });
}
