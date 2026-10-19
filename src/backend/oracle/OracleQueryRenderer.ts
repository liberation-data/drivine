import { hasLabels, holding, jsonKey, RELATED_SUBQUERY } from '@/backend/oracle/OracleGraph';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { target } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import { Scope, scopeOf, Step, step } from '@/dsl/ModelScope';
import { ConditionNode, ExpressionNode } from '@/dsl/OrderExpressions';
import { rootRefs } from '@/dsl/QueryRefs';
import {
    classify,
    CollectionSort,
    count,
    group,
    listOf,
    pinnedProperties,
    RenderedQuery,
    rootProperty,
    RootKey
} from '@/dsl/QueryRenderer';
import { allOfOne, Condition, OrderTerm, Query, QueryFn, SeekValue, Test, WhereFn } from '@/dsl/Refs';
import { classLabels } from '@/model/InstanceOf';
import { FragmentModel } from '@/model/FragmentModel';
import { TargetModel } from '@/model/RelationshipModel';

/** The row a path's conditions read: the node's, and the relationship's that a relationship fragment holds. */
interface Rows {
    node: string;
    rel?: string;
}

/**
 * Writes a query over a class's references as SQL over Oracle's tables, the root's row bound to `alias`. A property is
 * tested in a JSON path filter against a bound value (`JSON_EXISTS(props, '$?(@."k" > $v)' PASSING …)`), so numbers,
 * text and booleans compare as their JSON types and a missing property meets no comparison, as in Cypher. A condition
 * across a relationship is an EXISTS over the relationship table. Values are bound (`$_q0`, …), never written in.
 */
export class OracleQueryRenderer {
    private readonly bindings: Record<string, any> = {};
    private readonly views: OracleViews;

    static render<T>(
        fn: QueryFn<T>,
        model: TargetModel,
        views: (depth: Record<string, number>) => OracleViews,
        alias: string
    ): RenderedQuery {
        const scope = scopeOf(model);
        const query: Query = fn(rootRefs<T>(scope));
        const renderer = new OracleQueryRenderer(views(query.depth ?? {}));
        const condition = query.where !== undefined ? allOfOne(query.where) : undefined;
        const filter = condition ? renderer.condition(condition, scope, { node: alias }) : undefined;
        const terms = listOf<OrderTerm>(query.orderBy).map((it) => classify(it, scope));
        const keys = terms.filter((it): it is RootKey => it.kind === 'ROOT');
        const seek = listOf<SeekValue>(query.seek);
        const keyset = query.seek !== undefined ? renderer.keyset(keys, seek, query, alias) : undefined;
        return {
            where: [filter, keyset].filter((it) => it !== undefined).join(' AND ') || undefined,
            orderBy: keys.length ? keys.map((it) => renderer.order(it, scope, alias)).join(', ') : undefined,
            collectionSorts: terms.filter((it): it is CollectionSort => it.kind === 'COLLECTION'),
            limit: count('limit', query.limit),
            skip: count('skip', query.skip),
            depth: query.depth ?? {},
            bindings: renderer.bindings,
            ordered: keys.some((it) => it.term.expression) ? [] : keys.map((it) => it.property!),
            pinned: condition ? pinnedProperties(condition, scope) : [],
            seeks: query.seek !== undefined,
            paged: [query.orderBy, query.limit, query.skip, query.seek].some((it) => it !== undefined)
        };
    }

    static renderWhere<T>(
        fn: WhereFn<T>,
        model: TargetModel,
        views: OracleViews,
        alias: string
    ): { where: string; bindings: Record<string, any> } {
        const scope = scopeOf(model);
        const renderer = new OracleQueryRenderer(views);
        const where = renderer.condition(allOfOne(fn(rootRefs<T>(scope))), scope, { node: alias });
        return { where, bindings: renderer.bindings };
    }

    constructor(views: OracleViews) {
        this.views = views;
    }

