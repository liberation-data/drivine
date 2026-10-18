/** A search hit and its score: a similarity, higher nearer, on one scale on every engine. */
export interface Scored<T> {
    value: T;
    score: number;
}

export interface NearestOptions {
    /** How many to return. Without `searchK`, also how many the index is asked for. */
    topK: number;
    /**
     * How many the index is asked for, at least `topK`: on Lucene-backed engines the result queue is the search's
     * beam, so a wider one finds true neighbours a narrow one misses, and a filter thins it less. `topK` then trims
     * after the filter.
     */
    searchK?: number;
    /** The least score a hit may have. */
    threshold?: number;
    /** A Cypher predicate over the node, `n`, applied after the search. Values go in `bindings`. */
    where?: string;
    bindings?: Record<string, any>;
    /** The @VectorIndex field searched: needed only when the fragment declares more than one. */
    property?: string;
    /** Search the index of this label instead of the fragment's first: one vector index per partition. */
    partitionLabel?: string;
    /** maxDepth overrides for a view, by relationship field name. */
    depth?: Record<string, number>;
}
