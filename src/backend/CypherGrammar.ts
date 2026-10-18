import { DatabaseType } from '@/connection/DatabaseType';
import { DrivineError } from '@/DrivineError';

/**
 * Where an engine's Cypher differs from another's. Each difference is added here as the statements that meet it are
 * written, rather than ahead of them.
 */
export interface CypherGrammar {
    readonly engine: string;
}

export const NEO4J_GRAMMAR: CypherGrammar = { engine: 'Neo4j' };
export const MEMGRAPH_GRAMMAR: CypherGrammar = { engine: 'Memgraph' };
export const FALKORDB_GRAMMAR: CypherGrammar = { engine: 'FalkorDB' };

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