    /** The values the conditions written so far bind, by parameter name. */
    get boundValues(): Record<string, any> {
        return { ...this.bindings };
    }

    /** A condition over the node row `alias`. */
    where(condition: Condition, scope: Scope, alias: string): string {
        return this.condition(condition, scope, { node: alias });
    }

    private condition(condition: Condition, scope: Scope, rows: Rows): string {
        const all = (it: readonly Condition[]): string[] => it.map((c) => this.condition(c, scope, rows));
        switch (condition.kind) {
            case 'AND':
                return condition.conditions.length ? group(all(condition.conditions), ' AND ') : '1 = 1';
            case 'OR':
                return condition.conditions.length ? group(all(condition.conditions), ' OR ') : '1 = 0';
            case 'NOT':
                return `NOT ${group(all(condition.conditions), ' AND ', true)}`;
            default:
                return this.walk(condition.path, 0, condition.test, scope, rows);
        }
    }

    private walk(path: readonly string[], i: number, test: Test, scope: Scope, rows: Rows): string {
        if (i === path.length) {
            return this.atNode(test, path, rows);
        }
        const next = step(scope, path[i]);
        const last = i === path.length - 1;
        switch (next.kind) {
            case 'SAME_NODE':
                return this.walk(path, i + 1, test, next.scope, rows);
            case 'TARGET':
                return this.walk(path, i + 1, test, next.scope, { node: rows.node });
            case 'HOP':
                return this.across(next, path, i, test, rows);
            case 'PROPERTY': {
                if (!last) {
                    throw new DrivineError(`${path.slice(0, i + 1).join('.')} is a property; it has no fields.`);
                }
                const column = next.on === 'RELATIONSHIP' ? `${rows.rel}.props` : holding(rows.node, next.property);
                return this.compare(test, column, next.property, next.jsonPacked, path);
            }
            default:
                if (!last || test.kind !== 'COMPARE' || test.operator !== 'HAS_ITEM') {
                    throw new DrivineError(
                        `${path.slice(0, i + 1).join('.')} holds the node's labels: test it with hasItem.`
                    );
                }
                return hasLabels(rows.node, [String(test.value)]);
        }
    }

    /** At least one node the relationship leads to meets the rest of the path's test, or a quantifier's conditions. */
    private across(next: Step & { kind: 'HOP' }, path: readonly string[], i: number, test: Test, rows: Rows): string {
        const rel = next.rel;
        const into = target(rel);
        const labels = (into.kind === 'GRAPH_VIEW' ? into.model.root : (into.model as FragmentModel)).labels;
        const depth = rel.maxDepth;
        let clause: string;
        let inner: Rows;
        if (rel.related.kind === 'NODE_FRAGMENT' && depth > 1) {
            const node = this.views.nextAlias('x');
            clause = `FROM ${this.views.graphNodes} ${node} WHERE ${node}.nid IN (${this.views.reached(
                rel.type,
                rel.direction,
                rows.node,
                depth
            )}) AND ${hasLabels(node, labels)}`;
            inner = { node };
        } else {
            const hop = this.views.step(rel.type, rel.direction, rows.node, labels);
            clause = `${hop.from} AND ${hop.x}`;
            inner = { node: hop.node, rel: hop.edge };
        }
        const quantified = i === path.length - 1 && test.kind === 'QUANTIFY' ? test : undefined;
        const tested = quantified
            ? quantified.conditions.map((it) => this.condition(it, next.scope, inner)).join(' AND ')
            : this.walk(path, i + 1, test, next.scope, inner);
        const exists = `EXISTS (${RELATED_SUBQUERY} ${clause} AND ${tested})`;
        return quantified?.negate ? `NOT ${exists}` : exists;
    }

