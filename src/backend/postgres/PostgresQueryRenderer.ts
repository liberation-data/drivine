import { jsonValue, numberOf, textOf } from '@/backend/postgres/PostgresGraph';
import { PostgresViews } from '@/backend/postgres/PostgresViews';
import { Compared, SqlQueryRenderer } from '@/backend/sql/SqlQueryRenderer';
import { storedValue } from '@/backend/SaveStatementBuilder';
import { DrivineError } from '@/DrivineError';
import { RenderedQuery } from '@/dsl/QueryRenderer';
import { Query, QueryFn, WhereFn } from '@/dsl/Refs';
import { Scope } from '@/dsl/ModelScope';
import { TargetModel } from '@/model/RelationshipModel';
import { Stamps } from '@/model/Stamps';

/**
 * Writes a query on Postgres (see SqlQueryRenderer), as drivine4j writes one. A property is read with `->>`, as the
 * kind of the value it is compared with: a number only where one is stored, so `'7'` is not `7`, as on the graph
 * engines; a boolean as the text JSON writes it; anything else as text. A missing property is null, and meets no
 * comparison, as in Cypher. Nothing is written with Postgres's `?` operators, which a driver may take for a parameter.
 */
export class PostgresQueryRenderer extends SqlQueryRenderer {
    static render<T>(
        fn: QueryFn<T>,
        model: TargetModel,
        views: (depth: Record<string, number>) => PostgresViews,
        alias: string
    ): RenderedQuery {
        const { scope, query }: { scope: Scope; query: Query } = SqlQueryRenderer.made(fn, model);
        return new PostgresQueryRenderer(views(query.depth ?? {})).render(scope, query, alias);
    }

    static renderWhere<T>(
        fn: WhereFn<T>,
        model: TargetModel,
        views: PostgresViews,
        alias: string
    ): { where: string; bindings: Record<string, any> } {
        return new PostgresQueryRenderer(views).renderOnly(fn, model, alias);
    }

