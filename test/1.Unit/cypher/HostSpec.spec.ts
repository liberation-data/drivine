import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { types } from 'pg';
import { openSqlite, SqliteDatabase, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { SqliteConnection } from '@/connection/sqlite/SqliteConnection';
import { PostgresConnection } from '@/connection/postgres/PostgresConnection';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { QuerySpecification } from '@/query/QuerySpecification';
import { CompiledCypher } from '@/cypher/CompiledCypher';
import { cypherCompilerModule, SharedCypherCompiler, SharedStore } from '@/cypher/SharedCypherCompiler';
import { CompiledSpecification } from '@/cypher/CompiledSpecification';
import { CypherFloat } from '@/cypher/CypherFloat';
import { writeLayout } from '@/cypher/ValueLayout';
import { DrivineError } from '@/DrivineError';
import { loadSpec, runsOn, valuesFor } from '../../cypher/CypherSpec';
import { compiledAs } from '../../CompiledAs';

/**
 * The spec's `host.yaml` (test/cypher): what Drivine's own code does with the values compiled SQL hands it, with no
 * store, as drivine4j's `HostSpecTest` runs it. Each `function` step calls one of the functions Drivine registers on
 * SQLite, on an in-memory database; each `read` step reads a column's text as a connection reads a compiled
 * statement's rows; and each `write` step writes a value as a save writes it on its store (writeLayout, the module's
 * write for the store), its refusal the error a save throws. Each case's `pairs` name store cases of the other spec files
 * whose statements rely on its steps: one of them compiles on SQLite to SQL that calls each function its steps call, one
 * compiles on each store its steps read with the `nonFinite` each read step says, and for each store its `write` steps
 * name, one runs on that store and writes. The three libraries read the same file.
 *
 * A case or step that can't pass yet is held: see {@link HELD}.
 */

interface HostCase {
    name: string;
    description?: string;
    /** The store cases, by spec file, whose compiled statements rely on the steps. */
    pairs?: Record<string, string[]>;
    steps: Record<string, any>[];
}

interface Read {
    store: string;
    nonFinite: boolean;
    column: any;
}

/**
 * The keys of each kind of step, beside its optional `note`: a function's result, its failure, its order, a read, a
 * temporal value's sort key, and a value a store's layout writes or refuses.
 */
const SHAPES = [
    ['function', 'args', 'result'],
    ['function', 'args', 'error'],
    ['function', 'ascending'],
    ['read', 'value'],
    ['key', 'result'],
    ['write', 'result'],
    ['write', 'error']
];
const READ = ['store', 'nonFinite', 'column'];
/** A write's keys: the store's left out of a step that is refused for it. */
const WRITE = ['store', 'value'];
/** The stores a save writes a value in a layout of: a write step for another is the module's request's to refuse. */
const WRITTEN_STORES = ['postgres', 'oracle', 'sqlite'];
/** A statement that writes, as a pair of a `write` step: whether it compiles on the store or is refused. */
const WRITES = /\b(?:CREATE|MERGE|SET)\b/i;
const KEY = ['kind', 'v'];
/** A call in Cypher that makes a temporal value of a kind with a sort key, as a statement runs. */
const TEMPORAL_CALL = /\b(?:date|localtime|time|localdatetime|datetime)\s*\(/i;
/** SQLite's errors of a call it won't make, which no step's failure can be: the step names no function of the store's. */
const RUNNER_ERRORS = ['no such function', 'wrong number of arguments'];
/** The function a library calls itself, once on each connection, and no compiled statement does: its steps pair nothing. */
const UNPAIRED = 'drivine_host_version';
/** Drivine's functions, and `regexp`, which SQLite calls, as `regexp(pattern, text)`, for its operator `text REGEXP pattern`. */
const FUNCTION = /^(?:drivine_[a-z_]+|regexp)$/;
const REGEXP_OPERATOR = /\bREGEXP\b/i;
/** SQL's quoted texts and names: a quote inside one is written twice, so splits it into two that touch, each matched here. */
const QUOTED = /'[^']*'|"[^"]*"/g;

/**
 * What of a case fails here until an issue lands, and is checked to fail until it does: a hold whose steps or pairs
 * pass fails, so it is taken off as soon as it can be.
 * - `steps`: the steps, from 1, that give another result than the spec's;
 * - `pairs`: the pairs check, where Drivine's own compiler writes SQL that doesn't call the function, or doesn't say the
 *   `nonFinite` the read step reads.
 */
interface Hold {
    issue: number;
    steps?: number[];
    pairs?: boolean;
}

const HELD: Record<string, Hold[]> = {};

/**
 * The note of a step held until the store's timestamps keep nine digits (layout 2), as drivine4j and the module hold it:
 * it is run, and must fail, so the hold comes off when it passes. Matched within the note.
 */
const LAYOUT_2_NOTE = 'drivine4j#421 (layout 2)';
const LAYOUT_2_ISSUE = 421;

const spec: HostCase[] = parse(fs.readFileSync(path.join(__dirname, '../../cypher/host.yaml'), 'utf8'), {
    intAsBigInt: true
}).cases;

describe("The Cypher spec's host.yaml", () => {
    describe.each(spec.map((it) => [it.name, it] as const))('%s', (_, hostCase) => {
        const holds = HELD[hostCase.name] ?? [];
        const heldStep = (index: number) =>
            holds.find((it) => it.steps?.includes(index + 1))?.issue ??
            (String(hostCase.steps[index].note ?? '').includes(LAYOUT_2_NOTE) ? LAYOUT_2_ISSUE : undefined);
        const heldPairs = holds.find((it) => it.pairs)?.issue;

        it.each(hostCase.steps.map((step, index) => [index + 1, step, index] as const))(
            'step %d',
            async (_number, step, index) => {
                const where = `${hostCase.name}, step ${index + 1}: ${JSON.stringify(withoutNote(step), replacer)}`;
                await held(heldStep(index), where, async () => checkStep(step, where));
            }
        );

        it('relies on its pairs', async () => {
            await held(heldPairs, `${hostCase.name}: pairs`, () => paired(hostCase));
        });
    });

    it('holds nothing for a case the file has no longer', () => {
        expect(Object.keys(HELD).filter((name) => !spec.some((it) => it.name === name))).toEqual([]);
    });
});

describe('The host.yaml runner', () => {
    const add = { function: 'drivine_add', args: ['1', '2'], result: '3' };
    const read = { read: { store: 'postgres', nonFinite: false, column: '1.5' }, value: 1.5 };

    it('should fail a step or a read with a key the spec does not have', async () => {
        await checkStep(add, 'add');
        await expect(checkStep({ ...add, reslt: '3' }, 'add')).rejects.toThrow(/a step has the keys/);
        await expect(checkStep({ function: 'drivine_add', args: ['1', '2'] }, 'add')).rejects.toThrow(
            /a step has the keys/
        );
        await checkStep(read, 'read');
        await expect(checkStep({ read: read.read }, 'read')).rejects.toThrow(/a step has the keys/);
        await expect(
            checkStep({ read: { store: 'postgres', nonfinite: false, column: '1.5' }, value: 1.5 }, 'read')
        ).rejects.toThrow(/a read has the keys/);
    });

    it('should fail a function Drivine does not register, or a result it does not give', async () => {
        await expect(checkStep({ function: 'drivine_nothing', args: ['1'], result: '1' }, 'nothing')).rejects.toThrow();
        await expect(checkStep({ ...add, result: '4' }, 'add')).rejects.toThrow();
        await expect(checkStep({ function: 'drivine_nothing', ascending: ['[1]'] }, 'one')).rejects.toThrow(
            /two values or more/
        );
    });

    it('should fail a case with no pairs, a pair no file has, or pairs that call none of its functions', () => {
        const named = (pairs?: Record<string, string[]>): HostCase => ({ name: 'a case', pairs, steps: [add] });
        expect(() => paired(named())).toThrow(/pairs no store case/);
        expect(() => paired(named({ 'writes.yaml': ['No such case'] }))).toThrow(
            /writes.yaml has no case "No such case"/
        );
        expect(() => paired(named({ 'queries.yaml': ['Returning nodes and properties'] }))).toThrow(
            /compiles on SQLite to SQL that calls drivine_add/
        );
        const given = { read: { ...read.read, nonFinite: true }, value: 1.5 };
        const reading: HostCase = {
            name: 'a case',
            pairs: { 'queries.yaml': ['Returning nodes and properties'] },
            steps: [given]
        };
        expect(() => paired(reading)).toThrow(/compiles on postgres with nonFinite true/);
    });

    it('should pass a step that fails with its error, and fail one that gives a value or fails otherwise', async () => {
        const fails = { function: 'drivine_round', args: [2.5, BigInt(0), 'UNNECESSARY'], error: 'Rounding necessary' };
        await checkStep(fails, 'fails');
        await expect(checkStep({ ...fails, error: 'no such' }, 'fails')).rejects.toThrow();
        await expect(checkStep({ function: 'drivine_add', args: ['1', '2'], error: 'x' }, 'gives')).rejects.toThrow(
            /but gave "3"/
        );
        await expect(checkStep({ ...fails, error: BigInt(1) }, 'fails')).rejects.toThrow(/error is a text/);
        // SQLite's own refusal to call a function is the runner's: not a failure a hold may count.
        await expect(
            held(1, 'a held step', async () => checkStep({ function: 'drivine_nothing', args: ['1'], error: 'x' }, 'x'))
        ).rejects.toThrow(/no such function/);
    });

    it('should give a key step the module sort key, and fail one with another key, another shape or no kind', async () => {
        const step = { key: { kind: 'date', v: '2024-01-01' }, result: '10000020240101' };
        await checkStep(step, 'key');
        await checkStep({ key: { kind: 'duration', v: 'P1D' }, result: null }, 'key');
        await expect(checkStep({ ...step, result: '10000020240102' }, 'key')).rejects.toThrow();
        await expect(checkStep({ ...step, key: { kind: 'date', value: '2024-01-01' } }, 'key')).rejects.toThrow(
            /a key has the keys/
        );
        await expect(checkStep({ ...step, key: { kind: 'day', v: '2024-01-01' } }, 'key')).rejects.toThrow();
    });

    it('should pair a key step by a statement that makes a temporal value, and drivine_host_version by nothing', () => {
        const step = { key: { kind: 'date', v: '2024-01-01' }, result: '10000020240101' };
        paired({
            name: 'key',
            pairs: { 'temporal.yaml': ['A sort key worked out as the statement runs'] },
            steps: [step]
        });
        expect(() =>
            paired({ name: 'key', pairs: { 'queries.yaml': ['Returning nodes and properties'] }, steps: [step] })
        ).toThrow(/makes a temporal value as the statement runs/);
        const version = { function: 'drivine_host_version', args: [], result: BigInt(2) };
        paired({ name: 'version', pairs: {}, steps: [version] });
        expect(() => paired({ name: 'version', steps: [version] })).toThrow(/pairs no store case/);
        expect(() => paired({ name: 'version', pairs: {}, steps: [version, add] })).toThrow(/pairs no store case/);
    });

    it('should call regexp with the pattern first, and pair it by SQL that holds the REGEXP operator', async () => {
        const regexp = { 'queries.yaml': ['Regular expressions and more functions'] };
        const steps = [
            { function: 'regexp', args: ['b', 'abc'], result: BigInt(1) },
            { function: 'regexp', args: ['abc', 'b'], result: BigInt(0) },
            { function: 'regexp', args: [null, 'a'], result: null }
        ];
        for (const step of steps) {
            await checkStep(step, 'regexp');
        }
        paired({ name: 'regexp', pairs: regexp, steps });
        await expect(checkStep({ ...steps[1], result: BigInt(1) }, 'regexp')).rejects.toThrow();
        expect(() =>
            paired({ name: 'regexp', pairs: { 'queries.yaml': ['Returning nodes and properties'] }, steps })
        ).toThrow(/compiles on SQLite to SQL that calls regexp/);
        await expect(checkStep({ ...steps[0], function: 'regexpx' }, 'regexp')).rejects.toThrow(
            /no function of Drivine's/
        );
    });

    it('should pair regexp by the REGEXP operator, not by a text or a name that says regexp', () => {
        expect(holdsRegexp("SELECT ('x' ->> '$') REGEXP '^a\\z'")).toBe(true);
        expect(holdsRegexp("SELECT 'x' not regexp 'a'")).toBe(true);
        expect(holdsRegexp("SELECT json_quote('a REGEXP b')")).toBe(false);
        expect(holdsRegexp('SELECT json_object(\'regexp\', 1) AS "regexp"')).toBe(false);
        expect(holdsRegexp("SELECT drivine_regexp_count('a', 'b')")).toBe(false);
        expect(holdsRegexp('SELECT \'it\'\'s REGEXP\', "a""REGEXP"')).toBe(false);
        // A backslash escapes nothing in SQL's quoted texts.
        expect(holdsRegexp("SELECT 'a\\' REGEXP 'b'")).toBe(true);
    });

    it('should pass over a long quoted text, or one of many doubled quotes, without overflowing the stack', () => {
        expect(holdsRegexp(`SELECT '${'x'.repeat(200_000)}' REGEXP 'a'`)).toBe(true);
        expect(holdsRegexp(`SELECT '${"''".repeat(100_000)} REGEXP'`)).toBe(false);
    });

    it('should give a write step the text a save writes, or the refusal it throws, exactly, and pair it by a write on its store', async () => {
        const pairs = { 'writes.yaml': ['NaN and the infinities written'] };
        const infinity = { write: { store: 'sqlite', value: { $float: 'Infinity' } }, result: '9e999' };
        await checkStep(infinity, 'write');
        await checkStep({ write: { store: 'oracle', value: { $bytes: 'AQL/' } }, result: '[1,2,-1]' }, 'write');
        await checkStep({ write: { store: 'postgres', value: { $float: '2.0' } }, result: '2.0' }, 'write');
        await expect(checkStep({ ...infinity, result: '9E999' }, 'write')).rejects.toThrow();
        const refused = { write: { store: 'postgres', value: { $float: 'NaN' } } };
        const message =
            "A statement that writes is given NaN or an infinity, which Postgres's `jsonb` holds as no number: it would store another value in its place.";
        await checkStep({ ...refused, error: message }, 'refused');
        // The message is compared whole, not as a part of it.
        await expect(
            checkStep({ ...refused, error: 'A statement that writes is given NaN' }, 'refused')
        ).rejects.toThrow();
        await expect(checkStep({ ...refused, result: 'null' }, 'refused')).rejects.toThrow(/refused/);
        // A store left out, or a graph engine's, is refused by the module's request, and needs no pair.
        await checkStep(
            { write: { value: BigInt(1) }, error: 'A write request gives the store: postgres, oracle or sqlite.' },
            'no store'
        );
        await expect(checkStep({ write: { store: 'sqlite', valu: BigInt(1) }, result: '1' }, 'write')).rejects.toThrow(
            /a write has the keys/
        );
        paired({ name: 'write', pairs, steps: [infinity] });
        expect(() =>
            paired({ name: 'write', pairs: { 'queries.yaml': ['Returning nodes and properties'] }, steps: [infinity] })
        ).toThrow(/runs on sqlite and writes/);
    });

    it('should fail a hold whose steps pass, and not hide the runner failing otherwise than the spec says', async () => {
        await expect(held(1, 'a held step', () => undefined)).rejects.toThrow(/held for #1, and passes/);
        await held(1, 'a held step', async () => checkStep({ ...add, result: '4' }, 'add'));
        await held(1, 'a held step', async () =>
            checkStep({ function: 'drivine_nothing', args: ['1'], result: '1' }, 'x')
        );
        await expect(held(1, 'a held step', async () => checkStep({ ...add, reslt: '3' }, 'add'))).rejects.toThrow(
            /a step has the keys/
        );
        await expect(
            held(1, 'a held step', () => {
                throw new TypeError('a crash');
            })
        ).rejects.toThrow(/a crash/);
    });
});

/** A step or a pairs check that gives, or fails, otherwise than the spec says. */
class Mismatch extends Error {}

/**
 * Runs `check`, which must fail where `issue` holds it: one held that passes fails, so its hold is taken off. Held only
 * where it fails as the spec says it does not: anything else the runner throws is thrown on, so that a hold does not hide
 * the runner's own crash.
 */
async function held(issue: number | undefined, where: string, check: () => Promise<void> | void): Promise<void> {
    if (issue === undefined) {
        await check();
        return;
    }
    let passed = false;
    try {
        await check();
        passed = true;
    } catch (e) {
        if (!(e instanceof Mismatch || (e as any)?.matcherResult !== undefined)) {
            throw e;
        }
    }
    if (passed) {
        throw new Error(`${where} is held for #${issue}, and passes: take the hold off (HELD).`);
    }
}

/** The step gives what it says, and is of a shape the spec's README gives. */
async function checkStep(step: Record<string, any>, where: string): Promise<void> {
    const keys = Object.keys(withoutNote(step)).sort();
    if (!SHAPES.some((shape) => sameKeys(shape, keys))) {
        throw new Error(`${where}: a step has the keys of one of ${JSON.stringify(SHAPES)}, and an optional note`);
    }
    if ('read' in step) {
        if (!sameKeys(READ, Object.keys(step.read))) {
            throw new Error(`${where}: a read has the keys ${JSON.stringify(READ)}`);
        }
        await checkRead(step.read, step.value, where);
        return;
    }
    if ('key' in step) {
        checkKey(step, where);
        return;
    }
    if ('write' in step) {
        checkWrite(step, where);
        return;
    }
    const db = openSqlite(':memory:');
    try {
        SqliteFunctions.register(db);
        checkFunction(db, step, where);
    } finally {
        db.close();
    }
}

/** The step's function, called with its `args`, gives its `result`; or, called on each of its `ascending`, ascends. */
function checkFunction(db: SqliteDatabase, step: Record<string, any>, where: string): void {
    const name: string = step.function;
    if (!FUNCTION.test(name)) {
        throw new Error(`${where}: no function of Drivine's`);
    }
    if ('ascending' in step) {
        const values = valuesFor(step.ascending, (it) => it) as SqliteValue[];
        if (values.length < 2) {
            throw new Error(`${where}: ascending has two values or more, each before the next`);
        }
        for (let i = 1; i < values.length; i++) {
            expect([where, call(db, `SELECT ${name}(?) < ${name}(?)`, [values[i - 1], values[i]])]).toEqual([
                where,
                BigInt(1)
            ]);
        }
        return;
    }
    const args = valuesFor(step.args, (it) => it) as SqliteValue[];
    const sql = `SELECT ${name}(${args.map(() => '?').join(', ')})`;
    if (!('error' in step)) {
        expect([where, call(db, sql, args)]).toEqual([where, valuesFor(step.result, (it) => it)]);
        return;
    }
    if (typeof step.error !== 'string') {
        throw new Error(`${where}: error is a text, not ${JSON.stringify(step.error, replacer)}`);
    }
    let failure: Mismatch | undefined;
    let gave: SqliteValue = null;
    try {
        gave = call(db, sql, args);
    } catch (e) {
        failure = e as Mismatch;
    }
    if (!failure) {
        throw new Mismatch(`${where}: fails with "${step.error}", but gave ${JSON.stringify(gave, replacer)}`);
    }
    // SQLite's own refusal to call it is the runner's, not the step's error: a held step mustn't count it as failing.
    if (RUNNER_ERRORS.some((it) => failure!.message.includes(it))) {
        throw new Error(failure.message);
    }
    expect([where, failure.message]).toEqual([where, expect.stringContaining(step.error)]);
}

/**
 * The step's `key`, the kind's word and canonical text of a temporal value, has the sort key `result`, a text of digits,
 * or null for a duration: as the module works it out (its `temporalKey` request), which every store's SQL gives.
 */
function checkKey(step: Record<string, any>, where: string): void {
    const key = step.key;
    if (typeof key !== 'object' || key === null || !sameKeys(KEY, Object.keys(key))) {
        throw new Error(`${where}: a key has the keys ${JSON.stringify(KEY)}`);
    }
    const answer = JSON.parse(
        cypherCompilerModule().compile(JSON.stringify({ temporalKey: { kind: key.kind, v: key.v } }))
    ) as { key?: string | null; error?: string };
    if (answer.error !== undefined) {
        throw new Mismatch(`${where}: ${answer.error}`);
    }
    expect([where, answer.key]).toEqual([where, step.result]);
}

/**
 * The step's `write`, a value written on a store, is the JSON text `result`, exactly, or is refused with the message
 * `error`, exactly: as a save writes the value on the store (writeLayout), its refusal the DrivineError a save throws. A
 * value is given as a save is given it: a float a {@link CypherFloat}, bytes a `Uint8Array`, a map with a key that
 * begins with `$` the map. A step that names no store a save writes in, or a temporal value, which a save here is given
 * only as a `Date`, in UTC, is the module's JSON request's, `{"write": <value>, "store": <store>}`, as the step gives it.
 */
function checkWrite(step: Record<string, any>, where: string): void {
    const write = step.write;
    if (
        typeof write !== 'object' ||
        write === null ||
        !(sameKeys(WRITE, Object.keys(write)) || sameKeys(['value'], Object.keys(write)))
    ) {
        throw new Error(
            `${where}: a write has the keys ${JSON.stringify(WRITE)}, the store's only where it is refused`
        );
    }
    const { written, refusal }: { written?: string; refusal?: string } = writtenBy(write);
    if ('error' in step) {
        if (typeof step.error !== 'string') {
            throw new Error(`${where}: error is a text, not ${JSON.stringify(step.error, replacer)}`);
        }
        if (refusal === undefined) {
            throw new Mismatch(`${where}: refused with "${step.error}", but wrote ${written}`);
        }
        expect([where, refusal]).toEqual([where, step.error]);
        return;
    }
    if (refusal !== undefined) {
        throw new Mismatch(`${where}: refused: ${refusal}`);
    }
    expect([where, written]).toEqual([where, step.result]);
}

/** The text a write step's value is written as on its store, or its refusal: see checkWrite. */
function writtenBy(write: { store?: string; value: any }): { written?: string; refusal?: string } {
    if (!WRITTEN_STORES.includes(write.store!) || temporal(write.value)) {
        return moduleWrite(write.value, write.store);
    }
    try {
        return { written: writeLayout(saved(write.value), write.store as SharedStore) };
    } catch (e) {
        if (!(e instanceof DrivineError)) {
            throw e;
        }
        return { refusal: e.message };
    }
}

/** The module's JSON request's write of `value` on `store`: its text, unparsed, as writeLayout reads it, or its refusal. */
function moduleWrite(value: any, store: string | undefined): { written?: string; refusal?: string } {
    const answer = cypherCompilerModule().compile(
        `{"write":${JSON.stringify(value, replacer)}${store === undefined ? '' : `,"store":${JSON.stringify(store)}`}}`
    );
    return answer.startsWith('{"value":')
        ? { written: answer.slice('{"value":'.length, -1) }
        : { refusal: JSON.parse(answer).error };
}

/** Whether a write step's value holds a temporal value, `{$temporal: <kind>, text: …}`, at any depth. */
function temporal(value: any): boolean {
    if (Array.isArray(value)) {
        return value.some(temporal);
    }
    return value !== null && typeof value === 'object' && ('$temporal' in value || Object.values(value).some(temporal));
}

/**
 * A write step's value as a save is given it: a whole number the number, or a `bigint` past 2^53; a float, `{$float:
 * "2.0"}` or a number the YAML gives, a {@link CypherFloat}, as the YAML reads each whole number as a `bigint`; bytes,
 * `{$bytes: "<base64>"}`, a `Uint8Array`; and `{$map: {…}}` the map it holds, its keys as they are.
 */
function saved(value: any): any {
    if (typeof value === 'bigint') {
        return Number.isSafeInteger(Number(value)) ? Number(value) : value;
    }
    if (typeof value === 'number') {
        return new CypherFloat(value);
    }
    if (Array.isArray(value)) {
        return value.map(saved);
    }
    if (value !== null && typeof value === 'object') {
        const [only, ...more] = Object.keys(value);
        const tag = more.length ? undefined : only;
        if (tag === '$float') {
            return new CypherFloat(Number(value.$float));
        }
        if (tag === '$bytes') {
            return new Uint8Array(Buffer.from(value.$bytes, 'base64'));
        }
        const map = tag === '$map' ? value.$map : value;
        return Object.fromEntries(Object.entries(map).map(([key, item]) => [key, saved(item)]));
    }
    return value;
}

/** The one value `sql` gives, run with `args`: a whole number as a bigint, so one SQLite holds as an integer is told from a real. */
function call(db: SqliteDatabase, sql: string, args: SqliteValue[]): SqliteValue {
    try {
        const statement = db.prepare(sql);
        statement.setReadBigInts(true);
        statement.setReturnArrays(true);
        return (statement.get(...(args as any[])) as unknown as SqliteValue[])[0];
    } catch (e) {
        // The function fails, where the spec gives what it gives.
        throw new Mismatch(`${sql}: ${(e as Error).message}`);
    }
}

/** The read's column, of a compiled statement's rows on its store, reads as `value`, as a connection gives it. */
async function checkRead(read: Read, value: any, where: string): Promise<void> {
    const text = column(read.column);
    const rows = await rowsOf(read.store, text, read.nonFinite, where);
    expect([where, rows]).toEqual([where, [valuesFor(value, Number)]]);
}

/** A column's text: a text, or a list of texts and `$repeat`s written one after the other. */
function column(value: any): string {
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((it) => valuesFor(it, String)).join('');
    }
    throw new Error(`No column text of ${JSON.stringify(value, replacer)}`);
}

/**
 * The rows a connection to `store` gives for a compiled statement whose one column holds `text`, as it reads a compiled
 * Cypher statement's: on SQLite, each text value read as JSON, on an in-memory database; on Postgres, a client that hands the text to
 * the type parser the statement runs with, `jsonb`'s, as `pg` does.
 */
async function rowsOf(store: string, text: string, nonFinite: boolean, where: string): Promise<any[]> {
    if (store === 'sqlite') {
        const db = openSqlite(':memory:');
        try {
            const connection = new SqliteConnection(db, new PostgresResultMapper(), 0, () => undefined);
            const compiled: CompiledSpecification<unknown> = {
                spec: new QuerySpecification({ text: 'SELECT ? AS result', language: 'SQL' }).bind([text]),
                setup: [],
                rows: 'one',
                nonFinite
            };
            return await compiledAs(connection, compiled);
        } finally {
            db.close();
        }
    }
    if (store === 'postgres') {
        const JSONB = 3802;
        const client = {
            query: async (config: any) => {
                const parser = config?.types?.getTypeParser(JSONB, 'text') ?? types.getTypeParser(JSONB, 'text');
                return Promise.resolve({ rows: [{ result: parser(text) }] });
            },
            getTypeParser: (oid: number, format?: any) => types.getTypeParser(oid, format),
            sessionId: 'host'
        };
        const compiled: CompiledSpecification<unknown> = {
            spec: new QuerySpecification({ text: 'SELECT $1 AS result', language: 'SQL' }),
            setup: [],
            rows: 'one',
            nonFinite
        };
        return compiledAs(new PostgresConnection(client as any, new PostgresResultMapper()), compiled);
    }
    throw new Error(`${where}: no reader for ${store}`);
}

/**
 * The case's pairs are cases of their files, and rely on its steps: one of them compiles on SQLite to SQL that calls
 * each function its steps call, one compiles on each store its steps read with the `nonFinite` each read step says, and,
 * for its `key` steps, one that compiles on SQLite makes a temporal value as the statement runs.
 */
function paired(hostCase: HostCase): void {
    const pairs = Object.entries(hostCase.pairs ?? {});
    if (pairsNothing(hostCase)) {
        return;
    }
    if (pairs.length === 0) {
        throw new Error(`${hostCase.name}: pairs no store case`);
    }
    const steps = pairs.flatMap(([file, names]) => {
        const cases = loadSpec(file).cases;
        return names.flatMap((name) => {
            const found = cases.find((it) => it.name === name);
            if (!found) {
                throw new Error(`${hostCase.name}: ${file} has no case "${name}"`);
            }
            return found.steps;
        });
    });
    const compiled = (store: string, compile: (cypher: string, parameters: Record<string, any>) => CompiledCypher) =>
        steps
            .filter((it) => runsOn(it, store))
            .flatMap((it) => {
                try {
                    return [compile(it.cypher, valuesFor(it.parameters ?? {}, Number))];
                } catch {
                    return [];
                }
            });
    let sqlite: CompiledCypher[] | undefined;
    const onSqlite = () =>
        (sqlite ??= compiled('sqlite', (cypher, parameters) =>
            new SharedCypherCompiler('sqlite', { name: 'g' }).compile(cypher, parameters)
        ));
    const functions = [...new Set(hostCase.steps.map((it) => it.function).filter(Boolean))];
    for (const name of functions) {
        const calls = name === 'regexp' ? holdsRegexp : (sql: string) => sql.includes(`${name}(`);
        if (!onSqlite().some((it) => calls(it.sql))) {
            throw new Mismatch(`${hostCase.name}: no step of its pairs compiles on SQLite to SQL that calls ${name}`);
        }
    }
    const reads = hostCase.steps.filter((it) => it.read).map((it) => it.read as Read);
    const wanted = [...new Set(reads.map((it) => `${it.store} ${it.nonFinite}`))];
    for (const pair of wanted) {
        const [store, nonFinite] = pair.split(' ');
        const statements =
            store === 'sqlite'
                ? onSqlite()
                : store === 'postgres'
                ? compiled('postgres', (cypher, parameters) =>
                      new SharedCypherCompiler('postgres', { name: 'g' }).compile(cypher, parameters)
                  )
                : undefined;
        if (!statements) {
            throw new Error(`${hostCase.name}: no compiler for ${store}`);
        }
        if (!statements.some((it) => String(it.nonFinite) === nonFinite)) {
            throw new Mismatch(
                `${hostCase.name}: no step of its pairs compiles on ${store} with nonFinite ${nonFinite}`
            );
        }
    }
    keyPaired(hostCase, steps);
    writePaired(hostCase, steps);
}

/**
 * For each store a `write` step names that a save writes in, one of the pairs' `steps` runs on the store and writes, by
 * `CREATE`, `MERGE` or `SET`: it binds its values as the step writes them, whether it compiles there or is refused. A step
 * with no store, or a graph engine's, is refused before any store is written, and needs no pair.
 */
function writePaired(hostCase: HostCase, steps: Record<string, any>[]): void {
    const stores = new Set(
        hostCase.steps
            .filter((it) => 'write' in it)
            .map((it) => it.write?.store)
            .filter((it) => WRITTEN_STORES.includes(it))
    );
    for (const store of stores) {
        if (!steps.some((it) => runsOn(it as any, store) && WRITES.test(String(it.cypher)))) {
            throw new Mismatch(`${hostCase.name}: no step of its pairs runs on ${store} and writes`);
        }
    }
}

/** Where the case has `key` steps, one of its pairs' `steps` compiles on SQLite and makes a temporal value as it runs. */
function keyPaired(hostCase: HostCase, steps: Record<string, any>[]): void {
    if (hostCase.steps.some((it) => 'key' in it) && !makesTemporalValue(steps)) {
        throw new Mismatch(
            `${hostCase.name}: no step of its pairs compiles on SQLite and makes a temporal value as the statement runs`
        );
    }
}

/**
 * Whether the case is of drivine_host_version's steps alone, with `pairs: {}`: no compiled statement calls it, as a library
 * calls it itself, once on each connection, so its steps need no pair.
 */
function pairsNothing(hostCase: HostCase): boolean {
    return (
        hostCase.pairs !== undefined &&
        Object.keys(hostCase.pairs).length === 0 &&
        hostCase.steps.every((it) => it.function === UNPAIRED)
    );
}

/** Whether one of `steps` compiles on SQLite and makes a temporal value as the statement runs, for a `key` step's pair. */
function makesTemporalValue(steps: Record<string, any>[]): boolean {
    return steps
        .filter((it) => runsOn(it as any, 'sqlite') && TEMPORAL_CALL.test(it.cypher))
        .some((it) => {
            try {
                new SharedCypherCompiler('sqlite', { name: 'g' }).compile(
                    it.cypher,
                    valuesFor(it.parameters ?? {}, Number)
                );
                return true;
            } catch {
                return false;
            }
        });
}

/** Whether `sql` holds SQLite's `REGEXP` operator, outside its quoted texts and names. */
function holdsRegexp(sql: string): boolean {
    return REGEXP_OPERATOR.test(sql.replace(QUOTED, ' '));
}

function withoutNote(step: Record<string, any>): Record<string, any> {
    return Object.fromEntries(Object.entries(step).filter(([key]) => key !== 'note'));
}

function sameKeys(expected: string[], actual: string[]): boolean {
    return expected.length === actual.length && expected.every((it) => actual.includes(it));
}

function replacer(_: string, value: any): any {
    return typeof value === 'bigint' ? value.toString() : value;
}
