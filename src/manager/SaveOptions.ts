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
     * The object as it was loaded, when the object saved is a changed copy of it. The save is then checked against the
     * stamp `from` carries, whatever stamp the copy carries, as `update` checks against the stamp it loaded; and where
     * a read takes no snapshot (Neo4j), against each field of `from`'s root too: a load there can be handed another
     * writer's stamp with the data from before its write, and a save checked by the stamp alone would write over that
     * writer's change. Refused before anything is written when it is the object saved itself, is of another class,
     * has another id, or carries no stamp. A copy may share an unchanged root with it, but don't change that root in
     * place: `from`'s fields are what the node is compared with. `save` takes it; `saveAll` refuses it.
     */
    from?: T;
    /**
     * Internal: the root's properties, read first under CLEAR to remove property-bag entries a map no longer has and
     * labels a @NodeLabels field no longer holds.
     */
    heldProperties?: Record<string, any>;
    /**
     * Internal: the root as `update` loaded it, before its change ran, or as `from` holds it. Where a read takes no
     * snapshot (Neo4j), the checked save compares the node with it under the node's lock, as well as the stamp: the
     * stamp a load was handed may be newer than the data it read.
     */
    loaded?: any;
    /**
     * Internal: the root's properties as `update`'s load read them, or the packed ones the load of `from` read, by
     * stored name. A @JsonPacked field is compared as the text the node held, not as its value written again: text
     * another writer wrote with other spacing would differ. Without it, as a save packs the value.
     */
    loadedProperties?: Record<string, any>;
}
