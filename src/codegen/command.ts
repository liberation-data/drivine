import { generateModelFile } from '@/codegen/model/ModelFileGenerator';

/** Where the command says what it did: the console, unless a test gives its own. */
export interface Output {
    log(message: string): unknown;
    error(message: string): unknown;
}

const USAGE = `Usage: drivine model [--project tsconfig.json] [--check]

Writes .drivine/model.json beside the package.json, from the classes the project declares, for Drivine Studio.
  --project  the tsconfig.json to read the source by (./tsconfig.json)
  --check    write nothing; fail when the file is not current, as CI does`;

/** The terminal: what the command did on standard output, and what went wrong on standard error. */
const TERMINAL: Output = {
    log: (message) => process.stdout.write(`${message}\n`),
    error: (message) => process.stderr.write(`${message}\n`)
};

/** Runs `drivine <args>`, and gives the exit code. */
export function main(args: string[], out: Output = TERMINAL): number {
    const [command, ...rest] = args;
    if (command !== 'model' || rest.includes('--help')) {
        out.log(USAGE);
        return command === 'model' || command === '--help' || command === undefined ? 0 : 1;
    }
    const project = projectOf(rest);
    if (!project) {
        out.error(USAGE);
        return 1;
    }
    const result = generateModelFile({
        project,
        check: rest.includes('--check'),
        warn: (message) => out.error(message)
    });
    switch (result.outcome) {
        case 'written':
            out.log(`Drivine model file written to ${result.file}`);
            return 0;
        case 'stale':
            out.error(`Drivine model file: ${result.file} is not current. Run drivine model, and commit it.`);
            return 1;
        case 'off':
            out.log('Drivine model file: turned off in package.json.');
            return 0;
        case 'empty':
            out.log('Drivine model file: the project declares no fragments or views, so there is nothing to write.');
            return 0;
        default:
            out.log(`Drivine model file: ${result.file} is current.`);
            return 0;
    }
}

/** The tsconfig.json `drivine model`'s options name, or undefined when they are not ones it knows. */
function projectOf(options: string[]): string | undefined {
    const at = options.indexOf('--project');
    // A mistyped --check must not pass in CI by writing the file instead.
    const unknown = options.filter((it, i) => it !== '--check' && i !== at && (at < 0 || i !== at + 1));
    return unknown.length ? undefined : at >= 0 ? options[at + 1] : 'tsconfig.json';
}
