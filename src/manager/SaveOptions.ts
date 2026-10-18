/**
 * What a save with `replace` does with a target whose relationship it removed.
 */
export enum RemovedTargets {
    /** Keep it. Only the relationship goes. */
    KEEP = 'KEEP',
    /**
     * Delete it, with its other relationships, if nothing else refers to it the way the field did: for an outgoing
     * field, no relationship points at it; for an incoming one, it points at nothing; for an undirected one, it has no
     * relationship left. The root, and any node the saved object still holds, is never deleted.
     */
    DELETE_UNREFERENCED = 'DELETE_UNREFERENCED'
}

export interface SaveOptions<T> {
    /**
     * Relationship fields of the view whose value is the whole of the relationship: what the store holds and the
     * field does not is removed. Without it, a save only adds. An empty list removes every relationship of the field;
     * a single-valued field that is null or undefined removes its relationship. A list field to replace must not be
     * null or undefined.
     */
    replace?: (keyof T & string)[];
    /** What becomes of a target whose relationship `replace` removed. Defaults to KEEP. */
    removedTargets?: RemovedTargets;
}
