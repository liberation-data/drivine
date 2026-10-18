import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { isRetriableError } from 'neo4j-driver';

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
const transientOverBolt = (failure: unknown): boolean => failure instanceof Error && isRetriableError(failure);

export const NEO4J_GRAMMAR: CypherGrammar = {
    engine: 'Neo4j',
    existenceCheck: existsSubquery,
    viewProjection: 'INLINE',
    contended: transientOverBolt
};

export const MEMGRAPH_GRAMMAR: CypherGrammar = {
    engine: 'Memgraph',
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
    existenceCheck: (pattern: string) => `size([${pattern} | 1]) > 0`,
    viewProjection: 'CALL_SUBQUERY',
    // FalkorDB runs one write at a time, so a write is never turned away by another.
    contended: () => false
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
