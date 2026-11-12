// Bundles the playground's engine (src/playground/engine.ts) with Drivine for TypeScript from this repository's source,
// SQLite's wasm build and the shared Cypher compiler, into public/playground/, with each one's .wasm file beside it,
// where it looks for it. The packages come from the repository's own node_modules, so the page runs the compiler and
// SQLite that Drivine is built and tested with: `npm ci` at the repository's root first.
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const website = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(website, '..');
const out = join(website, 'public', 'playground');
const fromRoot = createRequire(join(root, 'package.json'));

/** The folder of `name`'s package in the repository's node_modules, found from its main file (one exports no package.json). */
function packageDir(name) {
    let dir = dirname(fromRoot.resolve(name));
    while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
    return dir;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
    entryPoints: [join(website, 'src', 'playground', 'engine.ts')],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minify: true,
    outfile: join(out, 'engine.mjs'),
    tsconfig: join(website, 'src', 'playground', 'tsconfig.json'),
    nodePaths: [join(root, 'node_modules')],
    // Reached only on Node, where each package loads its .wasm from disk; a page fetches it.
    external: ['node:*'],
    logLevel: 'warning'
});
copyFileSync(join(packageDir('@sqlite.org/sqlite-wasm'), 'dist', 'sqlite3.wasm'), join(out, 'sqlite3.wasm'));
copyFileSync(
    join(packageDir('@liberation-data/drivine-cypher-compiler'), 'drivine-cypher-compiler.wasm'),
    join(out, 'drivine-cypher-compiler.wasm')
);
console.log(`Bundled the playground into ${out}.`);
