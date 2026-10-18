import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { itemName } from '@/schema/SchemaSpecs';

/** The full-text index Drivine makes over a label's properties (see fullTextIndex), by the name it gives it. */
function fullTextIndexName(label: string, properties: string[]): string {
    return itemName({ kind: 'FULLTEXT', label, properties });
}

/** The vector index Drivine makes over a label's property (see vectorIndex), by the name it gives it. */
function vectorIndexName(label: string, property: string): string {
    return itemName({ kind: 'VECTOR', label, properties: [property], dimensions: 1, similarity: 'COSINE' });
}
import { Neo4jError } from 'neo4j-driver';

/**
 * Where an engine's Cypher differs from another's. Each difference is added here as the statements that meet it are
 * written, rather than ahead of them.
 */
export interface CypherGrammar {
    readonly engine: string;

    /**
     * How a view's relationships are projected: INLINE, as pattern comprehensions within the RETURN, or
     * CALL_SUBQUERY, each in a `CALL { }` of its own before the RETURN.
     */
    readonly viewProjection: 'INLINE' | 'CALL_SUBQUERY';

    /** Why the engine can't delete with CascadeType.DELETE_ORPHAN; undefined when it can. */
    readonly orphanDeleteLimit?: string;

    /** How a vector value is written so the engine's vector index takes it: as it is, or in the engine's own type. */
    vectorValue(expression: string): string;

    /**
     * The call that asks the vector index over a label's property for `$_k` nodes nearest `$_vector`, binding each as
     * `n`, and the expression of its score as a similarity, higher nearer, on one scale on every engine: (1 + cos) / 2
     * for cosine, 1 / (1 + d²) for euclidean.
     */
    vectorSearch(label: string, property: string, similarity: 'COSINE' | 'EUCLIDEAN'): { call: string; score: string };

    /** The call that asks the full-text index over a label's properties for nodes matching `$_text`, yielding `node, score`. */
    fullTextSearch(label: string, properties: string[]): string;

    /**
     * A predicate that holds when `pattern` (e.g. `(n)-[:R]->(:T)`) matches at least once.
     */
    existenceCheck(pattern: string): string;

    /**
     * Whether the engine turned a statement away because another writer held what it writes, so that running it again
     * may succeed. `failure` is the driver's own error.
     */
    contended(failure: unknown): boolean;
}

/** `EXISTS { }` stops at the first match. */
const existsSubquery = (pattern: string): string => `EXISTS { MATCH ${pattern} }`;

/** A transient error over Bolt: a deadlock on Neo4j, a conflicting transaction on Memgraph. */
const transientOverBolt = (failure: unknown): boolean =>
    failure instanceof Neo4jError && Neo4jError.isRetriable(failure);

const plainVector = (expression: string): string => expression;

export const NEO4J_GRAMMAR: CypherGrammar = {
    engine: 'Neo4j',
    vectorValue: plainVector,
    fullTextSearch: (label, properties) =>
        `CALL db.index.fulltext.queryNodes('${fullTextIndexName(label, properties)}', $_text) YIELD node, score`,
    // Neo4j's score is already (1 + cos) / 2, or 1 / (1 + d²).
    vectorSearch: (label, property) => ({
        call: `CALL db.index.vector.queryNodes('${vectorIndexName(
            label,
            property
        )}', $_k, $_vector) YIELD node AS n, score AS _raw`,
        score: '_raw'
    }),
    existenceCheck: existsSubquery,
    viewProjection: 'INLINE',
    contended: transientOverBolt
};

export const MEMGRAPH_GRAMMAR: CypherGrammar = {
    engine: 'Memgraph',
    vectorValue: plainVector,
    fullTextSearch: (label, properties) =>
        `CALL text_search.search_all('${fullTextIndexName(label, properties)}', $_text) YIELD node, score`,
    // Memgraph's similarity is the cosine itself, or already 1 / (1 + d²). Its vector search returns nodes deleted since
    // its last garbage collection, and any read of one fails ('Trying to access labels on a deleted node') until it
    // collects: FREE MEMORY forces it.
    vectorSearch: (label, property, similarity) => ({
        call: `CALL vector_search.search('${vectorIndexName(
            label,
            property
        )}', $_k, $_vector) YIELD node AS n, similarity AS _raw`,
        score: similarity === 'COSINE' ? '(1 + _raw) / 2.0' : '_raw'
    }),
    existenceCheck: existsSubquery,
    viewProjection: 'INLINE',
    contended: transientOverBolt,
    orphanDeleteLimit: 'Memgraph takes an existence check only in a WHERE clause, not in the list of nodes to delete'
};

/**
 * FalkorDB takes neither `EXISTS { }` nor a pattern in `exists()`.
 *
 * Its views are projected with CALL subqueries. On FalkorDB 6.0 a pattern comprehension that names its relationship
 * (`[(n)-[r:R]->(m) | properties(r)]`), as a relationship fragment must, leaves every later comprehension in the same
 * projection empty, without an error (FalkorDB/FalkorDB#3386, also on edge-rs).
 */
export const FALKORDB_GRAMMAR: CypherGrammar = {
    engine: 'FalkorDB',
    // FalkorDB indexes only its own vector type: a list stored as a list is never found by a vector search.
    vectorValue: (expression: string) => `vecf32(${expression})`,
    // One full-text index to a label, found by the label.
    fullTextSearch: (label) => `CALL db.idx.fulltext.queryNodes('${label}', $_text) YIELD node, score`,
    // FalkorDB's score is a distance: 1 - cos, or d.
    vectorSearch: (label, property, similarity) => ({
        call: `CALL db.idx.vector.queryNodes('${label}', '${property}', $_k, vecf32($_vector)) YIELD node AS n, score AS _raw`,
        score: similarity === 'COSINE' ? '1 - _raw / 2.0' : '1.0 / (1 + _raw * _raw)'
    }),
    existenceCheck: (pattern: string) => `size([${pattern} | 1]) > 0`,
    viewProjection: 'CALL_SUBQUERY',
    // FalkorDB runs one query at a time, but turns a write away while another is in progress, as its constraint
    // commands do under load.
    contended: (failure: unknown) => failure instanceof Error && /another write is in progress/i.test(failure.message)
};

export function cypherGrammarFor(type: DatabaseType): CypherGrammar {
    switch (type) {
        case DatabaseType.NEO4J:
            return NEO4J_GRAMMAR;
        case DatabaseType.MEMGRAPH:
            return MEMGRAPH_GRAMMAR;
        case DatabaseType.FALKORDB:
            return FALKORDB_GRAMMAR;
        default:
            throw new DrivineError(`${type} does not have a Cypher grammar for the object manager.`);
    }
}
