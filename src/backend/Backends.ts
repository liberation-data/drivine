import { DatabaseType } from '@/connection/DatabaseType';
import { GraphBackend } from '@/backend/GraphBackend';
import { CypherBackend } from '@/backend/CypherBackend';
import { cypherGrammarFor } from '@/backend/CypherGrammar';
import { OracleBackend } from '@/backend/oracle/OracleBackend';
import { OracleGraph } from '@/backend/oracle/OracleGraph';

/** The backend for a database: SQL/PGQ on Oracle, over its default graph; Cypher on the graph engines. */
export function backendFor(type: DatabaseType): GraphBackend {
    return type === DatabaseType.ORACLE
        ? new OracleBackend(new OracleGraph())
        : new CypherBackend(cypherGrammarFor(type));
}
