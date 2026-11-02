import { holding, jsonKey, labelledValue } from '@/backend/oracle/OracleGraph';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { Compared, SqlQueryRenderer } from '@/backend/sql/SqlQueryRenderer';
import { storedValue } from '@/backend/SaveStatementBuilder';
import { DrivineError } from '@/DrivineError';
import { RenderedQuery } from '@/dsl/QueryRenderer';
import { Query, QueryFn, Test, WhereFn } from '@/dsl/Refs';
import { Scope } from '@/dsl/ModelScope';
import { FragmentModel } from '@/model/FragmentModel';
import { TargetModel } from '@/model/RelationshipModel';
import { Stamps } from '@/model/Stamps';
import { SchemaItem } from '@/schema/SchemaGrammar';

/**
 * Writes a query on Oracle (see SqlQueryRenderer). A property is tested in a JSON path filter against a bound value
 * (`JSON_EXISTS(props, '$?(@."k" > $v)' PASSING …)`), so numbers, text and booleans compare as their JSON types and a
 * missing property meets no comparison, as in Cypher.
 *
 * Oracle takes a test of a node's labels for a lookup of one row, so it reads a label's nodes even where a range
 * index or a uniqueness constraint would find a few (drivine4j#65). So a comparison with text that every root meets,
 * of a property such an index of one of the root's labels begins with, is also written as the index's expression,
 * which Oracle reads through the index: see `throughIndex`.
 */
export class OracleQueryRenderer extends SqlQueryRenderer {
    /** The root's labels whose test a comparison makes, through a labelled index. */
    private readonly tested = new Set<string>();

    static render<T>(
        fn: QueryFn<T>,
        model: TargetModel,
        views: (depth: Record<string, number>) => OracleViews,
        alias: string,
        indexed: SchemaItem[] = []
    ): RenderedQuery {
        const { scope, query }: { scope: Scope; query: Query } = SqlQueryRenderer.made(fn, model);
        const root = model.kind === 'GRAPH_VIEW' ? model.model.root : (model.model as FragmentModel);
        const renderer = new OracleQueryRenderer(views(query.depth ?? {}), { alias, labels: root.labels, indexed });
        return renderer.render(scope, query, alias);
    }

    static renderWhere<T>(
        fn: WhereFn<T>,
        model: TargetModel,
        views: OracleViews,
        alias: string
    ): { where: string; bindings: Record<string, any> } {
        return new OracleQueryRenderer(views).renderOnly(fn, model, alias);
    }

    /**
     * @param root the root's row, its labels, and the indexes a comparison of one of its properties may be read
     * through. Without them, none is.
     */
    constructor(
        views: OracleViews,
        private readonly root: { alias: string; labels: string[]; indexed: SchemaItem[] } = {
            alias: '',
            labels: [],
            indexed: []
        }
    ) {
        super(views);
    }

    protected labelsTested(): string[] {
        return [...this.tested];
    }

    /** A test of a property: of the root, every root meeting it when `top`, read through an index where it can be. */
    protected property(compared: Compared, top: boolean): string {
        const { test, row, onRelationship, name, jsonPacked, path }: Compared = compared;
        const column = onRelationship ? `${row}.props` : holding(row, name);
        const indexed =
            top && !onRelationship && row === this.root.alias ? this.throughIndex(test, name, jsonPacked) : undefined;
        const tested = this.compare(test, column, name, jsonPacked, path);
        return indexed ? `${indexed} AND ${tested}` : tested;
    }

    protected anyLabel(row: string, labels: readonly string[]): string {
        const passing = labels.map((label, i) => `${this.bind(label)} AS "l${i}"`).join(', ');
        const filter = labels.map((_, i) => `@ == $l${i}`).join(' || ');
        return `JSON_EXISTS(${row}.labels, '$?(${filter})' PASSING ${passing})`;
    }

    /** Each a JSON path filter, so the cursor's values compare as their JSON types. */
    protected seekTest(alias: string, property: string, operator: string, value: string): string {
        return `JSON_EXISTS(${holding(alias, property)}, '$?(@${jsonKey(
            property
        )} ${operator} $v)' PASSING ${value} AS "v")`;
    }