    private atNode(test: Test, path: readonly string[], rows: Rows): string {
        const where = path.length ? path.join('.') : 'the root';
        switch (test.kind) {
            case 'INSTANCE_OF':
                return hasLabels(rows.node, classLabels(test.type));
            case 'ANY_LABEL': {
                const passing = test.labels.map((label, i) => `${this.bind(label)} AS "l${i}"`).join(', ');
                const filter = test.labels.map((_, i) => `@ == $l${i}`).join(' || ');
                return test.labels.length
                    ? `JSON_EXISTS(${rows.node}.labels, '$?(${filter})' PASSING ${passing})`
                    : '1 = 0';
            }
            case 'QUANTIFY':
                throw new DrivineError(`any and none follow a relationship; ${where} is not one.`);
            default:
                throw new DrivineError(`${where} is a node: compare one of its fields.`);
        }
    }

    /** A test of the property `name` of the JSON column `column`. */
    private compare(test: Test, column: string, name: string, jsonPacked: boolean, path: readonly string[]): string {
        if (test.kind !== 'COMPARE') {
            throw new DrivineError(`${path.join('.')} is a property, not a node.`);
        }
        const k = jsonKey(name);
        const packed = (value: unknown): unknown => storable(jsonPacked ? JSON.stringify(value) : value);
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
                return `REGEXP_LIKE(${text}, '^(' || ${this.bind(value)} || ')$')`;
            case 'CONTAINS_IGNORE_CASE':
                return `INSTR(LOWER(${text}), ${this.bind(String(value).toLowerCase())}) > 0`;
            default:
                return `LOWER(${text}) = ${this.bind(String(value).toLowerCase())}`;
        }
    }

    /**
     * The predicate that continues after a cursor, as on the graph engines: a leading bound on the first key, then
     * the lexicographic branches, each a JSON path filter so the cursor's values compare as their JSON types.
     */
    private keyset(keys: RootKey[], seek: SeekValue[], query: Query, alias: string): string {
        if (!keys.length) {
            throw new DrivineError('seek continues an order: give orderBy, with a cursor value for each of its terms.');
        }
        if (keys.length !== seek.length) {
            throw new DrivineError(`seek has ${seek.length} cursor values for ${keys.length} orderBy terms.`);
        }
        if (query.skip !== undefined) {
            throw new DrivineError('seek and skip are two ways to page: give one.');
        }
        keys.forEach((key, i) => {
            if (key.term.expression) {
                throw new DrivineError(
                    "seek can't continue an order by an expression: a cursor holds properties' values, and an " +
                        "expression's is computed for each row."
                );
            }
            if (key.term.nulls) {
                throw new DrivineError(
                    `${key.term.path.join('.')} places its nulls, which no cursor reaches: a cursor does not say ` +
                        'which side of the nulls it is on.'
                );
            }
            if (key.term.path.join('.') !== seek[i].path.join('.')) {
                throw new DrivineError(
                    `seek value ${i + 1} is of ${seek[i].path.join('.')}, but orderBy term ${i + 1} is ` +
                        `${key.term.path.join('.')}.`
                );
            }
        });
        const values = seek.map((it) => this.bind(storable(it.value)));
        const test = (i: number, operator: string): string =>
            `JSON_EXISTS(${holding(alias, keys[i].property!)}, '$?(@${jsonKey(
                keys[i].property!
            )} ${operator} $v)' PASSING ${values[i]} AS "v")`;
        const compare = (i: number, strict: boolean): string =>
            test(i, `${keys[i].term.direction === 'ASC' ? '>' : '<'}${strict ? '' : '='}`);
        const branches = keys.map((_, i) => {
            const branch = [...keys.slice(0, i).map((__, j) => test(j, '==')), compare(i, true)].join(' AND ');
            return i === 0 ? branch : `(${branch})`;
        });
        return [
            ...(keys.length > 1 ? [compare(0, false)] : []),
            branches.length > 1 ? `(${branches.join(' OR ')})` : branches[0]
        ].join(' AND ');
    }

    /** An order term: a property by its JSON type (numbers as numbers), or an expression; nulls as placed. */
    private order(key: RootKey, scope: Scope, alias: string): string {
        const value = key.term.expression
            ? this.expression(key.term.expression, scope, alias, 'NUMBER')
            : `JSON_QUERY(${holding(alias, key.property!)}, '$${jsonKey(key.property!)}' RETURNING JSON)`;
        const nulls = key.term.nulls ? ` NULLS ${key.term.nulls}` : '';
        return `${value}${key.term.direction === 'DESC' ? ' DESC' : ''}${nulls}`;
    }

    /** An order expression over the root's properties: as numbers, or as text where it is compared with text. */
    private expression(node: ExpressionNode, scope: Scope, alias: string, as: 'NUMBER' | 'TEXT'): string {
        const of = (it: ExpressionNode): string => this.expression(it, scope, alias, 'NUMBER');
        switch (node.kind) {
            case 'PROPERTY': {
                const property = rootProperty(node.path, scope, 'An expression');
                const k = jsonKey(property);
                return as === 'NUMBER'
                    ? `JSON_VALUE(${holding(alias, property)}, '$${k}' RETURNING NUMBER)`
                    : `JSON_VALUE(${holding(alias, property)}, '$${k}')`;
            }
            case 'VALUE':
                return this.bind(storable(node.value));
            case 'ARITHMETIC':
                return `(${of(node.left)} ${node.operator} ${of(node.right)})`;
            case 'NEGATE':
                return `(-${of(node.operand)})`;
            case 'FUNCTION':
                return `${node.name.toUpperCase()}(${node.args.map(of).join(', ')})`;
            default:
                return `CASE ${node.branches
                    .map((it) => `WHEN ${this.caseCondition(it.when, scope, alias)} THEN ${of(it.then)}`)
                    .join(' ')} ELSE ${of(node.otherwise)} END`;
        }
    }

    private caseCondition(node: ConditionNode, scope: Scope, alias: string): string {
        switch (node.kind) {
            case 'COMPARE': {
                const textual = [node.left, node.right].some(
                    (it) => it.kind === 'VALUE' && typeof it.value !== 'number' && typeof it.value !== 'bigint'
                );
                const as = textual ? 'TEXT' : 'NUMBER';
                return `${this.expression(node.left, scope, alias, as)} ${node.operator} ${this.expression(
                    node.right,
                    scope,
                    alias,
                    as
                )}`;
            }
            case 'HAS_VALUE': {
                const tested =
                    node.operand.kind === 'PROPERTY'
                        ? this.present(alias, rootProperty(node.operand.path, scope, 'An expression'))
                        : `${this.expression(node.operand, scope, alias, 'NUMBER')} IS NOT NULL`;
                return node.negate ? `NOT ${tested}` : tested;
            }
            case 'NOT':
                return `NOT (${this.caseCondition(node.condition, scope, alias)})`;
            default:
                return `(${node.conditions.map((it) => this.caseCondition(it, scope, alias)).join(` ${node.kind} `)})`;
        }
    }

    private present(alias: string, property: string): string {
        return `JSON_EXISTS(${holding(alias, property)}, '$?(@${jsonKey(property)} != null)')`;
    }

    private list(value: unknown, path: readonly string[]): unknown[] {
        if (!Array.isArray(value)) {
            throw new DrivineError(`${path.join('.')} is tested against a list, not ${value}.`);
        }
        return value;
    }

    private bind(value: unknown): string {
        const name = `_q${Object.keys(this.bindings).length}`;
        this.bindings[name] = value;
        return `$${name}`;
    }
}

const PATH_OPERATORS = { EQ: '==', NEQ: '!=', GT: '>', GTE: '>=', LT: '<', LTE: '<=' };

/** A value as Oracle's JSON holds it: a date as ISO 8601 text, as a save writes it. */
function storable(value: unknown): unknown {
    return value instanceof Date ? value.toISOString() : value;
}
