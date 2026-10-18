import { ClassThunk, Direction, definePropertyMetadata } from '@/annotation/Metadata';

/** One hop of a path: a relationship type, its direction, and optionally the label of the node it reaches. */
export interface Hop {
    type: string;
    /** Defaults to OUTGOING. */
    direction?: Direction;
    /** A label the node this hop reaches must carry. */
    label?: string;
}

export function hop(type: string, direction: Direction = Direction.OUTGOING, label?: string): Hop {
    return { type, direction, label };
}

export interface GraphPathOptions {
    /** The class of the final node, a node fragment. Required for a list; a single defaults to the declared type. */
    target?: ClassThunk;
    /** Whether a root without the path is left out. Defaults to false. */
    required?: boolean;
}

/**
 * A field of a view holding the nodes at the far end of a fixed list of hops from the root, each node once, skipping
 * the nodes in between. A list holds them all, a single the first. Read-only: to write along a path, use
 * `edges.relate`, Cypher, or a view rooted where the hop starts.
 */
export function GraphPath(hops: Hop[], options: GraphPathOptions = {}): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { path: { hops, ...options } });
}
