/**
 * How a null field is treated when an object is saved. It governs the object's own fields, and for a view its root's;
 * a node reached through a relationship is always written as under IGNORE.
 */
export enum NullPolicy {
    /** The default. Only fields that are not null are written; a null or undefined field leaves the stored value. */
    IGNORE = 'IGNORE',
    /**
     * The object is authoritative: a field that is null or undefined clears the stored property. Only fields the
     * object holds as its own keys can be seen: a declared field that was never assigned is not one, at runtime.
     */
    CLEAR = 'CLEAR'
}
