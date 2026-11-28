import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// drivine.org/install.sh (website/public/install.sh), run against a release laid out on disk as GitHub lays one out,
// with uname answering for the machine each case is about.
const SCRIPT = path.resolve(__dirname, '../../../website/public/install.sh');

const hasTool = (tool: string) => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0;

describe('install.sh', () => {
    let dir: string;
    let releases: string;
    let bin: string;
    let home: string;

    // A release's CLI asset, holding a `drivine` that prints its version, with its .sha256 beside it as sha256sum writes it.
    const release = (where: string, asset: string, version: string, digest?: string) => {
        const at = path.join(releases, where);
        const content = path.join(dir, `content-${asset}-${version}`);
        fs.mkdirSync(at, { recursive: true });
        fs.mkdirSync(content, { recursive: true });
        fs.writeFileSync(path.join(content, 'drivine'), `#!/bin/sh\necho "drivine ${version}"\n`, { mode: 0o755 });
        const file = path.join(at, asset);
        const packed = asset.endsWith('.zip')
            ? spawnSync('zip', ['-q', '-j', file, path.join(content, 'drivine')])
            : spawnSync('tar', ['-czf', file, '-C', content, 'drivine']);
        expect(packed.status).toBe(0);
        const sha =
            digest ??
            createHash('sha256')
                .update(new Uint8Array(fs.readFileSync(file)))
                .digest('hex');
        fs.writeFileSync(`${file}.sha256`, `${sha}  ${asset}\n`);
    };

    // install.sh, on a machine whose uname says `os` and `arch`.
    const install = (os: string, arch: string, env: Record<string, string> = {}) => {
        fs.writeFileSync(
            path.join(bin, 'uname'),
            `#!/bin/sh\ncase "$1" in -s) echo ${os} ;; -m) echo ${arch} ;; *) echo ${os} ;; esac\n`,
            { mode: 0o755 }
        );
        return spawnSync('sh', [SCRIPT], {
            encoding: 'utf8',
            env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, DRIVINE_RELEASES: `file://${releases}`, ...env }
        });
    };
    const installed = () => path.join(home, '.local/bin/drivine');

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-sh-'));
        releases = path.join(dir, 'releases');
        bin = path.join(dir, 'bin');
        home = path.join(dir, 'home');
        fs.mkdirSync(bin);
        fs.mkdirSync(home);
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("installs the latest release's linux x64 binary in ~/.local/bin", () => {
        release('latest/download', 'drivine-linux-x64.tar.gz', '9.9.9');
        const run = install('Linux', 'x86_64');
        expect(run.stderr).toContain('installed drivine 9.9.9');
        expect(run.status).toBe(0);
        expect(spawnSync(installed(), ['--version'], { encoding: 'utf8' }).stdout).toBe('drivine 9.9.9\n');
        // ~/.local/bin isn't on the PATH the script ran with, so it says how to add it.
        expect(run.stderr).toContain("isn't on your PATH");
    });

    it('installs the release DRIVINE_VERSION names, with or without its v, in DRIVINE_INSTALL_DIR', () => {
        release('latest/download', 'drivine-linux-x64.tar.gz', '9.9.9');
        release('download/v1.2.3', 'drivine-linux-x64.tar.gz', '1.2.3');
        const into = path.join(dir, 'tools');
        for (const version of ['1.2.3', 'v1.2.3']) {
            const run = install('Linux', 'amd64', {
                DRIVINE_VERSION: version,
                DRIVINE_INSTALL_DIR: into,
                PATH: `${bin}:${into}:${process.env.PATH}`
            });
            expect(run.status).toBe(0);
            expect(run.stderr).toContain('installed drivine 1.2.3');
            expect(run.stderr).not.toContain("isn't on your PATH");
        }
        expect(fs.existsSync(installed())).toBe(false);
    });

    it("refuses a download whose SHA-256 differs from the release's, and installs nothing", () => {
        release('latest/download', 'drivine-linux-x64.tar.gz', '9.9.9', 'a'.repeat(64));
        const run = install('Linux', 'x86_64');
        expect(run.status).toBe(1);
        expect(run.stderr).toContain(`but the release says ${'a'.repeat(64)}. Nothing was installed.`);
        expect(fs.existsSync(installed())).toBe(false);
    });

    it('refuses a .sha256 that holds no SHA-256', () => {
        release('latest/download', 'drivine-linux-x64.tar.gz', '9.9.9', 'not-a-digest');
        const run = install('Linux', 'x86_64');
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("doesn't hold a SHA-256");
        expect(fs.existsSync(installed())).toBe(false);
    });

    it('says so when the release has no binary to download', () => {
        const run = install('Linux', 'x86_64', { DRIVINE_VERSION: '0.0.1' });
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("couldn't download");
        expect(run.stderr).toContain('download/v0.0.1/drivine-linux-x64.tar.gz');
        expect(fs.existsSync(installed())).toBe(false);
    });

    it.each([
        ['Linux', 'aarch64', 'Linux on aarch64'],
        ['Darwin', 'x86_64', 'macOS on x86_64'],
        ['FreeBSD', 'amd64', 'FreeBSD on amd64']
    ])('points %s on %s, which has no native binary, to JBang', (os, arch, named) => {
        const run = install(os, arch);
        expect(run.status).toBe(1);
        expect(run.stderr).toContain(`there's no native drivine binary for ${named} yet`);
        expect(run.stderr).toContain('jbang drivine@liberation-data/drivine4j');
    });

    (hasTool('zip') && (hasTool('unzip') || hasTool('ditto')) ? it : it.skip)(
        'installs the macOS arm64 zip on Apple silicon',
        () => {
            release('latest/download', 'drivine-macos-arm64.zip', '9.9.9');
            const run = install('Darwin', 'arm64');
            expect(run.stderr).toContain('installed drivine 9.9.9');
            expect(run.status).toBe(0);
        }
    );
});
