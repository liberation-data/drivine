import { hasProperty, jsonType, numberOf, path, textOf } from '@/backend/sqlite/SqliteGraph';
import { SqliteViews } from '@/backend/sqlite/SqliteViews';
import { Compared, SqlQueryRenderer } from '@/backend/sql/SqlQueryRenderer';
import { storedValue } from '@/backend/SaveStatementBuilder';
import { DrivineError } from '@/DrivineError';
import { RenderedQuery } from '@/dsl/QueryRenderer';
import { Query, QueryFn, WhereFn } from '@/dsl/Refs';
import { Scope } from '@/dsl/ModelScope';
import { TargetModel } from '@/model/RelationshipModel';
import { Stamps } from '@/model/Stamps';
import { jsonText } from '@/utils/JsonText';

/** The function each SQLite connection registers that lowers text as Unicode does: SQLite's `lower` lowers ASCII only. */
const LOWER = 'drivine_lower';

/**
 * Writes a query on SQLite (see SqlQueryRenderer), as on Postgres: a property is read as the kind of the value it is
 * compared with, a number only where one is stored, so `'7'` is not `7`, as on the graph engines; a boolean as the text
 * JSON writes it; anything else as the text Postgres's `->>` reads (see SqliteGraph's textOf). A missing property is
 * null, and meets no comparison, as in Cypher. Text is lowered by `drivine_lower`, and a regular expression is matched
 * by SQLite's `REGEXP`, both functions each connection registers.
 */
export class SqliteQueryRenderer extends SqlQueryRenderer {
    static render<T>(
        fn: QueryFn<T>,
        model: TargetModel,
        views: (depth: Record<string, number>) => SqliteViews,
        alias: string
    ): RenderedQuery {
        const { scope, query }: { scope: Scope; query: Query } = SqlQueryRenderer.made(fn, model);
        return new SqliteQueryRenderer(views(query.depth ?? {})).render(scope, query, alias);
    }

    static renderWhere<T>(
        fn: WhereFn<T>,
        model: TargetModel,
        views: SqliteViews,
        alias: string
    ): { where: string; bindings: Record<string, any> } {
        return new SqliteQueryRenderer(views).renderOnly(fn, model, alias);
    }

    protected property(compared: Compared): string {
        const { test, row, name, jsonPacked, path: written }: Compared = compared;
        if (test.kind !== 'COMPARE') {
            throw new DrivineError(`${written.join('.')} is a property, not a node.`);
        }
        const present = this.has(row, name);
        const operator = SQL_OPERATORS[test.operator as keyof typeof SQL_OPERATORS];
        if (operator) {
            return `${this.typed(compared, test.value)} ${operator} ${this.bind(this.scalar(test.value, jsonPacked))}`;
        }
        switch (test.operator) {
            case 'IN':
                return this.listed(compared, this.list(test.value, written)) ?? '1 = 0';
            case 'NOT_IN': {
                const any = this.listed(compared, this.list(test.value, written));
                return any ? `${present} AND NOT COALESCE(${any}, FALSE)` : present;
            }
            case 'HAS_ITEM':
                return this.holds(row, name, jsonPacked ? storedValue(test.value, true) : super.storable(test.value));
            case 'IS_NULL':
                return `NOT ${present}`;
            case 'IS_NOT_NULL':
                return present;
            default:
                return this.textTest(test.operator, test.value, textOf(row, name));
        }
    }

    protected anyLabel(row: string, labels: readonly string[]): string {
        return (
            `EXISTS (SELECT 1 FROM json_each(${row}.labels) l ` +
            `WHERE l.value IN (SELECT v.value FROM json_each(${this.bind(JSON.stringify(labels))}) v))`
        );
    }

    /** The property read as the kind of the cursor's value, as a comparison reads it. */
    protected seekTest(alias: string, property: string, operator: string, value: string): string {
        const read = isNumber(this.bindings[value.slice(1)]) ? numberOf(alias, property) : textOf(alias, property);
        return `${read} ${operator === '==' ? '=' : operator} ${value}`;
    }

    /** A boolean as the text JSON writes it, which is what a property read as text gives; a date as ISO 8601 text. */
    protected storable(value: unknown): unknown {
        return typeof value === 'boolean' ? String(value) : super.storable(value);
    }

    /**
     * A property no field declares the kind of is ordered as a number first and as text after, so a page of numbers is
     * in the order a seek with one of them compares in, and anything else in the order of its text. Where the order
     * places its nulls, it says so first: a text is null as a number. With none placed, nulls go where Postgres puts
     * them, last ascending and first descending: SQLite would put them first ascending.
     */
    protected orderedProperty(alias: string, property: string, direction: 'ASC' | 'DESC', nulls?: string): string {
        const placed = (place?: string): string => ` NULLS ${place ?? (direction === 'ASC' ? 'LAST' : 'FIRST')}`;
        if (property === Stamps.PROPERTY) {
            return `${textOf(alias, property)} ${direction}${placed(nulls)}`;
        }
        const text = textOf(alias, property);
        const first = nulls
            ? `CASE WHEN ${text} IS NULL THEN ${nulls === 'FIRST' ? 0 : 1} ELSE ${nulls === 'FIRST' ? 1 : 0} END, `
            : '';
        return `${first}${numberOf(alias, property)} ${direction}${placed()}, ${text} ${direction}${placed()}`;
    }

