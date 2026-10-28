import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts/release-version.js');
const SAMPLE = 'sample/.drivine/model.json';
const FIXTURE = 'test/1.Unit/codegen/fixture/.drivine/model.json';

/** Runs the script as Prepare release does, in the directory given. */
function run(dir: string, ...args: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A directory holding the files given, by their paths in the repository. */
function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-release-'));
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
}

const read = (dir: string, name: string) => fs.readFileSync(path.join(dir, name), 'utf8');

/** A model file as the generator lays it out, naming the version given as its generator's. */
const model = (version: string, rest = '') =>
    `{\n  "format": "drivine-model/1",\n  "generator": {\n    "library": "drivine",\n    "version": "${version}",\n` +
    `    "language": "typescript"\n  },\n  "module": "m"${rest}\n}\n`;

describe('release-version.js refs', () => {
    it("finds each reference in this repository's own files, which name the version package.json does", () => {
        const version = JSON.parse(read(ROOT, 'package.json')).version;
        const dir = tree({ [SAMPLE]: read(ROOT, SAMPLE), [FIXTURE]: read(ROOT, FIXTURE) });

        expect(run(dir, 'refs', version)).toMatchObject({ status: 0, stdout: '' });
        expect(read(dir, SAMPLE)).toEqual(read(ROOT, SAMPLE));
        expect(read(dir, FIXTURE)).toEqual(read(ROOT, FIXTURE));
    });

    it('names the new version in every reference, changes nothing else, and prints each file it changed', () => {
        const dir = tree({ [SAMPLE]: read(ROOT, SAMPLE), [FIXTURE]: read(ROOT, FIXTURE) });

        expect(run(dir, 'refs', '9.8.7')).toMatchObject({ status: 0, stdout: `${SAMPLE}\n${FIXTURE}\n` });
        for (const name of [SAMPLE, FIXTURE]) {
            const [before, after] = [JSON.parse(read(ROOT, name)), JSON.parse(read(dir, name))];
            expect(after.generator).toEqual({ ...before.generator, version: '9.8.7' });
            expect({ ...after, generator: undefined }).toEqual({ ...before, generator: undefined });
        }
    });

    it('sets a prerelease as it does a release', () => {
        const dir = tree({ [SAMPLE]: model('3.3.0'), [FIXTURE]: model('3.3.0') });

        expect(run(dir, 'refs', '3.4.0-rc.1').status).toBe(0);
        expect(read(dir, SAMPLE)).toEqual(model('3.4.0-rc.1'));
        expect(read(dir, FIXTURE)).toEqual(model('3.4.0-rc.1'));
    });

    it("leaves another package's version alone, though it is the same", () => {
        const other = ',\n  "uses": {\n    "library": "other",\n    "version": "3.3.0"\n  }';
        const dir = tree({ [SAMPLE]: model('3.3.0', other), [FIXTURE]: model('3.3.0') });

        expect(run(dir, 'refs', '3.4.0').status).toBe(0);
        expect(read(dir, SAMPLE)).toEqual(model('3.4.0', other));
    });

    it("fails on a reference that isn't there, and writes none of them", () => {
        const dir = tree({ [SAMPLE]: model('3.3.0') });

        const result = run(dir, 'refs', '3.4.0');
        expect(result.status).toBe(2);
        expect(result.stderr).toContain(`${FIXTURE} isn't there`);
        expect(read(dir, SAMPLE)).toEqual(model('3.3.0'));
    });

    it('fails on a file that no longer names the version where it expects, and writes none of them', () => {
        const moved = '{\n  "generator": { "name": "drivine", "version": "3.3.0" }\n}\n';
        const dir = tree({ [SAMPLE]: model('3.3.0'), [FIXTURE]: moved });

        const result = run(dir, 'refs', '3.4.0');
        expect(result.status).toBe(2);
        expect(result.stderr).toContain(`${FIXTURE} names the version 0 times, not once`);
        expect(read(dir, SAMPLE)).toEqual(model('3.3.0'));
        expect(read(dir, FIXTURE)).toEqual(moved);
    });

    it('fails on a file that names it twice, as the one to set is then unclear', () => {
        const twice = model('3.3.0', `,\n  "copy": ${model('3.3.0').trim()}`);
        const dir = tree({ [SAMPLE]: model('3.3.0'), [FIXTURE]: twice });

        const result = run(dir, 'refs', '3.4.0');
        expect(result.status).toBe(2);
        expect(result.stderr).toContain(`${FIXTURE} names the version 2 times, not once`);
        expect(read(dir, FIXTURE)).toEqual(twice);
    });

    it("refuses what isn't a version", () => {
        const dir = tree({ [SAMPLE]: model('3.3.0'), [FIXTURE]: model('3.3.0') });

        for (const version of ['--foo', '3.4', '3.4.0-rc..1', '3.4.0"']) {
            expect(run(dir, 'refs', version)).toMatchObject({
                status: 2,
                stderr: expect.stringContaining("isn't a version")
            });
        }
        expect(read(dir, SAMPLE)).toEqual(model('3.3.0'));
    });

    it('prints the usage, which names refs, when it is not given exactly one version', () => {
        const dir = tree({ [SAMPLE]: model('3.3.0'), [FIXTURE]: model('3.3.0') });

        for (const args of [['refs'], ['refs', '3.4.0', '3.5.0']]) {
            expect(run(dir, ...args)).toMatchObject({ status: 2, stderr: expect.stringContaining('refs <version>') });
        }
        expect(read(dir, SAMPLE)).toEqual(model('3.3.0'));
    });
});
