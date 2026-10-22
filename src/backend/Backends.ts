import { DatabaseType } from '@/connection/DatabaseType';
import { GraphBackend } from '@/backend/GraphBackend';
import { CypherBackend } from '@/backend/CypherBackend';
import { cypherGrammarFor } from '@/backend/CypherGrammar';
import { OracleBackend } from '@/backend/oracle/OracleBackend';
import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { PostgresBackend } from '@/backend/postgres/PostgresBackend';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';

/**
 * The backend for a database: SQL/PGQ on Oracle and SQL on Postgres, each over the named graph (`drivine` unless named);
 * Cypher elsewhere.
 */
export function backendFor(type: DatabaseType, graphName?: string): GraphBackend {
    switch (type) {
        case DatabaseType.ORACLE:
            return new OracleBackend(new OracleGraph(graphName));
        case DatabaseType.POSTGRES:
            return new PostgresBackend(new PostgresGraph(graphName));
        default:
            return new CypherBackend(cypherGrammarFor(type));
    }
}
