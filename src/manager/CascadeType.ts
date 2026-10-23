/**
 * What deleting a view by id deletes besides its root. A cascade follows only the relationships a save of the view
 * writes: it leaves the nodes of a read-only field (one marked @ReadOnly, a @GraphPath, or a list of fragments read
 * over several hops), and follows each level of a view that contains itself.
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
