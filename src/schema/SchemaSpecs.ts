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

/**
 * A vector index over a property of a label's nodes, holding embeddings of a fixed number of dimensions. The HNSW pins
 * are portable: HNSW is the same algorithm on Neo4j and FalkorDB. Unpinned, the engine chooses, and Drivine never
 * substitutes a default of its own. What only one engine has goes in `engineOptions`, each read by its engine alone.
 */
export interface VectorIndexSpec {
    kind: 'VECTOR';
    label: string;
    properties: [string];
    dimensions: number;
    similarity: SimilarityFunction;
    /** Memgraph only: how many vectors the index is first made to hold. */
    capacity?: number;
    /** HNSW's `m`, the links per node. */
    hnswM?: number;
    /** HNSW's `ef_construction`, the candidates weighed while building. */
    hnswEfConstruction?: number;
    engineOptions?: EngineVectorOptions[];
}

/** Neo4j's own vector index options. An `hnswM` / `hnswEfConstruction` here wins over the portable one on Neo4j. */
export interface Neo4jVectorOptions {
    engine: 'Neo4j';
    /** Pins `vector.quantization.enabled`: quantization trades recall (and exact scores) for memory. */
    quantizationEnabled?: boolean;
    hnswM?: number;
    hnswEfConstruction?: number;
}

/** FalkorDB's own vector index options. An `hnswM` / `hnswEfConstruction` here wins over the portable one on FalkorDB. */
export interface FalkorDbVectorOptions {
    engine: 'FalkorDB';
    /** The candidates weighed per search. */
    efRuntime?: number;
    hnswM?: number;
    hnswEfConstruction?: number;
}

/** Physical options of one engine's vector index: typed data, never DDL. */
export type EngineVectorOptions = Neo4jVectorOptions | FalkorDbVectorOptions;

export function neo4jVectorOptions(options: Omit<Neo4jVectorOptions, 'engine'>): Neo4jVectorOptions {
    positive(options.hnswM, 'Neo4jVectorOptions.hnswM');
    positive(options.hnswEfConstruction, 'Neo4jVectorOptions.hnswEfConstruction');
    return { engine: 'Neo4j', ...options };
}

export function falkorDbVectorOptions(options: Omit<FalkorDbVectorOptions, 'engine'>): FalkorDbVectorOptions {
    positive(options.efRuntime, 'FalkorDbVectorOptions.efRuntime');
    positive(options.hnswM, 'FalkorDbVectorOptions.hnswM');
    positive(options.hnswEfConstruction, 'FalkorDbVectorOptions.hnswEfConstruction');
    return { engine: 'FalkorDB', ...options };
}

/** What a vector index pins on one engine: the portable pins, overridden by that engine's own options. */
export interface VectorTuning {
    hnswM?: number;
    hnswEfConstruction?: number;
    quantizationEnabled?: boolean;
    efRuntime?: number;
}

export function vectorTuning(spec: VectorIndexSpec, engine: string): VectorTuning {
    const own: VectorTuning = { ...spec.engineOptions?.find((it) => it.engine === engine) };
    return {
        hnswM: own.hnswM ?? spec.hnswM,
        hnswEfConstruction: own.hnswEfConstruction ?? spec.hnswEfConstruction,
        quantizationEnabled: own.quantizationEnabled,
        efRuntime: own.efRuntime
    };
}

function positive(value: number | undefined, what: string): void {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
        throw new Error(`${what} is a whole number of at least 1, not ${value}.`);
    }
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
    similarity: SimilarityFunction = 'COSINE',
    tuning: { hnswM?: number; hnswEfConstruction?: number; engineOptions?: EngineVectorOptions[] } = {}
): VectorIndexSpec {
    if (!Number.isInteger(dimensions) || dimensions < 1) {
        throw new Error(`A vector index needs a whole number of dimensions, not ${dimensions}.`);
    }
    positive(tuning.hnswM, 'hnswM');
    positive(tuning.hnswEfConstruction, 'hnswEfConstruction');
    const spec: VectorIndexSpec = { kind: 'VECTOR', label, properties: [property], dimensions, similarity };
    if (tuning.hnswM !== undefined) {
        spec.hnswM = tuning.hnswM;
    }
    if (tuning.hnswEfConstruction !== undefined) {
        spec.hnswEfConstruction = tuning.hnswEfConstruction;
    }
    if (tuning.engineOptions?.length) {
        spec.engineOptions = tuning.engineOptions;
    }
    return spec;
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

/** The shape of a vector or full-text index, as an engine reports it. */
export interface SchemaItemShape extends VectorTuning {
    properties: string[];
    dimensions?: number;
    similarity?: SimilarityFunction;
}

/**
 * The name Drivine gives an item on an engine that names them: drivine4j's default, `<label>_<properties>_<kind>`, so
 * that a store written from the JVM and from Node holds one item, not two.
 */
export function itemName(spec: IndexSpec | UniquenessConstraintSpec): string {
    const suffix = { RANGE: 'range', UNIQUE: 'unique', VECTOR: 'vector', FULLTEXT: 'fulltext' }[spec.kind];
    return `${spec.label}_${spec.properties.join('_')}_${suffix}`;
}
