/**
 * What deleting a view by id deletes besides its root.
 */
export enum CascadeType {
    /** The root only. Its relationships are removed; the nodes they led to stay. */
    NONE = 'NONE',
    /** The root, and each node the view reaches that is left with no relationship at all. */
    DELETE_ORPHAN = 'DELETE_ORPHAN',
    /** The root, and every node the view reaches, whatever else still points at it. */
    DELETE_ALL = 'DELETE_ALL'
}