    protected read(alias: string, property: string, as: 'NUMBER' | 'TEXT'): string {
        return as === 'NUMBER' && property !== Stamps.PROPERTY ? numberOf(alias, property) : textOf(alias, property);
    }

    protected present(alias: string, property: string): string {
        return this.has(alias, property);
    }

    /** The property read as the kind of the value it is compared with: a number as one, anything else as text. */
    private typed(compared: Compared, value: unknown): string {
        return isNumber(value) && !compared.jsonPacked
            ? numberOf(compared.row, compared.name)
            : textOf(compared.row, compared.name);
    }

    /** A value as the property holds it: packed into JSON text where the property is, and as `storable` writes it. */
    private scalar(value: unknown, jsonPacked: boolean): unknown {
        return this.storable(jsonPacked ? storedValue(value, true) : value);
    }

    /**
     * Whether the property is among the values, read as numbers where every value is one: undefined for no values,
     * which nothing is among. Each value of the bound list is read as a property of that kind is.
     */
    private listed(compared: Compared, values: unknown[]): string | undefined {
        if (!values.length) {
            return undefined;
        }
        const { row, name, jsonPacked }: Compared = compared;
        const numbers = !jsonPacked && values.every(isNumber);
        const read = numbers
            ? `(CASE WHEN v.type IN ('integer', 'real') THEN v.value END)`
            : `(CASE v.type WHEN 'text' THEN v.value WHEN 'null' THEN NULL WHEN 'true' THEN 'true' ` +
              `WHEN 'false' THEN 'false' WHEN 'integer' THEN json_quote(v.value) WHEN 'real' THEN json_quote(v.value) ` +
              `ELSE v.value END)`;
        const bound = this.bind(jsonText(values.map((it) => this.scalar(it, jsonPacked))));
        return `${numbers ? numberOf(row, name) : textOf(row, name)} IN (SELECT ${read} FROM json_each(${bound}) v)`;
    }

    /**
     * Whether the list property holds the item, as Postgres's `@>` says an array holds an element: of the same JSON
     * type, a number of either kind, and equal. The item is bound as the one-item array of it, so it is read as JSON
     * reads it, and a boolean is one and not its text.
     */
    private holds(row: string, name: string, item: unknown): string {
        const elements = `json_each(${row}.props, ${path(name)}) h, json_each(${this.bind(jsonText([item]))}) b`;
        const sameType = `(h.type = b.type OR (h.type IN ('integer', 'real') AND b.type IN ('integer', 'real')))`;
        return (
            `(${jsonType(row, name)} = 'array' AND EXISTS (SELECT 1 FROM ${elements} WHERE ${sameType} ` +
            `AND h.value IS b.value))`
        );
    }

    /** A test of a property's text. */
    private textTest(operator: string, value: unknown, text: string): string {
        switch (operator) {
            case 'CONTAINS':
                return `instr(${text}, ${this.text(value)}) > 0`;
            case 'STARTS_WITH': {
                const bound = this.text(value);
                return `substr(${text}, 1, length(${bound})) = ${bound}`;
            }
            case 'ENDS_WITH': {
                // `substr(t, -0)` is not the empty end of t, so an empty suffix is said to end every text.
                const bound = this.text(value);
                return `(length(${bound}) = 0 AND ${text} IS NOT NULL OR substr(${text}, -length(${bound})) = ${bound})`;
            }
            case 'MATCHES':
                return this.matches(text, String(value));
            case 'CONTAINS_IGNORE_CASE':
                return `instr(${LOWER}(${text}), ${this.text(String(value).toLowerCase())}) > 0`;
            // A lowercased copy, compared with the value as SQLite lowercases it: see LowerCopies.
            case 'EQ_LOWERED':
                return `${text} = ${LOWER}(${this.text(value)})`;
            case 'CONTAINS_LOWERED':
                return `instr(${text}, ${LOWER}(${this.text(value)})) > 0`;
            default:
                return `${LOWER}(${text}) = ${this.text(String(value).toLowerCase())}`;
        }
    }

    /** A value bound as text: a function of text is not left to guess the type of a value bound without one. */
    private text(value: unknown): string {
        return `CAST(${this.bind(value === undefined || value === null ? null : String(value))} AS TEXT)`;
    }

    /**
     * A regular expression that must match the whole value, as Cypher's `=~` does. A leading `(?i)` ignores case. It
     * is held to the whole value by a group that takes no number, so its own groups keep theirs. SQLite has no regular
     * expressions of its own: `REGEXP` calls the function each connection registers, which reads JavaScript's.
     */
    private matches(text: string, pattern: string): string {
        const ignoreCase = pattern.startsWith('(?i)');
        const body = ignoreCase ? pattern.slice(4) : pattern;
        return `${text} REGEXP ${this.text(`${ignoreCase ? '(?i)' : ''}^(?:${body})$`)}`;
    }

    /** Whether the row has the property, and not as a JSON null. */
    private has(row: string, property: string): string {
        return property === Stamps.PROPERTY
            ? hasProperty(row, property)
            : `COALESCE(${jsonType(row, property)} <> 'null', FALSE)`;
    }
}

/** The comparisons SQL writes as an operator. */
const SQL_OPERATORS = { EQ: '=', NEQ: '<>', GT: '>', GTE: '>=', LT: '<', LTE: '<=' };

function isNumber(value: unknown): boolean {
    return typeof value === 'number' || typeof value === 'bigint';
}
