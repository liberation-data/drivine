/**
 * A Cypher statement as SQL: the statement, and the values its parameters are bound to. `setup` is what runs before it,
 * on the same connection: a statement that writes is a function on Postgres, made before the statement calls it, since
 * Postgres's driver runs one statement at a time where it binds parameters.
 */
export interface CompiledCypher {
    sql: string;
    parameters: Record<string, any>;
    setup: string[];
}
