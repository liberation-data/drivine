// The playground's engine: Drivine for TypeScript in the page, on SQLite's wasm build, with Cypher compiled to SQL by
// the shared compiler's Wasm build. Bundled with both by scripts/bundle-playground.mjs, which puts their .wasm files
// beside the bundle, where each looks for its own.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { compile } from '@liberation-data/drivine-cypher-compiler';
import {
    DatabaseType,
    NonTransactionalPersistenceManager,
    QuerySpecification,
    SharedCypherCompiler,
    SqliteConnectionProvider,
    cypherStatement,
    useCypherCompiler,
    useSqliteDriver,
    wasmSqliteDriver
} from '../../../src/browser';
import { MOVIES } from './movies';
import { returnedColumns } from './columns';

export { EXAMPLES } from './movies';

/** The graph's name: its tables are `movies_node` and `movies_edge`. */
const GRAPH = 'movies';

/**
 * What a statement gave: its rows, each a map of its columns, or why it was refused or failed, with the SQL it compiled
 * to where it compiled.
 */
export interface Outcome {
    rows?: Record<string, unknown>[];
    sql?: string;
    error?: string;
    millis: number;
}

export interface Playground {
    /** Compiles and runs `cypher` on the graph. */
    run(cypher: string): Promise<Outcome>;
    /** Puts the graph back as it started. */
    reset(): Promise<void>;
}

/** Starts SQLite and the compiler, and writes the movies graph. */
export async function start(): Promise<Playground> {
    useSqliteDriver(wasmSqliteDriver(await sqlite3InitModule()));
    useCypherCompiler(compile);
    const provider = new SqliteConnectionProvider('playground', DatabaseType.SQLITE, 'playground.db', { graph: GRAPH });
    const manager = new NonTransactionalPersistenceManager(provider, 'playground', DatabaseType.SQLITE);
    const compiler = new SharedCypherCompiler('sqlite', { name: GRAPH });
    const cypher = (text: string) => new QuerySpecification(cypherStatement(text));

    async function reset(): Promise<void> {
        await manager.execute(cypher('MATCH (n) DETACH DELETE n'));
        await manager.execute(cypher(MOVIES));
    }

    async function run(text: string): Promise<Outcome> {
        const started = performance.now();
        let sql: string | undefined;
        try {
            // Compiled again by the manager as it runs: this is the same compile, to show its SQL.
            sql = compiler.compile(text).sql;
            const rows = await manager.query(cypher(text));
            return { rows: named(rows, returnedColumns(text)), sql, millis: performance.now() - started };
        } catch (e) {
            return { sql, error: (e as Error)?.message ?? String(e), millis: performance.now() - started };
        }
    }

    await reset();
    return { run, reset };
}

/**
 * The rows as maps of their columns. Drivine gives a row of one column as its value and a row of several as an array of
 * them; each is named by `columns` where they match, else numbered.
 */
function named(rows: unknown[], columns: string[] | undefined): Record<string, unknown>[] {
    return rows.map((row) => {
        const values = columns && columns.length > 1 && Array.isArray(row) ? row : [row];
        const names = columns && columns.length === values.length ? columns : values.map((_, i) => `${i + 1}`);
        return Object.fromEntries(names.map((name, i) => [name, values[i]]));
    });
}
