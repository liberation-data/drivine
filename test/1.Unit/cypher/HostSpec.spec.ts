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
import { SharedCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { CompiledSpecification } from '@/cypher/CompiledSpecification';
import { loadSpec, runsOn, valuesFor } from '../../cypher/CypherSpec';
import { compiledAs } from '../../CompiledAs';

/**
 * The spec's `host.yaml` (test/cypher): what Drivine's own code does with the values compiled SQL hands it, with no
 * store, as drivine4j's `HostSpecTest` runs it. Each `function` step calls one of the functions Drivine registers on
 * SQLite, on an in-memory database; each `read` step reads a column's text as a connection reads a compiled
 * statement's rows. Each case's `pairs` name store cases of the other spec files whose statements rely on its steps:
 * one of them compiles on SQLite to SQL that calls each function its steps call, and one compiles on each store its
 * steps read with the `nonFinite` each read step says. The three libraries read the same file.
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

/** The keys of each kind of step, beside its optional `note`: a function's result, its order, and a read. */
const SHAPES = [
    ['function', 'args', 'result'],
    ['function', 'ascending'],
    ['read', 'value']
];
const READ = ['store', 'nonFinite', 'column'];
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

const spec: HostCase[] = parse(fs.readFileSync(path.join(__dirname, '../../cypher/host.yaml'), 'utf8'), {
    intAsBigInt: true
}).cases;

describe("The Cypher spec's host.yaml", () => {
    describe.each(spec.map((it) => [it.name, it] as const))('%s', (_, hostCase) => {
        const holds = HELD[hostCase.name] ?? [];
        const heldStep = (index: number) => holds.find((it) => it.steps?.includes(index + 1))?.issue;
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
    const result = call(db, `SELECT ${name}(${args.map(() => '?').join(', ')})`, args);
    expect([where, result]).toEqual([where, valuesFor(step.result, (it) => it)]);
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
 * each function its steps call, and one compiles on each store its steps read with the `nonFinite` each read step says.
 */
function paired(hostCase: HostCase): void {
    const pairs = Object.entries(hostCase.pairs ?? {});
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
