/**
 * What a patch did to one node. A patch holds nothing afterwards, so it hands back no stamp.
 */
export interface PatchResult {
    /** A node with the id was there. A patch never makes one. */
    found: boolean;
    /** The patch's condition held, so its fields were written. Without a condition, the same as `found`. */
    applied: boolean;
    /** A value written differed from what the node held, so the node has a new stamp. */
    changed: boolean;
}

export interface PatchOptions {
    /** Fields of the object (of a view, its root) to set, by field name. A null value clears the field. */
    set?: Record<string, any>;
    /** Fields to remove. */
    clear?: string[];
    /**
     * A Cypher predicate over the node, `n`, that must hold for the patch to be applied: read under the node's lock.
     * On a view it may name the view's relationships, as a pattern from `n`. Values go in `bindings`.
     */
    where?: string;
    bindings?: Record<string, any>;
}
