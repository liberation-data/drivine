/**
 * How a compiled statement that writes on Oracle hands back its rows, a PL/SQL block's implicit result: `'one'`, in one
 * row whose column `rows:json` holds every row as a JSON array, as the shared compiler writes it when asked for
 * `oracleRowsAsText` (see SharedCypherCompiler); `'each'`, a row for each, its value in the column `RESULT`, as it
 * writes it otherwise. A connection reads the shape the statement says it has, and never guesses it from a column's
 * name: a user's own block may name a column either (liberation-data/drivine#673).
 */
export type CompiledRows = 'one' | 'each';

/**
 * A Cypher statement as SQL: the statement, and the values its parameters are bound to. `setup` is what runs before it,
 * on the same connection: a statement that writes is a function on Postgres, made before the statement calls it, since
 * Postgres's driver runs one statement at a time where it binds parameters.
 */
export interface CompiledCypher {
    sql: string;
    parameters: Record<string, any>;
    setup: string[];
    /** How its rows come back where it writes on Oracle: see {@link CompiledRows}. */
    rows: CompiledRows;
    /**
     * Whether it was given NaN or an infinity, and its rows may hold numbers that stand for them, as the shared
     * compiler writes them on Postgres (see PostgresNonFinite).
     */
    nonFinite: boolean;
}