    /** A property by its JSON type: numbers as numbers. */
    protected orderedProperty(alias: string, property: string, direction: 'ASC' | 'DESC', nulls?: string): string {
        return (
            `JSON_QUERY(${holding(alias, property)}, '$${jsonKey(property)}' RETURNING JSON)` +
            `${direction === 'DESC' ? ' DESC' : ''}${nulls ? ` NULLS ${nulls}` : ''}`
        );
    }

    protected read(alias: string, property: string, as: 'NUMBER' | 'TEXT'): string {
        const k = jsonKey(property);
        return as === 'NUMBER'
            ? `JSON_VALUE(${holding(alias, property)}, '$${k}' RETURNING NUMBER)`
            : `JSON_VALUE(${holding(alias, property)}, '$${k}')`;
    }

    protected present(alias: string, property: string): string {
        return `JSON_EXISTS(${holding(alias, property)}, '$?(@${jsonKey(property)} != null)')`;
    }

    /**
     * The comparison of the root's property `name` with text as the expression of a range index or a uniqueness
     * constraint of one of the root's labels that begins with the property, the first label with one: undefined where
     * there is none, or where the comparison isn't `eq`, `gt`, `gte`, `lt`, `lte` or an equality with a lowercased copy
     * (see LowerCopies), with text of at most 4,000 bytes.
     *
     * It is written beside the JSON test, which still decides: the expression is the property as text, so it holds of
     * every node the test holds of, and of a number written as the same text too. It is null for a node without the
     * label, so it tests the label, and the statement needn't (see labelsTested).
     */
    private throughIndex(test: Test, name: string, jsonPacked: boolean): string | undefined {
        if (test.kind !== 'COMPARE' || jsonPacked || name === Stamps.PROPERTY) {
            return undefined;
        }
        const lowered = test.operator === 'EQ_LOWERED';
        const operator = lowered ? '=' : SQL_OPERATORS[test.operator as keyof typeof SQL_OPERATORS];
        const value = this.storable(test.value);
        if (!operator || typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 4000) {
            return undefined;
        }
        const label = this.root.labels.find((it) =>
            this.root.indexed.some((item) => item.label === it && item.properties[0] === name)
        );
        if (!label) {
            return undefined;
        }
        this.tested.add(label);
        // A lowercased copy is compared with the value as Oracle lowercases it, as the test beside it does.
        const bound = lowered ? `LOWER(${this.bind(value)})` : this.bind(value);
        return `${labelledValue(this.root.alias, label, name)} ${operator} ${bound}`;
    }

    /** A test of the property `name` of the JSON column `column`. */
    private compare(test: Test, column: string, name: string, jsonPacked: boolean, path: readonly string[]): string {
        if (test.kind !== 'COMPARE') {
            throw new DrivineError(`${path.join('.')} is a property, not a node.`);
        }
        const k = jsonKey(name);
        const packed = (value: unknown): unknown => this.storable(jsonPacked ? storedValue(value, true) : value);
        const filter = (expression: string, values: unknown[]): string => {
            const passing = values.map((value, i) => `${this.bind(packed(value))} AS "v${i}"`).join(', ');
            return `JSON_EXISTS(${column}, '$?(${expression})'${passing ? ` PASSING ${passing}` : ''})`;
        };
        const present = `JSON_EXISTS(${column}, '$?(@${k} != null)')`;
        const operator = PATH_OPERATORS[test.operator as keyof typeof PATH_OPERATORS];
        if (operator) {
            return filter(`@${k} ${operator} $v0`, [test.value]);
        }
        switch (test.operator) {
            case 'IN':
            case 'NOT_IN': {
                const values = this.list(test.value, path);
                const any = values.length
                    ? filter(values.map((_, i) => `@${k} == $v${i}`).join(' || '), values)
                    : '1 = 0';
                return test.operator === 'IN' ? any : `${present} AND NOT ${any}`;
            }
            case 'HAS_ITEM':
                return `JSON_EXISTS(${column}, '$${k}[*]?(@ == $v0)' PASSING ${this.bind(packed(test.value))} AS "v0")`;
            case 'IS_NULL':
                return `NOT ${present}`;
            case 'IS_NOT_NULL':
                return present;
            default:
                return this.compareText(test.operator, test.value, `JSON_VALUE(${column}, '$${k}')`);
        }
    }

