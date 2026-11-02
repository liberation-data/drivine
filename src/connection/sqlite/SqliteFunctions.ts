import { SqliteGraph, hasLabels, path, textOf } from '@/backend/sqlite/SqliteGraph';
import { Stopped } from '@/backend/sqlite/PlanStopped';
import { SqlitePlanWriter } from '@/backend/sqlite/SqlitePlanWriter';
import { SqliteStatements } from '@/backend/sqlite/SqliteStatements';
import { WriteReturns } from '@/backend/sql/WritePlan';
import { LowerCopies } from '@/model/LowerCopies';
import type { SqliteDatabase, SqliteValue } from '@/connection/sqlite/SqliteDriver';

/**
 * The functions Drivine registers on each connection to a SQLite store, which its statements call, by drivine4j's
 * names, so a statement one library writes runs on a connection the other opened:
 *
 * - `drivine_write(graph, plan, shapes, mark, returns, patched_if)` carries out a plan of steps (see SqlitePlanWriter);
 * - `drivine_delete(graph, nids)` deletes the nodes a statement selected, and counts them;
 * - `drivine_lower_copies(graph, label, property, batch)` fills in the lowercased copies of a property;
 * - `drivine_similarity(embedding, vector, similarity)` scores an embedding against a vector;
 * - `drivine_regexp_count(text, expression)` counts a regular expression's matches, and `regexp` is SQLite's `REGEXP`;
 * - `drivine_lower(text)` lowers text as Unicode does: SQLite's own `lower` lowers only ASCII;
 * - `drivine_epoch(text)` reads a moment as nanoseconds since the epoch, so moments compare exactly.
 *
 * A function that reads only its arguments is registered as deterministic, so SQLite may index an expression over it.
 * The ones Cypher compiled to SQLite's SQL calls come with that compiler.
 */
export const SqliteFunctions = {
    WRITE: 'drivine_write',
    DELETE: 'drivine_delete',
    LOWER_COPIES: 'drivine_lower_copies',
    SIMILARITY: 'drivine_similarity',
    REGEXP_COUNT: 'drivine_regexp_count',
    LOWER: 'drivine_lower',
    EPOCH: 'drivine_epoch',
    REGEXP: 'regexp',

    /** Registers every function on `db`, for the statements run on it. */
    register(db: SqliteDatabase): void {
        const statements = new SqliteStatements(db);
        const patterns = new Patterns();
        // A function's arity is the number of parameters its JavaScript function declares.
        db.function(SqliteFunctions.WRITE, {}, (graph, plan, shapes, mark, returns, patchedIf) =>
            write(statements, [graph, plan, shapes, mark, returns, patchedIf])
        );
        db.function(SqliteFunctions.DELETE, {}, (graph, nids) => {
            if (nids == null) {
                return 0;
            }
            return statements.update(
                `DELETE FROM ${new SqliteGraph(required(graph, 'drivine_delete names no graph.')).nodes} ` +
                    `WHERE nid IN (SELECT value FROM json_each(?))`,
                nids
            );
        });
        db.function(SqliteFunctions.LOWER_COPIES, {}, (graph, label, property, batch) =>
            lowerCopies(
                statements,
                required(graph, 'no graph'),
                required(label, 'no label'),
                required(property, 'no property'),
                Number(batch)
            )
        );
        const score = similarity();
        db.function(SqliteFunctions.SIMILARITY, { deterministic: true }, (embedding, vector, kind) =>
            score(embedding, vector, kind)
        );
        db.function(SqliteFunctions.REGEXP_COUNT, { deterministic: true }, (text, expression) => {
            if (text == null || expression == null) {
                return 0;
            }
            return String(text).match(patterns.of(String(expression), 'g'))?.length ?? 0;
        });
        db.function(SqliteFunctions.REGEXP, { deterministic: true }, (expression, text) => {
            if (expression == null || text == null) {
                return null;
            }
            return patterns.of(String(expression), '').test(String(text)) ? 1 : 0;
        });
        db.function(SqliteFunctions.LOWER, { deterministic: true }, (text) =>
            text == null ? null : String(text).toLowerCase()
        );
        db.function(SqliteFunctions.EPOCH, { deterministic: true }, (text) =>
            text == null ? null : epoch(String(text).trim())
        );
    }
};

function required(value: SqliteValue, because: string): string {
    if (value == null) {
        throw new Error(because);
    }
    return String(value);
}

/** The savepoint a plan runs within, so a plan that fails or stops is rolled back to where it began. */
const SAVEPOINT = 'drivine_write';

/**
 * `drivine_write`: carries out a plan on the graph, as `<graph>_write` does on Postgres, and gives back a JSON array of
 * what `returns` asks. It runs the steps' SQL on the connection the statement runs on, in its transaction, within a
 * savepoint of its own: a plan that fails, or finds its root stale, is rolled back, so a save is applied whole or not
 * at all, with or without a transaction around it. A stale root gives nothing back; a node a `ref` step needs that is
 * not there counts nothing.
 */
