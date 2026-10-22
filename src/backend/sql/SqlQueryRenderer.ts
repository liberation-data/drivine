import { SqlViews } from '@/backend/sql/SqlViews';
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
export interface Rows {
    node: string;
    rel?: string;
}

/** The comparison a test of a property makes: what it compares, of which property, and how it is stored. */
export interface Compared {
    test: Test;
    /** The row the property is read from: a node's, or a relationship's. */
    row: string;
    /** Whether the row is a relationship's. */
    onRelationship: boolean;
    name: string;
    jsonPacked: boolean;
    path: readonly string[];
}

/**
 * Writes a query over a class's references as SQL over a SQL store's tables, the root's row bound to `alias`. A
 * condition across a relationship is an EXISTS over the relationship table. Values are bound (`$_q0`, …), never written
 * in. What is each store's own is how it compares a property, tests labels and reads a property for an order or an
 * expression.
 */
export abstract class SqlQueryRenderer {
    protected readonly bindings: Record<string, any> = {};

    /** The query `fn` makes of the model's references, with the scope its paths are read in. */
    protected static made<T>(fn: QueryFn<T>, model: TargetModel): { scope: Scope; query: Query } {
        const scope = scopeOf(model);
        return { scope, query: fn(rootRefs<T>(scope)) };
    }

    constructor(protected readonly views: SqlViews) {}

    /** The values the conditions written so far bind, by parameter name. */
    get boundValues(): Record<string, any> {
        return { ...this.bindings };
    }

    /** A condition over the node row `alias`. */
    where(condition: Condition, scope: Scope, alias: string): string {
        return this.condition(condition, scope, { node: alias });
    }

    /** The query, made in `scope`, its root's row bound to `alias`. */
    protected render(scope: Scope, query: Query, alias: string): RenderedQuery {
        const condition = query.where !== undefined ? allOfOne(query.where) : undefined;
        const filter = condition ? this.condition(condition, scope, { node: alias }, true) : undefined;
        const terms = listOf<OrderTerm>(query.orderBy).map((it) => classify(it, scope));
        const keys = terms.filter((it): it is RootKey => it.kind === 'ROOT');
        const seek = listOf<SeekValue>(query.seek);
        const keyset = query.seek !== undefined ? this.keyset(keys, seek, query, alias) : undefined;
        return {
            where: [filter, keyset].filter((it) => it !== undefined).join(' AND ') || undefined,
            orderBy: keys.length ? keys.map((it) => this.order(it, scope, alias)).join(', ') : undefined,
            collectionSorts: terms.filter((it): it is CollectionSort => it.kind === 'COLLECTION'),
            limit: count('limit', query.limit),
            skip: count('skip', query.skip),
            depth: query.depth ?? {},
            bindings: this.bindings,
            ordered: keys.some((it) => it.term.expression) ? [] : keys.map((it) => it.property!),
            pinned: condition ? pinnedProperties(condition, scope) : [],
            seeks: query.seek !== undefined,
            paged: [query.orderBy, query.limit, query.skip, query.seek].some((it) => it !== undefined),
            labelsTested: this.labelsTested()
        };
    }

    /** The condition `fn` makes of the model's references, over the node row `alias`. */
    protected renderOnly<T>(
        fn: WhereFn<T>,
        model: TargetModel,
        alias: string
    ): { where: string; bindings: Record<string, any> } {
        const scope = scopeOf(model);
        const where = this.condition(allOfOne(fn(rootRefs<T>(scope))), scope, { node: alias });
        return { where, bindings: this.bindings };
    }

    /** The root's labels whose test a comparison made, where the store reads one through an index. */
    protected labelsTested(): string[] {
        return [];
    }

    /** A value as the store holds it: a date as ISO 8601 text, as a save writes it. */
    protected storable(value: unknown): unknown {
        return value instanceof Date ? value.toISOString() : value;
    }

    // ----- Conditions -----

    /** A condition, which every root meets when it is `top`: the query's, or one of those it holds all of. */
    protected condition(condition: Condition, scope: Scope, rows: Rows, top: boolean = false): string {
        const all = (it: readonly Condition[]): string[] => it.map((c) => this.condition(c, scope, rows));
        switch (condition.kind) {
            case 'AND':
                return condition.conditions.length
                    ? group(
                          condition.conditions.map((c) => this.condition(c, scope, rows, top)),
                          ' AND '
                      )
                    : '1 = 1';
            case 'OR':
                return condition.conditions.length ? group(all(condition.conditions), ' OR ') : '1 = 0';
            case 'NOT':
                return `NOT ${group(all(condition.conditions), ' AND ', true)}`;
            default:
                return this.walk(condition.path, 0, condition.test, scope, rows, top);
        }
    }

    protected list(value: unknown, path: readonly string[]): unknown[] {
        if (!Array.isArray(value)) {
            throw new DrivineError(`${path.join('.')} is tested against a list, not ${value}.`);
        }
        return value;
    }

    protected bind(value: unknown): string {
        const name = `_q${Object.keys(this.bindings).length}`;
        this.bindings[name] = value;
        return `$${name}`;
    }

