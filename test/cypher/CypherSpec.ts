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

/** Why a step is skipped here, and what the step holds for that to be so: one that no longer holds it fails. */
interface Skip {
    why: string;
    /** The stores or groups it is skipped on: every store where it is left out. */
    on?: string[];
    holds: (step: CypherStep) => boolean;
}

/** A JavaScript number holds no whole number beyond 2^53: these steps bind or expect one, such as 9007199254740993. */
const BEYOND_2_53: Skip = {
    why: 'a number beyond 2^53',
    holds: (step) => /[0-9]{16}/.test(JSON.stringify(step, replacer))
};

/**
 * A JavaScript number does not tell a float that is a whole number, 2.0, from the whole number 2, so a SQL store, which
 * binds a parameter as JSON, binds such a parameter as a whole number: these steps bind one, and expect it back as a
 * float. Neo4j's driver sends a number as a float, so Neo4j runs them. The spec reads a whole number as a `bigint`, so a
 * parameter that is a `number` and whole was written as a float.
 */
const WHOLE_FLOAT_PARAMETER: Skip = {
    why: 'a float parameter that is a whole number',
    on: ['sql'],
    holds: (step) => wholeFloat(step.parameters)
};

function wholeFloat(value: any): boolean {
    if (typeof value === 'number') {
        return Number.isInteger(value);
    }
    return value !== null && typeof value === 'object' && Object.values(value).some(wholeFloat);
}

/**
 * The steps a store here does not run, by file, case and step (from 1), and why. Nothing else is skipped: a store that
 * differs says so with `except` in the spec. The spec's README names the steps beyond 2^53 as those such a library
 * skips; the whole float parameter's is skipped for the same cause, what a JavaScript number cannot hold.
 */
const SKIPPED: Record<string, Record<string, [number[], Skip]>> = {
    'queries.yaml': {
        // The greatest whole number and the least, written as literals.
        'Integer bounds': [[1], BEYOND_2_53],
        // toString($f) of f = 2.0 gives "2", where Cypher gives "2.0": so does toString($f) of f = -2.0, toString($seven) of
        // seven = 1.0e+7, and toString($f * 2).
        'A float parameter with no fraction': [[1, 3, 4, 7], WHOLE_FLOAT_PARAMETER]
    },
    'writes.yaml': { 'Typical app round trip': [[19, 20, 21], BEYOND_2_53] }
};

/**
 * The steps of a spec tag past what Drivine runs that a port here has yet to make pass, by file and case: the steps (from
 * 1), or every step of the case, the stores or groups they are held on, and the issue whose port makes them pass. Each is
 * run, and fails as the issue says it does; one that passes fails, so that its hold is taken out when its port lands.
 */
const HELD: Record<string, Record<string, Hold[]>> = {
    'queries.yaml': {
        // v0.17.0, liberation-data/drivine-cypher-spec#42: JSON's null and a missing key group, de-duplicate and sort apart.
        'A null in a map and a missing key are one null': [
            { issue: 497, steps: [...range(1, 23), 25, 26], on: ['postgres'] },
            { issue: 497, steps: [...range(1, 27), 29], on: ['oracle'] }
        ],
        // v0.18.0, liberation-data/drivine-cypher-spec#43: a key in an order term's body, and any(y IN … WHERE y = e).
        'Implicit grouping key': [{ issue: 499, steps: [37, 38, 39, 40, 42, 43, 44], on: ['sql'] }]
    },
    'writes.yaml': {
        'A null in a written row and a missing key are one null': [{ issue: 497, steps: [1, 2], on: ['sql'] }]
    },
    'temporal.yaml': {
        // v0.19.0, liberation-data/drivine-cypher-spec#44: a temporal value made from another.
        'Dates, times and moments from another temporal value': [{ issue: 500, steps: 'all', on: ['sql'] }],
        'Zoned times and moments from another temporal value': [{ issue: 500, steps: 'all', on: ['sql'] }],
        'Temporal values from another an expression gives': [{ issue: 500, steps: [2, 3, 4], on: ['sql'] }]
    },
    'refusals.yaml': {
        'Temporal map not compiled yet': [{ issue: 500, steps: [1, 4], on: ['sql'] }],
        'Temporal map from another temporal value Neo4j does not take': [{ issue: 500, steps: 'all', on: ['sql'] }]
    }
};

interface Hold {
    issue: number;
    steps: number[] | 'all';
    on: string[];
}

/** The whole numbers from `from` to `to`. */
function range(from: number, to: number): number[] {
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * Reads the spec file `file`. A whole number is a `bigint`, as the spec writes it, so a runner binds it as an integer
 * where a store keeps integers apart from floats (Neo4j); see {@link valuesFor}.
 */
export function loadSpec(file: string): CypherSpec {
    return parse(fs.readFileSync(path.join(__dirname, file), 'utf8'), { intAsBigInt: true });
}

/** Whether `step` runs on `store`, by its name or a group it is in. */
export function runsOn(step: CypherStep, store: string): boolean {
    return (step.only === undefined || named(step.only, store)) && !named(step.except ?? [], store);
}

/** Whether `names` names `store`, or a group it is in. */
function named(names: string[], store: string): boolean {
    return names.some((it) => it === store || GROUPS[it]?.includes(store));
}

/** Whether the step at `index` (from 0) of `case` in `file` is skipped on `store`: see {@link SKIPPED}. */
export function skipped(file: string, cypherCase: CypherCase, index: number, store: string): boolean {
    const [steps, skip] = SKIPPED[file]?.[cypherCase.name] ?? [[], undefined];
    if (!skip || !steps.includes(index + 1)) {
        return false;
    }
    if (!skip.holds(cypherCase.steps[index])) {
        throw new Error(`${file}, ${cypherCase.name}, step ${index + 1} is skipped for ${skip.why}, and has none.`);
    }
    return skip.on === undefined || named(skip.on, store);
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

/** The issue the step at `index` (from 0) of `case` in `file` is held for on `store`, if it is: see {@link HELD}. */
export function heldFor(file: string, cypherCase: CypherCase, index: number, store: string): number | undefined {
    return (HELD[file]?.[cypherCase.name] ?? []).find(
        (hold) => named(hold.on, store) && (hold.steps === 'all' || hold.steps.includes(index + 1))
    )?.issue;
}

/**
 * Runs the step at `index` of `cypherCase`, of the spec file `file`, on `store`, and checks what it gives or how it
 * fails; a step held there ({@link HELD}) is checked to fail as it does until its port lands. `run` gives a step's rows,
 * or fails as the store fails.
 */
export async function check(
    file: string,
    cypherCase: CypherCase,
    index: number,
    store: string,
    run: (step: CypherStep) => Promise<any[]>
): Promise<void> {
    const issue = heldFor(file, cypherCase, index, store);
    if (issue === undefined) {
        await checkStep(cypherCase, index, store, run);
        return;
    }
    try {
        await checkStep(cypherCase, index, store, run);
    } catch {
        // Held, as liberation-data/drivine#<issue> has it.
        return;
    }
    throw new Error(
        `${file}, ${cypherCase.name}, step ${index + 1} is held on ${store} for liberation-data/drivine#${issue}, ` +
            'and passes: take it out of HELD.'
    );
}

async function checkStep(
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