function write(statements: SqliteStatements, args: SqliteValue[]): string {
    const [graph, plan, shapes, mark, returns, patchedIf] = args;
    const writer = new SqlitePlanWriter(
        new SqliteGraph(required(graph, 'drivine_write names no graph.')),
        statements,
        required(plan, 'drivine_write has no plan.'),
        shapes == null ? '[]' : String(shapes),
        required(mark, 'drivine_write has no mark.'),
        patchedIf == null ? null : String(patchedIf)
    );
    const asked = required(returns, 'drivine_write is not told what to return.') as WriteReturns;
    statements.run(`SAVEPOINT ${SAVEPOINT}`);
    let given: (string | number)[];
    try {
        given = writer.write(asked);
        statements.run(`RELEASE ${SAVEPOINT}`);
    } catch (failure) {
        try {
            statements.run(`ROLLBACK TO ${SAVEPOINT}`);
            statements.run(`RELEASE ${SAVEPOINT}`);
        } catch {
            // The failure that stopped the plan is the one to give.
        }
        if (!(failure instanceof Stopped)) {
            throw failure;
        }
        given = asked === 'COUNT' ? [failure.count] : [];
    }
    return JSON.stringify(given);
}

/**
 * `drivine_lower_copies`: writes the lowercased copy of `property` on at most `batch` nodes of `label` whose copy is not
 * the property lowercased, removes it from those whose property has no value, and gives how many nodes it wrote.
 */
function lowerCopies(
    statements: SqliteStatements,
    name: string,
    label: string,
    property: string,
    batch: number
): number {
    const graph = new SqliteGraph(name);
    const copy = path(LowerCopies.of(property));
    const lowered = (alias: string): string => `${SqliteFunctions.LOWER}(${textOf(alias, property)})`;
    return statements.update(
        [
            `UPDATE ${graph.nodes} AS n`,
            `SET props = CASE WHEN ${textOf('n', property)} IS NULL THEN json_remove(n.props, ${copy}) ` +
                `ELSE json_set(n.props, ${copy}, ${lowered('n')}) END`,
            `WHERE n.nid IN (`,
            `    SELECT m.nid FROM ${graph.nodes} m`,
            `    WHERE ${hasLabels('m', [label])} AND ${textOf('m', LowerCopies.of(property))} IS NOT ${lowered('m')}`,
            `    LIMIT ?)`
        ].join('\n'),
        batch
    );
}

/**
 * `drivine_similarity(embedding, vector, similarity)`: the score of the embedding against the vector, each a JSON array
 * of numbers, by `COSINE` or `EUCLIDEAN`, as the graph engines score it: `(1 + cos) / 2`, and `1 / (1 + d²)`. Null where
 * either is not an array of numbers, where they differ in size, or where a cosine is asked of a vector with no length.
 * Every row of a search is measured against the same vector, so the last one read is kept.
 */
function similarity(): (...args: SqliteValue[]) => SqliteValue {
    let lastText: string | undefined;
    let last: number[] | undefined;
    return (embeddingText, vectorText, kind) => {
        const embedding = embeddingText == null ? undefined : vector(String(embeddingText));
        const text = vectorText == null ? undefined : String(vectorText);
        if (text !== lastText) {
            last = text === undefined ? undefined : vector(text);
            lastText = text;
        }
        if (!embedding || !last || embedding.length !== last.length) {
            return null;
        }
        return kind === 'EUCLIDEAN' ? euclidean(embedding, last) : cosine(embedding, last);
    };
}

/** `1 / (1 + d²)`, `d` the distance between `a` and `b`. */
function euclidean(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return 1 / (1 + sum);
}

/** `(1 + cos) / 2` of the angle between `a` and `b`; null where either has no length, and so no direction. */
function cosine(a: number[], b: number[]): number | null {
    let dot = 0;
    let lengthA = 0;
    let lengthB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        lengthA += a[i] * a[i];
        lengthB += b[i] * b[i];
    }
    if (lengthA === 0 || lengthB === 0) {
        return null;
    }
    return (1 + dot / (Math.sqrt(lengthA) * Math.sqrt(lengthB))) / 2;
}

/** The JSON text as numbers, when it is an array of numbers and nothing else. */
function vector(text: string): number[] | undefined {
    try {
        const value = JSON.parse(text);
        return Array.isArray(value) && value.every((it) => typeof it === 'number') ? value : undefined;
    } catch {
        return undefined;
    }
}

/**
 * A moment as Java's ISO parsers read one: `T` and `Z` in either case, a fraction after a point alone, and an offset,
 * if any, of hours alone or with minutes and seconds, ending its text.
 */
