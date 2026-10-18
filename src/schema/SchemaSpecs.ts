/** A range index over one or more properties of a label's nodes. */
export interface RangeIndexSpec {
    kind: 'RANGE';
    label: string;
    properties: string[];
}

/** A constraint that no two of a label's nodes hold the same values of the properties. */
export interface UniquenessConstraintSpec {
    kind: 'UNIQUE';
    label: string;
    properties: string[];
}

export type SimilarityFunction = 'COSINE' | 'EUCLIDEAN';

/** A vector index over a property of a label's nodes, holding embeddings of a fixed number of dimensions. */
export interface VectorIndexSpec {
    kind: 'VECTOR';
    label: string;
    properties: [string];
    dimensions: number;
    similarity: SimilarityFunction;
    /** Memgraph only: how many vectors the index is first made to hold. */
    capacity?: number;
}

/** A full-text index over one or more text properties of a label's nodes. */
export interface FullTextIndexSpec {
    kind: 'FULLTEXT';
    label: string;
    properties: string[];
}

export type IndexSpec = RangeIndexSpec | VectorIndexSpec | FullTextIndexSpec;

export function vectorIndex(
    label: string,
    property: string,
    dimensions: number,
    similarity: SimilarityFunction = 'COSINE'
): VectorIndexSpec {
    if (!Number.isInteger(dimensions) || dimensions < 1) {
        throw new Error(`A vector index needs a whole number of dimensions, not ${dimensions}.`);
    }
    return { kind: 'VECTOR', label, properties: [property], dimensions, similarity };
}

export function fullTextIndex(label: string, properties: string | string[]): FullTextIndexSpec {
    return { kind: 'FULLTEXT', label, properties: [properties].flat() };
}

export function rangeIndex(label: string, properties: string | string[]): RangeIndexSpec {
    return { kind: 'RANGE', label, properties: [properties].flat() };
}

export function uniquenessConstraint(label: string, properties: string | string[]): UniquenessConstraintSpec {
    return { kind: 'UNIQUE', label, properties: [properties].flat() };
}

/**
 * CREATED: nothing was there, and the item was made. ALREADY_MATCHING: a matching item is there; nothing changed.
 * DRIFT: an item is there with another shape (a vector index's dimensions or similarity, a full-text index's
 * properties); nothing changed, and `recreate` replaces it. VIOLATION: a constraint the data already breaks; nothing
 * was made. RECREATED: from `recreate`.
 */
export type EnsureStatus = 'CREATED' | 'ALREADY_MATCHING' | 'DRIFT' | 'VIOLATION' | 'RECREATED';

export interface EnsureResult<S> {
    status: EnsureStatus;
    spec: S;
    /** For a VIOLATION: a sample of the values more than one node holds. */
    sample?: unknown[];
    /** For a DRIFT: what the engine holds. */
    found?: SchemaItemShape;
}

/** The name Drivine gives an item on an engine that names them. */
/** The shape of a vector or full-text index, as an engine reports it. */
export interface SchemaItemShape {
    properties: string[];
    dimensions?: number;
    similarity?: SimilarityFunction;
}

export function itemName(spec: IndexSpec | UniquenessConstraintSpec): string {
    const clean = (it: string): string => it.replace(/[^A-Za-z0-9]/g, '_');
    return `drivine_${spec.kind.toLowerCase()}_${clean(spec.label)}_${spec.properties.map(clean).join('_')}`;
}
