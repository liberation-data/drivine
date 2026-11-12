// Runs Drivine's browser entry (src/browser), bundled for a page, as a page would: with Node's own globals (process,
// require, Buffer and the rest) hidden from it. (Not in a separate vm context: SQLite's wasm build refuses a function
// made in another realm, which a page's never is.) It stores a small graph on SQLite's wasm build and reads
// it back by compiled Cypher. Run in CI after check-browser-bundle.mjs.
import { build } from 'esbuild';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { compile } from '@liberation-data/drivine-cypher-compiler';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
const NODE_GLOBALS = [
    'process',
    'require',
    'module',
    'exports',
    'Buffer',
    'global',
    '__filename',
    '__dirname',
    'setImmediate'
];
const Drivine = new Function(...NODE_GLOBALS, `${bundle.outputFiles[0].text}\nreturn Drivine;`)();

Drivine.useSqliteDriver(Drivine.wasmSqliteDriver(await sqlite3InitModule()));
Drivine.useCypherCompiler(compile);

const provider = new Drivine.SqliteConnectionProvider('page', Drivine.DatabaseType.SQLITE, 'page.db', {
    graph: 'movies'
});
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
// A float a SQLite function gives back stays a float, and bytes are bound with no Buffer.
const kinds = await manager.query(
    cypher('RETURN toString(sqrt(4.0)) AS root, $bytes AS bytes', { bytes: new Uint8Array([1, 2]) })
);
if (JSON.stringify(kinds) !== JSON.stringify([['2.0', 'AQI=']])) {
    console.error(`The browser bundle read back ${JSON.stringify(kinds)}, not [["2.0","AQI="]].`);
    process.exit(1);
}
// A failed statement closes its connection, the only one open, and the provider ends: the graph outlives them, as a
// file does.
const failed = await manager.query(cypher('THIS IS NOT CYPHER')).then(
    () => false,
    () => true
);
await provider.end();
const kept = await manager.query(cypher('MATCH (p:Person) RETURN count(p) AS n'));
if (!failed || JSON.stringify(kept) !== JSON.stringify([2])) {
    console.error(`The browser bundle kept ${JSON.stringify(kept)} people once its connections closed, not [2].`);
    process.exit(1);
}

