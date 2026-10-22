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

import { NullPolicy } from '@/manager/NullPolicy';

export interface SaveOptions<T> {
    /**
     * Relationship fields of the view whose value is the whole of the relationship: what the store holds and the
     * field does not is removed. Without it, a save only adds. An empty list removes every relationship of the field;
     * a single-valued field that is null or undefined removes its relationship. A list field to replace must not be
     * null or undefined.
     *
     * 'all' replaces every relationship field of the view itself. It is refused for an object whose root carries no
     * stamp. The lists of a view nested in the one saved only add.
     */
    replace?: (keyof T & string)[] | 'all';
    /** What becomes of a target whose relationship `replace` removed. Defaults to KEEP. */
    removedTargets?: RemovedTargets;
    /** How null fields of the object (of a view, its root) are written. Defaults to IGNORE. */
    nullPolicy?: NullPolicy;
    /**
     * Fields of the object (of a view, its root) to write; every other field of the node is left as the store has it.
     * A view's relationships are written whatever it names. Not the id or the stamp. Give `only` or `except`, not both.
     */
    only?: string[];
    /** Fields of the object (of a view, its root) not to write. Give `only` or `except`, not both. */
    except?: string[];
    /**
     * Internal: the root's properties, read first under CLEAR to remove property-bag entries a map no longer has and
     * labels a @NodeLabels field no longer holds.
     */
    heldProperties?: Record<string, any>;
    /**
     * Internal: the root as `update` loaded it, before its change ran. Where a read takes no snapshot (Neo4j), the
     * checked save compares the node with it under the node's lock, as well as the stamp: the stamp a load was handed
     * may be newer than the data it read.
     */
    loaded?: any;
}
