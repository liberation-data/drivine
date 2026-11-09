/**
 * How a compiled statement that writes on Oracle hands back its rows, a PL/SQL block's implicit result: `'one'`, in one
 * row whose column `rows:json` holds every row as a JSON array, as Drivine's own compiler writes it
 * (see OracleCypherCompiler.returnRows); `'each'`, a row for each, its value in the column `RESULT`, as drivine4j's
 * compiler writes it. A connection reads the shape the statement says it has, and never guesses it from a column's name:
 * a user's own block may name a column either (liberation-data/drivine#673).
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
    /** How its rows come back where it writes on Oracle: see {@link CompiledRows}. Drivine's own compilers say `'one'`. */
    rows: CompiledRows;
    /**
     * Whether it was given NaN or an infinity, and its rows may hold numbers that stand for them, as drivine4j's compiler
     * writes them on Postgres (see PostgresNonFinite). Drivine's own compilers say `false`: they bind neither (#344).
     */
    nonFinite: boolean;
}
