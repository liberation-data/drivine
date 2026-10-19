import { WhereFn } from '@/dsl/Refs';

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

export interface PatchOptions<T = any> {
    /** Fields of the object (of a view, its root) to set, by field name. A null value clears the field. */
    set?: Record<string, any>;
    /** Fields to remove. */
    clear?: string[];
    /**
     * What must hold for the patch to be applied, read under the node's lock: a condition over the class's references
     * (on a view, it may test the view's relationships), or a Cypher predicate over the node, `n`, with its values in
     * `bindings`.
     */
    where?: string | WhereFn<T>;
    bindings?: Record<string, any>;
}
