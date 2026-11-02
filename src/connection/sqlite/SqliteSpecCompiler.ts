import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineError } from '@/DrivineError';
import type { SqliteValue } from '@/connection/sqlite/SqliteDriver';

/**
 * A named parameter, `$name`, as Postgres's compiler reads one: the longest name, so `$id` is not read in `$idList`.
 * SQLite reads `$name` itself, so the statement is run as it is written.
 */
const PARAMETER = /\$([\p{ID_Start}\p{Pc}]\p{ID_Continue}*)/gu;

/** A named parameter read as text, as a node's id is: `CAST($id AS TEXT)`. */
const TEXT_PARAMETER = /CAST\(\$([\p{ID_Start}\p{Pc}]\p{ID_Continue}*) AS TEXT\)/gu;

/**
 * A statement for SQLite, which reads `$name` parameters as they are written: only the names the statement uses are
 * bound, as SQLite refuses a value for a name it does not hold. A value is bound as SQLite holds one: a boolean as 1 or
 * 0, a date as ISO 8601 text, a list or a map as its JSON, as drivine4j's driver binds them.
 */
export class SqliteSpecCompiler extends QuerySpecificationCompiler {
    constructor(spec: QuerySpecification<any>) {
        super(spec);
        if (this.spec.statement.language !== 'SQL') {
            throw new DrivineError(
                `${this.spec.statement.language} is not run on SQLite: Cypher on SQLite comes with its compiler.`
            );
        }
    }

    formattedStatement(): string {
        return this.appliedStatement();
    }

    formattedParams(): Record<string, SqliteValue> | SqliteValue[] {
        if (Array.isArray(this.spec.parameters)) {
            return this.spec.parameters.map(sqliteValue);
        }
        const text = this.spec.statement.text;
        const used = new Set([...text.matchAll(PARAMETER)].map((it) => it[1]));
        const parameters = this.spec.parameters as Record<string, any>;
        return Object.fromEntries(
            Object.keys(parameters)
                .filter((key) => used.has(key))
                .map((key) => [key, readAsText(text, key) ? textValue(parameters[key]) : sqliteValue(parameters[key])])
        );
    }

    /** SQLite pages with `LIMIT … OFFSET …`, and an offset needs a limit before it: -1 for none. */
    protected appliedStatement(): string {
        const skip: number | undefined = this.spec._skip;
        const limit: number | undefined = this.spec._limit;
        const paging = skip ? `LIMIT ${limit || -1} OFFSET ${skip}` : limit ? `LIMIT ${limit}` : '';
        return `${this.spec.statement.text} ${paging}`;
    }
}

/** Whether the statement reads the parameter only as text, `CAST($name AS TEXT)`. */
function readAsText(text: string, name: string): boolean {
    const count = (pattern: RegExp): number => [...text.matchAll(pattern)].filter((it) => it[1] === name).length;
    return count(TEXT_PARAMETER) === count(PARAMETER);
}

/**
 * A value a statement reads as text: a number as the text JSON writes it, as a node's property holds it. node:sqlite
 * binds every number as a real, which SQLite writes as text with a fraction: 7 as `7.0`, which no id 7 is.
 */
function textValue(value: unknown): SqliteValue {
    return typeof value === 'number' && Number.isFinite(value) ? JSON.stringify(value) : sqliteValue(value);
}

/** A value as SQLite binds it. */
export function sqliteValue(value: unknown): SqliteValue {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') {
        return value;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value instanceof Uint8Array) {
        return value;
    }
    return JSON.stringify(value);
}