    protected property(compared: Compared): string {
        const { test, row, name, jsonPacked, path }: Compared = compared;
        if (test.kind !== 'COMPARE') {
            throw new DrivineError(`${path.join('.')} is a property, not a node.`);
        }
        const present = this.has(row, name);
        const operator = SQL_OPERATORS[test.operator as keyof typeof SQL_OPERATORS];
        if (operator) {
            return `${this.typed(compared, test.value)} ${operator} ${this.bind(this.scalar(test.value, jsonPacked))}`;
        }
        switch (test.operator) {
            case 'IN':
                return this.listed(compared, this.list(test.value, path)) ?? '1 = 0';
            case 'NOT_IN': {
                const any = this.listed(compared, this.list(test.value, path));
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
            `EXISTS (SELECT 1 FROM jsonb_array_elements_text(${row}.labels) l ` +
            `WHERE l.value IN (SELECT v FROM jsonb_array_elements_text(CAST(${this.bind(
                JSON.stringify(labels)
            )} AS jsonb)) v))`
        );
    }

    /** The property read as the kind of the cursor's value, as a comparison reads it. */
    protected seekTest(alias: string, property: string, operator: string, value: string): string {
        const read = isNumber(this.bindings[value.slice(1)]) ? numberOf(alias, property) : textOf(alias, property);
        return `${read} ${operator === '==' ? '=' : operator} ${value}`;
    }

    /** A boolean as the text JSON writes it, which is what `->>` reads it back as; a date as ISO 8601 text. */
    protected storable(value: unknown): unknown {
        return typeof value === 'boolean' ? String(value) : super.storable(value);
    }

    /**
     * A property no field declares the kind of is ordered as a number first and as text after, so a page of numbers is
     * in the order a seek with one of them compares in, and anything else in the order of its text. Where the order
     * places its nulls, it says so first: a text is null as a number.
     */
    protected orderedProperty(alias: string, property: string, direction: 'ASC' | 'DESC', nulls?: string): string {
        if (property === Stamps.PROPERTY) {
            return `${textOf(alias, property)} ${direction}${nulls ? ` NULLS ${nulls}` : ''}`;
        }
        const text = textOf(alias, property);
        const placed = nulls
            ? `CASE WHEN ${text} IS NULL THEN ${nulls === 'FIRST' ? 0 : 1} ELSE ${nulls === 'FIRST' ? 1 : 0} END, `
            : '';
        return `${placed}${numberOf(alias, property)} ${direction}, ${text} ${direction}`;
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
     * which nothing is among.
     */
    private listed(compared: Compared, values: unknown[]): string | undefined {
        if (!values.length) {
            return undefined;
        }
        const { row, name, jsonPacked }: Compared = compared;
        const numbers = !jsonPacked && values.every(isNumber);
        const read = numbers
            ? "CASE WHEN jsonb_typeof(v.value) = 'number' THEN (v.value #>> '{}')::numeric END"
            : "v.value #>> '{}'";
        const bound = this.bind(JSON.stringify(values.map((it) => this.scalar(it, jsonPacked))));
        return (
            `${numbers ? numberOf(row, name) : textOf(row, name)} IN ` +
            `(SELECT ${read} FROM jsonb_array_elements(CAST(${bound} AS jsonb)) v)`
        );
    }

    /** Whether the list property holds the item, compared as JSON, so a boolean is one and not its text. */
    private holds(row: string, name: string, item: unknown): string {
        return (
            `(jsonb_typeof(${jsonValue(row, name)}) = 'array' AND ${jsonValue(row, name)} @> ` +
            `CAST(${this.bind(JSON.stringify([item]))} AS jsonb))`
        );
    }

    /** A test of a property's text. */
    private textTest(operator: string, value: unknown, text: string): string {
        switch (operator) {
            case 'CONTAINS':
                return `strpos(${text}, ${this.text(value)}) > 0`;
            case 'STARTS_WITH':
                return `starts_with(${text}, ${this.text(value)})`;
            case 'ENDS_WITH': {
                const bound = this.text(value);
                return `right(${text}, length(${bound})) = ${bound}`;
            }
            case 'MATCHES':
                return this.matches(text, String(value));
            case 'CONTAINS_IGNORE_CASE':
                return `strpos(lower(${text}), ${this.text(String(value).toLowerCase())}) > 0`;
            default:
                return `lower(${text}) = ${this.text(String(value).toLowerCase())}`;
        }
    }

    /** A value bound as text: a function of text is not left to guess the type of a value bound without one. */
    private text(value: unknown): string {
        return `CAST(${this.bind(value === undefined || value === null ? null : String(value))} AS text)`;
    }

    /**
     * A regular expression that must match the whole value, as Cypher's `=~` does. A leading `(?i)` ignores case. It
     * is held to the whole value by a group that takes no number, so its own groups keep theirs and a backreference
     * names the group it was written for.
     */
    private matches(text: string, pattern: string): string {
        const ignoreCase = pattern.startsWith('(?i)');
        const body = ignoreCase ? pattern.slice(4) : pattern;
        return `${text} ${ignoreCase ? '~*' : '~'} ${this.text(`^(?:${body})$`)}`;
    }

    /** Whether the row has the property, and not as a JSON null. */
    private has(row: string, property: string): string {
        return property === Stamps.PROPERTY
            ? `${row}.stamp IS NOT NULL`
            : `COALESCE(jsonb_typeof(${jsonValue(row, property)}) <> 'null', FALSE)`;
    }
}

/** The comparisons SQL writes as an operator. */
const SQL_OPERATORS = { EQ: '=', NEQ: '<>', GT: '>', GTE: '>=', LT: '<', LTE: '<=' };

function isNumber(value: unknown): boolean {
    return typeof value === 'number' || typeof value === 'bigint';
}
