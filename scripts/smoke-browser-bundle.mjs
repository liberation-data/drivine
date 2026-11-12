// Runs Drivine's browser entry (src/browser), bundled for a page, as a page would: with Node's own globals (process,
// require, Buffer and the rest) hidden from it. (Not in a separate vm context: SQLite's wasm build refuses a function
// made in another realm, which a page's never is.) It stores a small graph on SQLite's wasm build and reads
// it back by compiled Cypher. Run in CI after check-browser-bundle.mjs.
import { build } from 'esbuild';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { compile } from '@liberation-data/drivine-cypher-compiler';

const bundle = await build({
    entryPoints: ['src/browser/index.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'Drivine',
    write: false,
    logLevel: 'silent',
    tsconfig: 'tsconfig.json'
});

// Node's globals, each shadowed by an undefined parameter, so the bundle sees none of them, as in a page.
const NODE_GLOBALS = ['process', 'require', 'module', 'exports', 'Buffer', 'global', '__filename', '__dirname', 'setImmediate'];
const Drivine = new Function(...NODE_GLOBALS, `${bundle.outputFiles[0].text}\nreturn Drivine;`)();

Drivine.useSqliteDriver(Drivine.wasmSqliteDriver(await sqlite3InitModule()));
Drivine.useCypherCompiler(compile);

const provider = new Drivine.SqliteConnectionProvider('page', Drivine.DatabaseType.SQLITE, 'page.db', { graph: 'movies' });
const manager = new Drivine.NonTransactionalPersistenceManager(provider, 'page', Drivine.DatabaseType.SQLITE);
const cypher = (text, parameters = {}) =>
    new Drivine.QuerySpecification(Drivine.cypherStatement(text)).bind(parameters);

await manager.execute(
    cypher(`CREATE (k:Person {name: 'Keanu', born: 1964}), (c:Person {name: 'Carrie', born: 1967}),
        (m:Movie {title: 'The Matrix', released: 1999}),
        (k)-[:ACTED_IN {roles: ['Neo']}]->(m), (c)-[:ACTED_IN {roles: ['Trinity']}]->(m)`)
);
const rows = await manager.query(
    cypher(
        `MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) WHERE p.born > $before
         RETURN {name: p.name, roles: r.roles, title: toUpper(m.title), id: randomUUID() IS NOT NULL} AS row
         ORDER BY row.name`,
        { before: 1960 }
    )
);
const expected = [
    { name: 'Carrie', roles: ['Trinity'], title: 'THE MATRIX', id: true },
    { name: 'Keanu', roles: ['Neo'], title: 'THE MATRIX', id: true }
];
if (JSON.stringify(rows) !== JSON.stringify(expected)) {
    console.error(`The browser bundle read back ${JSON.stringify(rows)}, not ${JSON.stringify(expected)}.`);
    process.exit(1);
}
console.log('The browser bundle runs compiled Cypher on SQLite wasm, with no Node globals.');
