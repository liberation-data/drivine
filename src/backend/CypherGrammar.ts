import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';
import { itemName } from '@/schema/SchemaSpecs';
import { quoteString } from '@/backend/Cypher';

/** The full-text index Drivine makes over a label's properties (see fullTextIndex), by the name it gives it. */
function fullTextIndexName(label: string, properties: string[]): string {
    return itemName({ kind: 'FULLTEXT', label, properties });
}

/**
 * The most hits a full-text search asks Memgraph's `text_search` for. Memgraph 3.14 takes 100,000,000 and aborts at
 * 500,000,000; a million is far more than a search can scale in memory, and far below where the server fails.
 */
export const MEMGRAPH_TEXT_SEARCH_LIMIT_CAP = 1_000_000;

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

    /**
     * Whether a view's paths, and a cascade's patterns, match their far node without its labels, and test them after,
     * outside the match: FalkorDB 6 plans a match of several hops from a labelled far end, reading every relationship
     * of the last hop's type, whether the label is in the pattern or in its WHERE (FalkorDB/FalkorDB#3332).
     */
    readonly farLabelsAfterMatch: boolean;

    /**
     * Whether a keyset predicate constrains each key with `IS NOT NULL`: where indexes leave out null-valued nodes
     * (Neo4j), that is what lets a composite index serve the page. On Memgraph it costs the range bound.
     */
    readonly keysetNullGuard: boolean;

    /** Why the engine can't delete with CascadeType.DELETE_ORPHAN; undefined when it can. */
    readonly orphanDeleteLimit?: string;

    /**
     * Whether a read takes no snapshot, so one query can find a node's properties as different commits left them.
     * Neo4j reads under read committed without a lock: a load that runs while another writer commits can be handed
     * that writer's stamp with the data from before its write, however the query orders its reads. The checked save of
     * what `update` loaded, or a save given `from`, then compares the root's fields as loaded too, under the node's
     * lock. Memgraph reads from a snapshot, and FalkorDB runs no read beside a write.
     */
    readonly readsWithoutSnapshot?: boolean;

    /** How a vector value is written so the engine's vector index takes it: as it is, or in the engine's own type. */
    vectorValue(expression: string): string;

    /**
     * The call that asks the vector index over a label's property for `$_k` nodes nearest `$_vector`, binding each as
     * `n`, and the expression of its score as a similarity, higher nearer, on one scale on every engine: (1 + cos) / 2
     * for cosine, 1 / (1 + d²) for euclidean.
     */
    vectorSearch(label: string, property: string, similarity: 'COSINE' | 'EUCLIDEAN'): { call: string; score: string };

    /**
     * The call that asks the full-text index over a label's properties for nodes matching `$_text`, yielding `node,
     * score`. Where the engine's call takes a limit, it is asked for no more than `limit` hits, so the index stops
     * rather than yield hits the search would drop (see CypherBackend.matching).
     */
    fullTextSearch(label: string, properties: string[], limit: number): string;

    /**
     * A predicate that holds when `pattern` (e.g. `(n)-[:R]->(:T)`) matches at least once.
     */
    existenceCheck(pattern: string): string;

    /**
     * A predicate that holds when at least one match of `pattern`, which binds its far node to `node` (and its
     * relationship to `rel`, unless that is ''), meets the predicate `where` writes. `where` is given the expression the
     * relationship's properties are read through, `<it>.<property>`.
     */
    someMatch(pattern: string, node: string, rel: string, where: (relProperties: string) => string): string;

    /**
     * Whether the engine turned a statement away because another writer held what it writes, so that running it again
     * may succeed. `failure` is the driver's own error.
     */
    contended(failure: unknown): boolean;
}

/** `EXISTS { }` stops at the first match. */
const existsSubquery = (pattern: string, where?: string): string =>
    `EXISTS { MATCH ${pattern}${where ? ` WHERE ${where}` : ''} }`;

const someMatchSubquery = (
    pattern: string,
    node: string,
    rel: string,
    where: (relProperties: string) => string
): string => existsSubquery(pattern, where(rel));

/** Transient codes that are not another writer's doing: the Java driver, and so drivine4j, doesn't retry them. */
const NOT_CONTENTION = [
    'Neo.TransientError.Transaction.Terminated',
    'Neo.TransientError.Transaction.LockClientStopped'
];

/**
 * A transient error over Bolt: a deadlock on Neo4j (`Neo.TransientError.*`), a conflicting transaction on Memgraph
 * (`Memgraph.TransientError.*`).
 *
 * A lost connection (`ServiceUnavailable`, `SessionExpired`) or an expired authorization is not run again, though the
 * driver's `Neo4jError.isRetriable` calls it retriable: the save may have been applied before the connection went, and
 * a second run would find its own stamp and report a save that was applied as refused.
 */
