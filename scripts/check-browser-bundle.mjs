// Bundles Drivine's browser entry (src/browser) as a page would, and fails if it reaches a database driver other than
// SQLite's, or anything of Node's: a page has neither. Run in CI, so a change that would break the browser build is
// caught where it is made.
import { build } from 'esbuild';
import { builtinModules } from 'node:module';
import { relative } from 'node:path';

const FORBIDDEN = [/^pg($|\/)/, /^oracledb/, /^falkordb/, /^neo4j-driver/, /^@aws-sdk\//, /^mississippi/];

const BUILT_INS = new Set(builtinModules.flatMap((it) => [it, it.split('/')[0]]));

/** Whether a page lacks [name]: one of Node's own modules, or a database driver other than SQLite's. */
function forbidden(name) {
    return name.startsWith('node:') || BUILT_INS.has(name) || FORBIDDEN.some((it) => it.test(name));
}

const importers = new Map();
const problems = [];
const forbid = {
    name: 'forbid',
    setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => {
            const name = args.path;
            if (forbidden(name)) {
                problems.push(`${name}, by way of ${chain(args.importer).join(' <- ')}`);
                return { path: name, external: true };
            }
            return undefined;
        });
    }
};

/** The files by which [file] was reached from the entry, nearest first. */
function chain(file) {
    const seen = [];
    for (let at = file; at && !seen.includes(at); at = importers.get(at)) seen.push(at);
    return seen.map((it) => relative(process.cwd(), it));
}

const track = {
    name: 'track',
    setup(b) {
        b.onResolve({ filter: /.*/ }, async (args) => {
            if (args.pluginData?.tracking || forbidden(args.path)) return undefined;
            const resolved = await b.resolve(args.path, {
                kind: args.kind,
                importer: args.importer,
                resolveDir: args.resolveDir,
                pluginData: { tracking: true }
            });
            if (resolved.path && !importers.has(resolved.path)) importers.set(resolved.path, args.importer);
            return resolved.errors.length ? undefined : resolved;
        });
    }
};

const result = await build({
    entryPoints: ['src/browser/index.ts'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    metafile: true,
    logLevel: 'silent',
    tsconfig: 'tsconfig.json',
    plugins: [forbid, track]
}).catch((e) => ({ errors: e.errors ?? [{ text: String(e) }] }));

for (const error of result.errors ?? []) {
    const where = error.location ? ` (${error.location.file}:${error.location.line})` : '';
    problems.push(`${error.text}${where}`);
}
if (problems.length) {
    console.error(`The browser entry reaches what a page doesn't have:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
}
const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
console.log(`The browser entry bundles for a page: ${Math.round(bytes / 1024)} KB.`);
