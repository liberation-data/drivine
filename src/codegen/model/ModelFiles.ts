import * as fs from 'fs';
import * as path from 'path';
import type { Entry, ReadModel } from '@/codegen/model/ModelReader';

export const FORMAT = 'drivine-model/1';

/** Word for word what the format asks every library to write. */
export const COMMENT =
    "Drivine model file: this module's fragments, relationship fragments and views, written by the build. " +
    'Drivine Studio reads it to browse the model and query the data. Keep it in source control: the build rewrites it ' +
    'when the model changes, and CI checks that it is current. Format: https://github.com/liberation-data/drivine-cypher-spec/tree/main/model';

/** Where the file goes, from the package's directory. */
export const FILE = path.join('.drivine', 'model.json');

/**
 * The model file a module had, or undefined when there is none, or it is not one this library can read, which `warn`
 * is told of: a file of another format is written over, as one the module never had.
 */
export function previous(file: string, warn: (message: string) => void): Record<string, unknown> | undefined {
    if (!fs.existsSync(file)) {
        return undefined;
    }
    let model: Record<string, unknown> | undefined;
    try {
        model = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        model = undefined;
    }
    if (model?.format !== FORMAT) {
        warn(`Drivine model file: ${file} is not a ${FORMAT} file, so nothing in it is kept.`);
        return undefined;
    }
    return model;
}

/**
 * The whole model file: the envelope, and the entries the code declares, with the previous file's entries it no
 * longer does, marked removed.
 */
export function model(module: string, version: string, read: ReadModel, before?: Record<string, unknown>): Entry {
    return {
        $comment: COMMENT,
        format: FORMAT,
        generator: { library: 'drivine', version, language: 'typescript' },
        module,
        fragments: withRemoved(read.fragments, before?.fragments),
        relationshipFragments: withRemoved(read.relationshipFragments, before?.relationshipFragments),
        views: withRemoved(read.views, before?.views)
    };
}

/**
 * The current entries, and the previous file's entries the code no longer declares, marked removed, sorted by id. An
 * entry that comes back into the code is written from the code again, and is no longer removed.
 */
export function withRemoved(current: Entry[], before: unknown): Entry[] {
    const ids = new Set(current.map((it) => it.id));
    const kept = (Array.isArray(before) ? before : [])
        .filter((it): it is Entry => typeof it?.id === 'string' && !ids.has(it.id))
        .map(removed);
    return [...current, ...kept].sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1));
}

/** The entry marked removed, the mark after its name, where the format lists it. */
function removed(entry: Entry): Entry {
    const out: Entry = {};
    for (const [key, value] of Object.entries(entry)) {
        if (key === 'removed') {
            continue;
        }
        out[key] = value;
        if (key === 'name') {
            out.removed = true;
        }
    }
    if (!('removed' in out)) {
        out.removed = true;
    }
    return out;
}

/** The file's text, the same way every time: two spaces of indentation, keys in order, and a newline at the end. */
export function text(value: Entry): string {
    return `${JSON.stringify(value, null, 2)}\n`;
}

/** Writes the text to the file when it holds something else, so a build with nothing new leaves it be. Whether it wrote. */
export function write(file: string, json: string): boolean {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === json) {
        return false;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, json);
    return true;
}