export const transientOverBolt = (failure: unknown): boolean =>
    failure instanceof Neo4jError &&
    /^[^.]+\.TransientError\./.test(failure.code ?? '') &&
    !NOT_CONTENTION.includes(failure.code);

const plainVector = (expression: string): string => expression;

export const NEO4J_GRAMMAR: CypherGrammar = {
    engine: 'Neo4j',
    keysetNullGuard: true,
    readsWithoutSnapshot: true,
    vectorValue: plainVector,
    fullTextSearch: (label, properties, limit) =>
        `CALL db.index.fulltext.queryNodes(${quoteString(
            fullTextIndexName(label, properties)
        )}, $_text, {limit: ${limit}}) YIELD node, score`,
    // Neo4j's score is already (1 + cos) / 2, or 1 / (1 + d²).
    vectorSearch: (label, property) => ({
        call: `CALL db.index.vector.queryNodes(${quoteString(
            vectorIndexName(label, property)
        )}, $_k, $_vector) YIELD node AS n, score AS _raw`,
        score: '_raw'
    }),
    existenceCheck: existsSubquery,
    someMatch: someMatchSubquery,
    viewProjection: 'INLINE',
    farLabelsAfterMatch: false,
    contended: transientOverBolt
};

export const MEMGRAPH_GRAMMAR: CypherGrammar = {
    engine: 'Memgraph',
    keysetNullGuard: false,
    vectorValue: plainVector,
    // Without a limit, text_search yields its best 1,000 hits and no more. A limit far above the cap aborts the server,
    // however few hits there are: Memgraph allocates it up front (memgraph/memgraph#5200).
    fullTextSearch: (label, properties, limit) =>
        `CALL text_search.search_all(${quoteString(fullTextIndexName(label, properties))}, $_text, {limit: ${Math.min(
            limit,
            MEMGRAPH_TEXT_SEARCH_LIMIT_CAP
        )}}) YIELD node, score`,
    // Memgraph's similarity is the cosine itself, or already 1 / (1 + d²). Its vector search returns nodes deleted since
    // its last garbage collection, and any read of one fails ('Trying to access labels on a deleted node') until it
    // collects: FREE MEMORY forces it (memgraph/memgraph#4975).
    vectorSearch: (label, property, similarity) => ({
        call: `CALL vector_search.search(${quoteString(
            vectorIndexName(label, property)
        )}, $_k, $_vector) YIELD node AS n, similarity AS _raw`,
        score: similarity === 'COSINE' ? '(1 + _raw) / 2.0' : '_raw'
    }),
    existenceCheck: existsSubquery,
    someMatch: someMatchSubquery,
    viewProjection: 'INLINE',
    farLabelsAfterMatch: false,
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
    keysetNullGuard: false,
    // FalkorDB indexes only its own vector type: a list stored as a list is never found by a vector search.
    vectorValue: (expression: string) => `vecf32(${expression})`,
    // One full-text index to a label, found by the label. Its call takes no limit: the search cuts the hits after it.
    fullTextSearch: (label) => `CALL db.idx.fulltext.queryNodes(${quoteString(label)}, $_text) YIELD node, score`,
    // FalkorDB's score is a distance: 1 - cos, or d.
    vectorSearch: (label, property, similarity) => ({
        call: `CALL db.idx.vector.queryNodes(${quoteString(label)}, ${quoteString(
            property
        )}, $_k, vecf32($_vector)) YIELD node AS n, score AS _raw`,
        score: similarity === 'COSINE' ? '1 - _raw / 2.0' : '1.0 / (1 + _raw * _raw)'
    }),
    existenceCheck: (pattern: string) => `size([${pattern} | 1]) > 0`,
    // Not as a comprehension's WHERE: two comprehensions of one pattern, each with a WHERE, in one predicate match
    // nothing (FalkorDB/FalkorDB#3392). Nor with the relationship itself in the list: its properties, as #3386 needs.
    someMatch: (pattern, node, rel, where) => {
        if (!rel) {
            return `any(${node} IN [${pattern} | ${node}] WHERE ${where('')})`;
        }
        const it = `${node}_e`;
        return (
            `any(${it} IN [${pattern} | {node: ${node}, rel: properties(${rel})}] ` +
            `WHERE any(${node} IN [${it}.node] WHERE ${where(`${it}.rel`)}))`
        );
    },
    viewProjection: 'CALL_SUBQUERY',
    farLabelsAfterMatch: true,
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
