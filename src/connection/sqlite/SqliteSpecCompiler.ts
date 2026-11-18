import { QuerySpecificationCompiler } from '@/query/QuerySpecificationCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineError } from '@/DrivineError';
import type { SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { jsonText } from '@/utils/JsonText';
import { parameterNames, replaceParameters } from '@/utils/SqlParameters';

/**
 * A statement for SQLite, which reads `$name` parameters as they are written: only the names the statement uses outside
 * its quoted text are bound, as Postgres's compiler reads them (see [parameterNames]), as SQLite refuses a value for a
 * name it does not hold, such as the `t` of a quoted `'$."$t"'`. A value is bound as SQLite holds one: a boolean as 1 or
 * 0, a date as ISO 8601 text, a list or a map as its JSON, as drivine4j's driver binds them.
 */
export class SqliteSpecCompiler extends QuerySpecificationCompiler {
    constructor(spec: QuerySpecification<any>) {
        super(spec);
        if (this.spec.statement.language !== 'SQL') {
            throw new DrivineError(
                `${this.spec.statement.language} is not run on SQLite by a cursor: a Cypher statement is compiled for a query.`
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
        const used = parameterNames(text);
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

/**
 * Whether the statement reads the parameter only as text, as a node's id is, `CAST($name AS TEXT)`: a quoted `'$name'`
 * or `'CAST($name AS TEXT)'` is no reading.
 */
function readAsText(text: string, name: string): boolean {
    const marked = replaceParameters(text, (it) => (it === name ? '\u0000' : undefined));
    return marked.split('CAST(\u0000 AS TEXT)').length === marked.split('\u0000').length;
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
    return jsonText(value);
}
