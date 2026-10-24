import * as fs from 'fs';
import * as path from 'path';
import type * as TS from 'typescript';
import { FILE, model, previous, text, write } from '@/codegen/model/ModelFiles';
import { ModelReader } from '@/codegen/model/ModelReader';
import type { ReadModel } from '@/codegen/model/ModelReader';

/** What to write the model file from, and how. */
export interface ModelFileOptions {
    /** The project's tsconfig.json. The package is the nearest directory above it with a package.json. */
    project: string;
    /** Writes nothing, and says whether the file is current: for CI. */
    check?: boolean;
    /** Told of each of the problems, and of a file it will not keep. */
    warn?: (message: string) => void;
}

/** What became of the model file, for the command to say, and to fail on in CI. */
export interface ModelFileResult {
    /** Where the file is, or would be. */
    file: string;
    /** Written: the file held something else. Current: it held this already. Stale: `check`, and it held something else. Off: the package turned it off. Empty: nothing declared and no file before. */
    outcome: 'written' | 'current' | 'stale' | 'off' | 'empty';
    /** What could not be read, and what loads other than it is declared. */
    problems: string[];
}

/**
 * Writes a package's model file, `.drivine/model.json` beside its package.json, from its source: the format in
 * drivine-cypher-spec's `model/`, which Drivine Studio reads. The file keeps the previous one's entries the code no
 * longer declares, marked removed, and is written only when it changes.
 *
 * `"drivine": { "model": false }` in package.json turns it off.
 */
export function generateModelFile(options: ModelFileOptions): ModelFileResult {
    const warn = options.warn ?? ((message: string): unknown => process.stderr.write(`${message}\n`));
    const project = path.resolve(options.project);
    const root = packageDir(path.dirname(project));
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const file = path.join(root, FILE);
    if (pkg.drivine?.model === false) {
        return { file, outcome: 'off', problems: [] };
    }

    const read = readProject(project, root);
    read.problems.forEach((it) => warn(`Drivine model file: ${it}`));

    const before = previous(file, warn);
    if (!before && !read.fragments.length && !read.relationshipFragments.length && !read.views.length) {
        return { file, outcome: 'empty', problems: read.problems };
    }
    const json = text(model(pkg.name ?? path.basename(root), version(), read, before));
    if (options.check) {
        const current = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === json;
        return { file, outcome: current ? 'current' : 'stale', problems: read.problems };
    }
    return { file, outcome: write(file, json) ? 'written' : 'current', problems: read.problems };
}

/** What the project declares, read with its own compiler, by its tsconfig.json. */
function readProject(project: string, root: string): ReadModel {
    const ts = compiler(root);
    const host = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (): undefined => undefined };
    const config = ts.getParsedCommandLineOfConfigFile(project, {}, host);
    if (!config) {
        throw new Error(`Drivine model file: ${project} could not be read as a tsconfig.json.`);
    }
    // Read on past a broken tsconfig.json, and the source would be read by the compiler's defaults, not the build's.
    // One that finds no source is only an empty project.
    const errors = config.errors.filter((it) => it.code !== NO_INPUTS);
    if (errors.length) {
        const messages = errors.map((it) => ts.flattenDiagnosticMessageText(it.messageText, '\n'));
        throw new Error(`Drivine model file: ${project} could not be read as a tsconfig.json. ${messages.join(' ')}`);
    }
    // A solution's tsconfig.json declares nothing itself: its references do.
    if (!config.fileNames.length && config.projectReferences?.length) {
        const references = config.projectReferences.map((it) => path.relative(process.cwd(), it.path));
        throw new Error(
            `Drivine model file: ${project} only references other projects. Name the one that declares the model with --project: ${references.join(
                ', '
            )}.`
        );
    }
    const program = ts.createProgram({ rootNames: config.fileNames, options: config.options });
    return new ModelReader(ts, program, root).read();
}

/** The compiler's code for a tsconfig.json that finds no source. */
const NO_INPUTS = 18003;

function packageDir(from: string): string {
    for (let dir = from; ; dir = path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        if (path.dirname(dir) === dir) {
            throw new Error(`Drivine model file: there is no package.json at or above ${from}.`);
        }
    }
}

/** The project's own TypeScript compiler, so the source is read as its build reads it; Drivine's otherwise. */
function compiler(root: string): typeof TS {
    try {
        return require(require.resolve('typescript', { paths: [root] }));
    } catch {
        try {
            return require('typescript');
        } catch {
            throw new Error(
                'Drivine model file: it reads the source with TypeScript, which is not installed. npm install -D typescript.'
            );
        }
    }
}

/** This library's version, which the file names as its generator's. */
function version(): string {
    // From the published package, or from this repository's source.
    for (const candidate of ['../../package.json', '../../../package.json']) {
        const file = path.join(__dirname, candidate);
        if (fs.existsSync(file)) {
            const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (pkg.name === '@liberation-data/drivine') {
                return pkg.version;
            }
        }
    }
    return 'unknown';
}