const ZONED =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{0,9}))?)?(Z|[+-]\d{2}(?::\d{2}(?::\d{2})?)?)?$/i;

/**
 * `drivine_epoch(text)`: the moment the text names, as nanoseconds since the epoch, an integer; null for text that names
 * no moment. A moment with an offset or `Z` is the instant it is; a date-time with none is read as if at UTC, so two of
 * them compare as their clocks do. SQLite's own `unixepoch(…, 'subsec')` keeps milliseconds, and a clock can give more.
 */
function epoch(text: string): bigint | null {
    const match = ZONED.exec(text);
    if (!match) {
        return null;
    }
    const [, year, month, day, hour, minute, second = '0', fraction = '', zone] = match;
    const [y, mo, d, h, mi, s] = [year, month, day, hour, minute, second].map(Number);
    // Set field by field, not by Date.UTC, which reads a year below 100 as one of the 1900s, which an integer holds.
    const date = new Date(0);
    date.setUTCFullYear(y, mo - 1, d);
    // A day or a time that is not on the clock, as 30 February or 24:00, names no moment, as in Java's reading.
    if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
        return null;
    }
    const offset = offsetSeconds(zone);
    if (offset === null) {
        return null;
    }
    date.setUTCHours(h, mi, s, 0);
    const seconds = BigInt(date.getTime() / 1000) - BigInt(offset);
    const whole = seconds * BigInt(1_000_000_000);
    const nanos = whole + BigInt(fraction.padEnd(9, '0'));
    // An integer of nanoseconds holds the moments from 1677 to 2262, as drivine4j's: none outside them. Its whole
    // seconds must fit before the fraction is added, as in Java's multiplyExact: none before 1677-09-21T00:12:44Z.
    return whole >= MIN_INTEGER && nanos <= MAX_INTEGER ? nanos : null;
}

/** The least and the greatest integer SQLite holds. */
const MIN_INTEGER = BigInt('-9223372036854775808');
const MAX_INTEGER = BigInt('9223372036854775807');

/** The largest offset Java takes, ±18:00. */
const MAX_OFFSET_SECONDS = 18 * 3600;

/**
 * The seconds a moment's offset, `Z` or `±hh[:mm[:ss]]`, is ahead of UTC: none where it gives none, and null for one
 * Java refuses, past ±18:00 or with minutes or seconds over 59.
 */
function offsetSeconds(zone: string | undefined): number | null {
    if (!zone || zone.toUpperCase() === 'Z') {
        return 0;
    }
    const [h, m = 0, sec = 0] = zone.slice(1).split(':').map(Number);
    const seconds = h * 3600 + m * 60 + sec;
    if (m > 59 || sec > 59 || seconds > MAX_OFFSET_SECONDS) {
        return null;
    }
    return zone.startsWith('-') ? -seconds : seconds;
}

/**
 * The POSIX classes a bracket expression may name, as JavaScript's Unicode expressions name them: the same classes as
 * drivine4j's, Java's with UNICODE_CHARACTER_CLASS, so a letter is any alphabetic character, a vowel sign among them.
 */
const POSIX: [string, string][] = [
    ['[:alnum:]', '\\p{Alphabetic}\\p{Nd}'],
    ['[:alpha:]', '\\p{Alphabetic}'],
    ['[:digit:]', '\\p{Nd}'],
    ['[:space:]', '\\p{White_Space}'],
    ['[:upper:]', '\\p{Uppercase}'],
    ['[:lower:]', '\\p{Lowercase}'],
    ['[:punct:]', '\\p{P}']
];

/**
 * The regular expressions the functions of one connection have read, compiled once each: a search asks the same few of
 * every node it reads. A class written as POSIX names it, `[:alnum:]`, is the same class, of letters and digits in any
 * script, as on a Postgres database whose text is Unicode, so a full-text search written for Postgres reads alike here.
 */
class Patterns {
    private static readonly MAX = 256;
    private readonly compiled = new Map<string, RegExp>();

    of(expression: string, flags: string): RegExp {
        const key = `${flags}/${expression}`;
        let found = this.compiled.get(key);
        if (!found) {
            // A leading `(?i)` ignores case, as Cypher's `=~` reads it, and `\z` is the end of the text, as Java writes it.
            const ignoreCase = expression.startsWith('(?i)');
            const source = POSIX.reduce(
                (text, [posix, js]) => text.split(posix).join(js),
                (ignoreCase ? expression.slice(4) : expression).replace(/\\z/g, '$')
            );
            found = new RegExp(source, `u${flags}${ignoreCase ? 'i' : ''}`);
            if (this.compiled.size >= Patterns.MAX) {
                this.compiled.delete(this.compiled.keys().next().value!);
            }
            this.compiled.set(key, found);
        }
        found.lastIndex = 0;
        return found;
    }
}
