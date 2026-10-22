/**
 * What deleting a view by id deletes besides its root.
 */
export enum CascadeType {
    /** The root only. Its relationships are removed; the nodes they led to stay. */
    NONE = 'NONE',
    /**
     * The root, and each node the view reaches that nothing outside the view still needs: one is kept when a node
     * outside the view refers to it, or when the view holds it below a kept one. A kept message keeps its attachments,
     * while the session that held it is still deleted. Not available on Memgraph.
     */
    DELETE_ORPHAN = 'DELETE_ORPHAN',
    /** The root, and every node the view reaches, whatever else still points at it. */
    DELETE_ALL = 'DELETE_ALL'
}
