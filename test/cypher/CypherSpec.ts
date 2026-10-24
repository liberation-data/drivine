import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

/**
 * A file of the Cypher spec, in `test/cypher`: the statements each store runs, and what each gives. The three Drivine
 * libraries run the same files; README.md there describes them. `scripts/sync-cypher-spec.sh <tag>` copies them.
 */
export interface CypherSpec {
    /** The label every node the spec writes carries, so a graph engine's are cleared by it. */
    label?: string;
    /** The Cypher that writes the graph each case starts from. */
    graph?: string;
    cases: CypherCase[];
}

export interface CypherCase {
    name: string;
    description?: string;
    steps: CypherStep[];
}

export interface CypherStep {
    cypher: string;
    note?: string;
    parameters?: Record<string, any>;
    /** The rows expected; with no rows and no error, the statement is run and what it gives is not read. */
    rows?: any[];
    /** The message expected of the statement's failure, a list of messages any one of which it may give, or true for any failure. */
    error?: string | string[] | boolean;
    /** The stores or groups the step is run on, or that it is not. */
    only?: string[];
    except?: string[];
    /** The rows are compared in any order. */
    unordered?: boolean;
    /** Each list in the rows is compared in any order: not the rows, which `unordered` is for. */
    unorderedLists?: boolean;
    /** Each map in the rows has its keys in the order expected. */
    keyOrder?: boolean;
}

/** The groups a step may name for its stores: the graph engines, and the stores Cypher is compiled to SQL for. */
const GROUPS: Record<string, string[]> = {
    graph: ['neo4j', 'memgraph', 'falkordb', 'neptune'],
    sql: ['postgres', 'oracle', 'sqlite']
};

/**
 * The steps a store here does not run, by file, case and step (from 1), and why. Nothing else is skipped: a store that
 * differs says so with `except` in the spec.
 */
const SKIPPED: Record<string, Record<string, number[]>> = {
    // A JavaScript number holds no whole number beyond 2^53, and these steps bind or expect one (9007199254740993):
    // the spec's README names them as the steps such a library skips.
    'writes.yaml': { 'Typical app round trip': [19, 20, 21] }
};

/**
 * Reads the spec file `file`. A whole number is a `bigint`, as the spec writes it, so a runner binds it as an integer
 * where a store keeps integers apart from floats (Neo4j); see {@link valuesFor}.
 */
export function loadSpec(file: string): CypherSpec {
    return parse(fs.readFileSync(path.join(__dirname, file), 'utf8'), { intAsBigInt: true });
}

/** Whether `step` runs on `store`, by its name or a group it is in. */
export function runsOn(step: CypherStep, store: string): boolean {
    const named = (names: string[]): boolean => names.some((it) => it === store || GROUPS[it]?.includes(store));
    return (step.only === undefined || named(step.only)) && !named(step.except ?? []);
}

/** Whether the step at `index` (from 0) of `case` in `file` is skipped here: see {@link SKIPPED}. */
export function skipped(file: string, cypherCase: CypherCase, index: number): boolean {
    const steps = SKIPPED[file]?.[cypherCase.name] ?? [];
    if (steps.includes(index + 1) && !/[0-9]{16}/.test(JSON.stringify(cypherCase.steps[index], replacer))) {
        throw new Error(
            `${file}, ${cypherCase.name}, step ${index + 1} is skipped for a number beyond 2^53, and has none.`
        );
    }
    return steps.includes(index + 1);
}

/** A statement as drivine4j's runner gives it, its indent and the blank lines around it taken off. */
export function trimIndent(text: string): string {
    const lines = text.split('\n');
    while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }
    const indent = Math.min(...lines.filter((it) => it.trim() !== '').map((it) => it.length - it.trimStart().length));
    return lines.map((it) => it.substring(Math.min(indent, it.length))).join('\n');
}

/** `value` with each `{$repeat: text, times: n}` in it written out, and each whole number given by `whole`. */
export function valuesFor(value: any, whole: (value: bigint) => any): any {
    if (typeof value === 'bigint') {
        return whole(value);
    }
    if (Array.isArray(value)) {
        return value.map((it) => valuesFor(it, whole));
    }
    if (value !== null && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 2 && keys.includes('$repeat') && keys.includes('times')) {
            return String(value.$repeat).repeat(Number(value.times));
        }
        return Object.fromEntries(keys.map((key) => [key, valuesFor(value[key], whole)]));
    }
    return value;
}

/**
 * Runs the step at `index` of `cypherCase` on `store`, and checks what it gives or how it fails. `run` gives a step's
 * rows, or fails as the store fails.
 */
export async function check(
    cypherCase: CypherCase,
    index: number,
    store: string,
    run: (step: CypherStep) => Promise<any[]>
): Promise<void> {
    const step = cypherCase.steps[index];
    const where = `${cypherCase.name}, step ${index + 1}, on ${store}: ${step.cypher.trim()}`;
    if (step.error !== undefined && step.error !== false) {
        await failure(step, where, run);
        return;
    }
    const rows = await run(step);
    if (step.rows === undefined) {
        return;
    }
    const expected = canonical(valuesFor(step.rows, Number), step, step.unordered ?? false);
    const actual = canonical(rows, step, step.unordered ?? false);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new Error(`${where}\nExpected: ${JSON.stringify(expected)}\nReceived: ${JSON.stringify(actual)}`);
    }
}

/** Runs `step`, which fails, and checks it fails as it says. */
async function failure(step: CypherStep, where: string, run: (step: CypherStep) => Promise<any[]>): Promise<void> {
    let failed: Error | undefined;
    try {
        await run(step);
    } catch (e) {
        failed = e as Error;
    }
    if (!failed) {
        throw new Error(`Expected a failure: ${where}`);
    }
    if (typeof step.error === 'string' && failed.message !== step.error) {
        throw new Error(`Expected <${step.error}>, but was <${failed.message}>: ${where}`);
    }
    if (Array.isArray(step.error) && !step.error.includes(failed.message)) {
        throw new Error(`Expected one of ${JSON.stringify(step.error)}, but was <${failed.message}>: ${where}`);
    }
}

/**
 * `value` in a form that compares as the step says: a map as its entries in order where key order counts, and by its
 * keys sorted where it does not; a list sorted where its order does not count.
 */
function canonical(value: any, step: CypherStep, sorted: boolean = step.unorderedLists ?? false): any {
    if (Array.isArray(value)) {
        const items = value.map((it) => canonical(it, step));
        return sorted ? items.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)) : items;
    }
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        const entries = Object.entries(value).map(([key, item]): [string, any] => [key, canonical(item, step)]);
        return step.keyOrder ? entries : Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return value === undefined ? null : value;
}

function replacer(_: string, value: any): any {
    return typeof value === 'bigint' ? value.toString() : value;
}