/** What `Database`, node:sqlite's DatabaseSync or the wasm adapter's, gives for each use Drivine makes of it. */
function uses(Database, path) {
    const db = new Database(path);
    const tried = (f) => {
        try {
            return f();
        } catch (e) {
            // Node's message exactly, as a page shows it: SQLite's, with nothing of the wasm build's before it.
            return `refused: ${e.message}`;
        }
    };
    db.function('whole', {}, () => 2);
    db.function('kind', {}, (a) => typeof a);
    db.function('exact', { useBigIntArguments: true }, (a) => typeof a);
    db.function('count', { varargs: true }, (...a) => a.length);
    // Each kind of value SQLite holds, as a function is given it, and each kind of value a function gives back.
    const kindOf = (x) => (x === null ? 'null' : x instanceof Uint8Array ? `bytes ${[...x]}` : `${typeof x} ${x}`);
    db.function('kinds', { varargs: true, useBigIntArguments: true }, (...a) => a.map(kindOf).join(', '));
    db.function('give', {}, (k) => ({ null: null, none: undefined, big: 5n, bytes: new Uint8Array([7]) })[k]);
    db.function('same', { deterministic: true }, (a) => a);
    db.exec('CREATE TABLE t(a, b); INSERT INTO t VALUES (1, 2), (3, 4)');
    db.exec('CREATE TABLE huge(n); INSERT INTO huge VALUES (9007199254740993)');
    db.exec('CREATE TABLE once(k UNIQUE)');
    const insert = db.prepare('INSERT INTO once VALUES (?)');
    const big = db.prepare('SELECT 9007199254740993 AS n, 1 AS n');
    big.setReadBigInts(true);
    big.setReturnArrays(true);
    const out = {
        whole: db.prepare('SELECT typeof(whole()) AS t, json_quote(whole()) AS q').get(),
        bound: db.prepare('SELECT typeof(?) AS a, typeof(?) AS b, typeof(?) AS c, ? AS d').get(1960, 1.5, 5n, 'x'),
        named: db.prepare('SELECT typeof($a) AS a, $b AS b').get({ a: 1960, b: 'y' }),
        // A name may be given with its prefix, as SqlitePlanWriter gives `$1`.
        prefixed: db.prepare('SELECT $1 AS a, :b AS b').get({ $1: 'x', ':b': 'y' }),
        args: db.prepare('SELECT kind(1) AS a, exact(1) AS b, count(1, 2, 3) AS c, count() AS d').get(),
        kinds: db.prepare("SELECT kinds(NULL, 1, 1.5, 'x', x'', x'0102') AS k").get(),
        given: ['null', 'none', 'big', 'bytes'].map((k) => db.prepare(`SELECT quote(give('${k}')) AS q`).get()),
        // A deterministic function may index a table, which SQLite refuses another.
        deterministic: [
            tried(() => (db.exec('CREATE INDEX t_same ON t(same(a))'), 'ok')),
            tried(() => (db.exec('CREATE INDEX t_whole ON t(kind(a))'), 'ok'))
        ],
        bigArg: tried(() => db.prepare('SELECT kind(9007199254740993) AS a').get()),
        bigRow: tried(() => db.prepare('SELECT 9007199254740993 AS n').get()),
        // A statement refused mid-read is reset, as node:sqlite's is, so it holds no table it read.
        bigRows: tried(() => db.prepare('SELECT n FROM huge').all()),
        droppedAfter: tried(() => (db.exec('DROP TABLE huge'), 'ok')),
        // A statement kept and run again after it failed, as SqliteStatements keeps one, runs.
        reused: [1, 1, 2].map((k) => tried(() => insert.run(k).changes)),
        failed: [
            tried(() => db.prepare('SELECT * FROM nowhere')),
            tried(() => db.exec('ROLLBACK')),
            tried(() => db.prepare('SELECT ?').get(1, 2))
        ],
        bigInts: big.get(),
        blobs: db.prepare("SELECT x'' AS e, x'0102' AS b").get(),
        arity: tried(() => db.prepare('SELECT kind(1, 2)').get()),
        all: db.prepare('SELECT a FROM t ORDER BY a').all(),
        run: db.prepare('UPDATE t SET b = b + 1').run().changes,
        iterated: [...db.prepare('SELECT b FROM t ORDER BY b').iterate()]
    };
    // A second connection registers its functions while the first's statement is running, as a cursor's is.
    const running = db.prepare('SELECT a FROM t').iterate();
    running.next();
    const other = new Database(path);
    out.reRegistered = tried(() => (other.function('whole', {}, () => 3), 'ok'));
    running.return();
    other.close();
    db.close();
    out.closedTwice = tried(() => (db.close(), 'ok'));
    return JSON.parse(
        JSON.stringify(out, (_, v) =>
            typeof v === 'bigint' ? `${v}n` : v instanceof Uint8Array ? `bytes ${[...v]}` : v
        )
    );
}
const dir = mkdtempSync(path.join(tmpdir(), 'drivine-smoke-'));
let node;
try {
    node = JSON.stringify(uses(DatabaseSync, path.join(dir, 'uses.db')));
} finally {
    rmSync(dir, { recursive: true, force: true });
}
const wasm = JSON.stringify(uses(Drivine.wasmSqliteDriver(await sqlite3InitModule()).DatabaseSync, 'uses.db'));
if (node !== wasm) {
    console.error(`The wasm adapter differs from node:sqlite:\n  node:sqlite ${node}\n  wasm        ${wasm}`);
    process.exit(1);
}

// A statement no longer reachable is finalized, as node:sqlite's is when collected: the wasm build's database would
// otherwise hold each one it prepared until it closes. (Needs --expose-gc.)
{
    const sqlite3 = await sqlite3InitModule();
    const DB = sqlite3.oo1.DB;
    let opened;
    sqlite3.oo1.DB = function (...args) {
        return (opened = new DB(...args));
    };
    const db = new (Drivine.wasmSqliteDriver(sqlite3).DatabaseSync)('statements.db');
    for (let i = 0; i < 100; i++) db.prepare('SELECT 1 AS n').get();
    for (let i = 0; i < 10 && opened.openStatementCount() > 0; i++) {
        globalThis.gc();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (opened.openStatementCount() > 0) {
        console.error(`The wasm adapter holds ${opened.openStatementCount()} statements no longer reachable.`);
        process.exit(1);
    }
    db.close();
}
console.log('The browser bundle runs compiled Cypher on SQLite wasm, with no Node globals.');