    private walk(
        path: readonly string[],
        i: number,
        test: Test,
        scope: Scope,
        rows: Rows,
        top: boolean = false
    ): string {
        if (i === path.length) {
            return this.atNode(test, path, rows);
        }
        const next = step(scope, path[i]);
        const last = i === path.length - 1;
        switch (next.kind) {
            case 'SAME_NODE':
                return this.walk(path, i + 1, test, next.scope, rows, top);
            case 'TARGET':
                return this.walk(path, i + 1, test, next.scope, { node: rows.node });
            case 'HOP':
                return this.across(next, path, i, test, rows);
            case 'PROPERTY': {
                if (!last) {
                    throw new DrivineError(`${path.slice(0, i + 1).join('.')} is a property; it has no fields.`);
                }
                const onRelationship = next.on === 'RELATIONSHIP';
                return this.property(
                    {
                        test,
                        row: onRelationship ? rows.rel! : rows.node,
                        onRelationship,
                        name: next.property,
                        jsonPacked: next.jsonPacked,
                        path
                    },
                    top
                );
            }
            default:
                if (!last || test.kind !== 'COMPARE' || test.operator !== 'HAS_ITEM') {
                    throw new DrivineError(
                        `${path.slice(0, i + 1).join('.')} holds the node's labels: test it with hasItem.`
                    );
                }
                return this.views.hasLabels(rows.node, [String(test.value)]);
        }
    }

    /** At least one node the relationship leads to meets the rest of the path's test, or a quantifier's conditions. */
    private across(next: Step & { kind: 'HOP' }, path: readonly string[], i: number, test: Test, rows: Rows): string {
        const rel = next.rel;
        const into = target(rel);
        const labels = (into.kind === 'GRAPH_VIEW' ? into.model.root : (into.model as FragmentModel)).labels;
        const depth = rel.maxDepth;
        let clause: string;
        let hints: string[] = [];
        let inner: Rows;
        if (rel.related.kind === 'NODE_FRAGMENT' && depth > 1) {
            const node = this.views.nextAlias('x');
            const reached = this.views.reached(rel.type, rel.direction, rows.node, depth);
            const nodes = this.views.nodesOf(reached, node);
            clause = `${nodes.from} WHERE ${this.views.hasLabels(node, labels)}`;
            hints = [nodes.hint];
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
        const exists = `EXISTS (${this.views.relatedSubquery(...hints)} ${clause} AND ${tested})`;
        return quantified?.negate ? `NOT ${exists}` : exists;
    }

    private atNode(test: Test, path: readonly string[], rows: Rows): string {
        const where = path.length ? path.join('.') : 'the root';
        switch (test.kind) {
            case 'INSTANCE_OF':
                return this.views.hasLabels(rows.node, classLabels(test.type));
            case 'ANY_LABEL':
                return test.labels.length ? this.anyLabel(rows.node, test.labels) : '1 = 0';
            case 'QUANTIFY':
                throw new DrivineError(`any and none follow a relationship; ${where} is not one.`);
            default:
                throw new DrivineError(`${where} is a node: compare one of its fields.`);
        }
    }

    // ----- Paging and ordering -----

    /**
     * The predicate that continues after a cursor, as on the graph engines: a leading bound on the first key, then
     * the lexicographic branches.
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
        const values = seek.map((it) => this.bind(this.storable(it.value)));
        const test = (i: number, operator: string): string =>
            this.seekTest(alias, keys[i].property!, operator, values[i]);
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

    /** An order term: a property, or an expression; nulls as placed. */
    private order(key: RootKey, scope: Scope, alias: string): string {
        const direction = key.term.direction === 'DESC' ? 'DESC' : 'ASC';
        if (!key.term.expression) {
            return this.orderedProperty(alias, key.property!, direction, key.term.nulls);
        }
        const nulls = key.term.nulls ? ` NULLS ${key.term.nulls}` : '';
        return `${this.expression(key.term.expression, scope, alias, 'NUMBER')}${
            direction === 'DESC' ? ' DESC' : ''
        }${nulls}`;
    }

    /** An order expression over the root's properties: as numbers, or as text where it is compared with text. */
    private expression(node: ExpressionNode, scope: Scope, alias: string, as: 'NUMBER' | 'TEXT'): string {
        const of = (it: ExpressionNode): string => this.expression(it, scope, alias, 'NUMBER');
        switch (node.kind) {
            case 'PROPERTY':
                return this.read(alias, rootProperty(node.path, scope, 'An expression'), as);
            case 'VALUE':
                return this.bind(this.storable(node.value));
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

    // ----- The dialect -----

    /** A test of a property: of the root, every root meeting it when `top`. */
    protected abstract property(compared: Compared, top: boolean): string;

    /** Whether the node row carries any of the labels, of which there is at least one. */
    protected abstract anyLabel(row: string, labels: readonly string[]): string;

    /** The test of a cursor's value: the root's property `property` compared by `operator` with the bound `value`. */
    protected abstract seekTest(alias: string, property: string, operator: string, value: string): string;

    /** An order term of a property of the root, without its direction. */
    protected abstract orderedProperty(
        alias: string,
        property: string,
        direction: 'ASC' | 'DESC',
        nulls?: string
    ): string;

    /** The root's property read in an expression, as a number or as text. */
    protected abstract read(alias: string, property: string, as: 'NUMBER' | 'TEXT'): string;

    /** Whether the root has the property. */
    protected abstract present(alias: string, property: string): string;
}
