import { ClassThunk, Direction, definePropertyMetadata } from '@/annotation/Metadata';

/**
 * One hop of a path: a relationship type, its direction, and optionally the label of the node it reaches and a property
 * of that node to read the path in the order of.
 */
export interface Hop {
    type: string;
    /** Defaults to OUTGOING. */
    direction?: Direction;
    /** A label the node this hop reaches must carry. */
    label?: string;
    /**
     * A property of the node this hop reaches, to read the path in its order: a list holds its targets in the order of
     * the first node of this hop that leads to each, and a single holds the one the first such node leads to. One hop
     * of a path may name one, and a path a group key is read by may name none. A node without the property comes last
     * whichever way the path is read, and targets whose first nodes hold equal values come in no set order. The
     * property should hold values of one type. A text of digits is ordered as text. Where some nodes hold a text and
     * others a number, every backend reads every text before every number lowest first, and after them highest first.
     */
    orderBy?: string;
    /** Whether `orderBy` reads lowest first. Defaults to true. */
    ascending?: boolean;
}

/** A hop of a path, read in the order of `orderBy` where it is given: lowest first unless `ascending` is false. */
export function hop(
    type: string,
    direction: Direction = Direction.OUTGOING,
    label?: string,
    orderBy?: string,
    ascending: boolean = true
): Hop {
    return { type, direction, label, orderBy, ascending };
}

export interface GraphPathOptions {
    /** The class of the final node, a node fragment. Required for a list; a single defaults to the declared type. */
    target?: ClassThunk;
    /** Whether a root without the path is left out. Defaults to false. */
    required?: boolean;
}

/**
 * A field of a view holding the nodes at the far end of a fixed list of hops from the root, each node once, skipping
 * the nodes in between. A list holds them all, a single the first: in the order one hop names, where one does (see
 * `Hop.orderBy`). Read-only: to write along a path, use `edges.relate`, Cypher, or a view rooted where the hop starts.
 */
export function GraphPath(hops: Hop[], options: GraphPathOptions = {}): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { path: { hops, ...options } });
}
