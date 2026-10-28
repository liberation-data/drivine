/**
 * The version comparison the release workflows do, on versions written as the tags have them: semantic versions,
 * `3.4.0` or `3.4.0-rc.1`, ordered by semver precedence, so that a prerelease comes before its release. (`sort -V`
 * puts `3.4.0-rc.1` after `3.4.0`, and orders `rc.alpha` and `rc.1` the wrong way round.)
 *
 *     git tag -l | node scripts/release-version.js newest     # prints the newest vX.Y.Z tag, or nothing
 *     node scripts/release-version.js greater 3.4.0 3.3.0     # exits 0 when the first is the greater, 1 when not
 *     node scripts/release-version.js refs 3.4.0              # names 3.4.0 in every file in REFERENCES below
 *
 * It reads Node alone, so it runs before `npm ci`. drivine-python's scripts/release_version.py does the same.
 */
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?$/;
const TAG = /^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;

function parse(text) {
    const match = SEMVER.exec(text);
    const prerelease = match?.[4] === undefined ? [] : match[4].split('.');
    if (!match || prerelease.includes('')) {
        throw new Error(`${text} isn't a version X.Y.Z or X.Y.Z-suffix`);
    }
    return { release: [1, 2, 3].map((n) => BigInt(match[n])), prerelease };
}

// Below zero when a comes first, above when b does. A release sorts after all of its prereleases. Within a
// prerelease, a numeric identifier sorts before an alphanumeric one, numbers by value and words by ASCII, and a
// shorter list before a longer one it begins.
function compare(a, b) {
    for (let n = 0; n < 3; n++) {
        if (a.release[n] !== b.release[n]) return a.release[n] < b.release[n] ? -1 : 1;
    }
    if (!a.prerelease.length || !b.prerelease.length) return b.prerelease.length - a.prerelease.length;
    for (let n = 0; n < Math.min(a.prerelease.length, b.prerelease.length); n++) {
        const [x, y] = [a.prerelease[n], b.prerelease[n]];
        const [xNumber, yNumber] = [/^[0-9]+$/.test(x), /^[0-9]+$/.test(y)];
        if (xNumber && yNumber) {
            if (BigInt(x) !== BigInt(y)) return BigInt(x) < BigInt(y) ? -1 : 1;
        } else if (xNumber !== yNumber) {
            return xNumber ? -1 : 1;
        } else if (x !== y) {
            return x < y ? -1 : 1;
        }
    }
    return a.prerelease.length - b.prerelease.length;
}

function newest(tags) {
    let best;
    for (const tag of tags) {
        if (!TAG.test(tag)) continue;
        let version;
        try {
            version = parse(tag.slice(1));
        } catch {
            continue; // v01.2.3 or v1.2.3-rc..1: a tag, but not a semantic version, so no release's.
        }
        if (!best || compare(version, best.version) > 0) best = { tag, version };
    }
    return best?.tag;
}

/**
 * The files besides package.json and package-lock.json that name this library's own version, and must name the new
 * one in the release PR. `npm version` sets those two; `refs` sets these, in the directory it runs in.
 *
 * Each model file records the Drivine that wrote it as its generator, and ModelFile.spec.ts checks the file is what
 * the generator writes now, version and all, so a release PR that left the old version there would fail CI. Rewriting
 * the one string here gives the same bytes the generator would (it writes the version from package.json, as it is,
 * into JSON that is otherwise unchanged), without building Drivine in Prepare release.
 *
 * Each pattern is anchored on what is around the version, here the `"library": "drivine"` it belongs to, so it can't
 * match some other package's version that happens to be the same. Its three groups are what comes before the version,
 * the version, and what comes after. A file must hold its pattern exactly once: when it doesn't, the file was moved or
 * its layout changed, and `refs` fails rather than leave the old version there. A new file that names the version is
 * added here.
 */
const GENERATOR = /("generator": \{\s*"library": "drivine",\s*"version": ")([^"]*)(")/g;
const REFERENCES = [
    { file: 'sample/.drivine/model.json', pattern: GENERATOR },
    { file: 'test/1.Unit/codegen/fixture/.drivine/model.json', pattern: GENERATOR }
];

// Names the version in each of the references, and prints each file it changed, for the workflow to commit. It reads
// every file before it writes any, so one that fails leaves all of them as they were.
function refs(version) {
    parse(version);
    const fs = require('fs');
    const rewritten = REFERENCES.map(({ file, pattern }) => {
        if (!fs.existsSync(file)) throw new Error(`${file} isn't there, so its version can't be set. See REFERENCES.`);
        const text = fs.readFileSync(file, 'utf8');
        const found = [...text.matchAll(pattern)].length;
        if (found !== 1) {
            throw new Error(`${file} names the version ${found} times, not once, by ${pattern}. See REFERENCES.`);
        }
        return {
            file,
            before: text,
            after: text.replace(pattern, (_, start, _old, end) => `${start}${version}${end}`)
        };
    });
    for (const { file, before, after } of rewritten) {
        if (after === before) continue;
        fs.writeFileSync(file, after);
        console.log(file);
    }
}

function main(args) {
    try {
        if (args.length === 1 && args[0] === 'newest') {
            const found = newest(require('fs').readFileSync(0, 'utf8').split(/\s+/));
            if (found) console.log(found);
            return 0;
        }
        if (args.length === 3 && args[0] === 'greater') {
            return compare(parse(args[1]), parse(args[2])) > 0 ? 0 : 1;
        }
        if (args.length === 2 && args[0] === 'refs') {
            refs(args[1]);
            return 0;
        }
        console.error('Usage: node scripts/release-version.js newest | greater <version> <version> | refs <version>');
        return 2;
    } catch (error) {
        console.error(error.message);
        return 2;
    }
}

process.exitCode = main(process.argv.slice(2));