    /** A test of a property's text. */
    private compareText(operator: string, value: unknown, text: string): string {
        switch (operator) {
            case 'CONTAINS':
                return `INSTR(${text}, ${this.bind(value)}) > 0`;
            case 'STARTS_WITH':
                return `INSTR(${text}, ${this.bind(value)}) = 1`;
            case 'ENDS_WITH': {
                const bound = this.bind(value);
                return `SUBSTR(${text}, -LENGTH(${bound})) = ${bound}`;
            }
            case 'MATCHES':
                return this.matches(text, String(value));
            case 'CONTAINS_IGNORE_CASE':
                return `INSTR(LOWER(${text}), ${this.bind(String(value).toLowerCase())}) > 0`;
            // A lowercased copy, compared with the value as Oracle lowercases it: see LowerCopies.
            case 'EQ_LOWERED':
                return `${text} = LOWER(${this.bind(String(value))})`;
            case 'CONTAINS_LOWERED':
                return `INSTR(${text}, LOWER(${this.bind(String(value))})) > 0`;
            default:
                return `LOWER(${text}) = ${this.bind(String(value).toLowerCase())}`;
        }
    }

    /**
     * A regular expression that must match the whole value, as Cypher's `=~` does. A leading `(?i)` ignores case. The
     * expression itself is Oracle's, in the POSIX dialect: what Java adds to it, such as `(?:…)`, a look-around or `\b`,
     * is not read, and a flag anywhere but the start is not either.
     *
     * The expression is anchored in a group of its own, which POSIX can only write as one that captures: so each group
     * the caller wrote is one further on, and a backreference to it is renumbered to match (see {@link renumbered}).
     * It ends at `\z`, the value's end, as Oracle's `$` also matches before a line break that ends it.
     */
    private matches(text: string, pattern: string): string {
        const ignoreCase = pattern.startsWith('(?i)');
        const body = renumbered(ignoreCase ? pattern.slice(4) : pattern);
        return `REGEXP_LIKE(${text}, ${this.bind(`^(${body})\\z`)}${ignoreCase ? ", 'i'" : ''})`;
    }
}

/**
 * `body` with each backreference, `\1` to `\8`, one higher, for the group that anchors it is the first. An escaped
 * backslash is no backreference, nor is a backslash inside a bracket expression, where POSIX reads it as itself. `\9`
 * would need a tenth group, which POSIX does not have, and is refused.
 */
function renumbered(body: string): string {
    let out = '';
    let i = 0;
    while (i < body.length) {
        const c = body[i];
        if (c === '[') {
            // A bracket expression is copied whole: `[`, a `^`, a `]` first among its characters, and on to the `]` that ends it.
            let end = i + 1;
            if (body[end] === '^') {
                end++;
            }
            if (body[end] === ']') {
                end++;
            }
            const close = body.indexOf(']', end);
            end = close < 0 ? body.length : close + 1;
            out += body.slice(i, end);
            i = end;
        } else if (c === '\\' && i + 1 < body.length) {
            const next = body[i + 1];
            if (next >= '1' && next <= '8') {
                out += `\\${Number(next) + 1}`;
            } else if (next === '9') {
                throw new DrivineError(
                    `matches on Oracle reads at most eight groups by reference: '${body}' refers to the ninth, and Oracle's expressions have no tenth to anchor it beside.`
                );
            } else {
                out += c + next;
            }
            i += 2;
        } else {
            out += c;
            i++;
        }
    }
    return out;
}

const PATH_OPERATORS = { EQ: '==', NEQ: '!=', GT: '>', GTE: '>=', LT: '<', LTE: '<=' };

/** The comparisons an index answers, as SQL writes them. */
const SQL_OPERATORS = { EQ: '=', GT: '>', GTE: '>=', LT: '<', LTE: '<=' };
