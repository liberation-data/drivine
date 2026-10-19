/**
 * Rewrites the '@/' imports tsc leaves in the build to relative paths: `require("@/logger")` in dist/connection/x.js
 * becomes `require("../logger")`, in .js and .d.ts files alike. Node resolves a directory to its index itself.
 *
 * Usage: node scripts/rewrite-paths.js <out dir>
 */
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[2] ?? 'dist');
const ALIAS = /((?:require\(|from |import\()\s*['"])@\/([^'"]+)(['"])/g;

function filesIn(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((it) => {
        const full = path.join(dir, it.name);
        return it.isDirectory() ? filesIn(full) : /\.(js|d\.ts)$/.test(it.name) ? [full] : [];
    });
}

function relative(from, target) {
    const rel = path.relative(path.dirname(from), path.join(out, target)).split(path.sep).join('/');
    return rel.startsWith('.') ? rel : `./${rel}`;
}

let rewritten = 0;
for (const file of filesIn(out)) {
    const source = fs.readFileSync(file, 'utf8');
    const result = source.replace(ALIAS, (_, open, target, close) => `${open}${relative(file, target)}${close}`);
    if (result !== source) {
        fs.writeFileSync(file, result);
        rewritten++;
    }
}
process.stdout.write(`Rewrote '@/' imports in ${rewritten} files\n`);
