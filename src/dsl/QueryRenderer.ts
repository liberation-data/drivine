import { labelExpression, quoteName } from '@/backend/Cypher';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelsOf, pattern, target } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import { Scope, scopeOf, Step, step } from '@/dsl/ModelScope';
import { rootRefs } from '@/dsl/QueryRefs';
import { ConditionNode, ExpressionNode } from '@/dsl/OrderExpressions';
import { allOfOne, Condition, Operator, OrderTerm, Query, QueryFn, SeekValue, Test, WhereFn } from '@/dsl/Refs';
import { classLabels } from '@/model/InstanceOf';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';

/** A query as Cypher over the root, bound to `alias`: a predicate, an order, and the values both name. */
export interface RenderedQuery {
    where?: string;
    orderBy?: string;
    limit?: number;
    skip?: number;
    depth: Record<string, number>;
    bindings: Record<string, any>;
    /** The stored names of the root properties ordered by, in order. */
    ordered: string[];
    /** Terms that order a list relationship in each object, applied as objects are made. */
    collectionSorts: CollectionSort[];
    /** The root properties the condition holds equal to a value at its top level. */
    pinned: string[];
    /** Whether the query orders, skips, limits or seeks. */
    paged: boolean;
    /** Whether it continues after a cursor. */
    seeks: boolean;
}

/** The aliases a path's conditions are written against: the node, and the relationship a relationship fragment holds. */
interface Aliases {
    node: string;
    rel?: string;
}

/**
 * Writes a query as Cypher for one engine. Values are bound as parameters (`$_q0`, …), never written into the text;
 * a condition across a relationship is an existence check of its own, holding when at least one related node meets
 * it.
 */
export class QueryRenderer {
    private readonly bindings: Record<string, any> = {};
    private aliasCount = 0;

    /** Asks the condition of the class's references and writes it, with the values it binds. */
    static renderWhere<T>(
        fn: WhereFn<T>,
        model: TargetModel,
        grammar: CypherGrammar,
        alias: string
    ): { where: string; bindings: Record<string, any> } {
        const scope = scopeOf(model);
        const renderer = new QueryRenderer(grammar);
        const where = renderer.where(allOfOne(fn(rootRefs<T>(scope))), scope, alias);
        return { where, bindings: renderer.bindings };
    }

    /** Asks the query of the class's references and writes what it gives. */
    static render<T>(fn: QueryFn<T>, model: TargetModel, grammar: CypherGrammar, alias: string): RenderedQuery {
        const scope = scopeOf(model);
        const query: Query = fn(rootRefs<T>(scope));
        const renderer = new QueryRenderer(grammar, query.depth ?? {});
        const condition = query.where !== undefined ? allOfOne(query.where) : undefined;
        const filter = condition ? renderer.where(condition, scope, alias) : undefined;
        const terms = listOf<OrderTerm>(query.orderBy).map((it) => classify(it, scope));
        const keys = terms.filter((it): it is RootKey => it.kind === 'ROOT');
        const seek = listOf<SeekValue>(query.seek);
        const keyset = query.seek !== undefined ? renderer.keyset(keys, seek, query, alias) : undefined;
        const byExpression = keys.some((it) => it.term.expression);
        return {
            where: [filter, keyset].filter((it) => it !== undefined).join(' AND ') || undefined,
            orderBy: keys.length
                ? keys
                      .map((it) =>
                          order(
                              it.term,
                              it.term.expression
                                  ? renderer.expression(it.term.expression, scope, alias)
                                  : `${alias}.${quoteName(it.property!)}`
                          )
                      )
                      .join(', ')
                : undefined,
            collectionSorts: terms.filter((it): it is CollectionSort => it.kind === 'COLLECTION'),
            limit: count('limit', query.limit),
            skip: count('skip', query.skip),
            depth: query.depth ?? {},
            bindings: renderer.bindings,
            ordered: byExpression ? [] : keys.map((it) => it.property!),
            pinned: condition ? pinnedProperties(condition, scope) : [],
            seeks: query.seek !== undefined,
            paged: [query.orderBy, query.limit, query.skip, query.seek].some((it) => it !== undefined)
        };
    }

    constructor(
        private readonly grammar: CypherGrammar,
        private readonly depth: Record<string, number> = {}
    ) {}

    /** The values the conditions written so far bind, by parameter name. */
    get boundValues(): Record<string, any> {
        return { ...this.bindings };
    }

    where(condition: Condition, scope: Scope, alias: string): string {
        return this.condition(condition, scope, { node: alias });
    }

    /**
     * The predicate that continues after a cursor. For `a DESC, b DESC` after `(A, B)`:
     * `a <= $A AND (a < $A OR (a = $A AND b < $B))`, each key first held not null where the engine wants it. The
     * leading bound, redundant beside the branches, gives the planner a range to seek on, as a top-level OR does not.
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
        const expression = (i: number): string => `${alias}.${quoteName(keys[i].property!)}`;
        const values = seek.map((it) => this.bind(it.value));
        const compare = (i: number, strict: boolean): string => {
            const ascending = keys[i].term.direction === 'ASC';
            return `${expression(i)} ${ascending ? '>' : '<'}${strict ? '' : '='} ${values[i]}`;
        };
        const branches = keys.map((_, i) => {
            const prefix = keys.slice(0, i).map((__, j) => `${expression(j)} = ${values[j]}`);
            const branch = [...prefix, compare(i, true)].join(' AND ');
            return i === 0 ? branch : `(${branch})`;
        });
        // Joined by AND with no parentheses around the whole: in them, FalkorDB 6 scans the label rather than
        // seeking on the bound (FalkorDB/FalkorDB#3331).
        return [
            ...(this.grammar.keysetNullGuard ? keys.map((_, i) => `${expression(i)} IS NOT NULL`) : []),
            ...(keys.length > 1 ? [compare(0, false)] : []),
            branches.length > 1 ? `(${branches.join(' OR ')})` : branches[0]
        ].join(' AND ');
    }

    /** An order expression as Cypher over the root's properties, its values bound. */
    private expression(node: ExpressionNode, scope: Scope, alias: string): string {
        const of = (it: ExpressionNode): string => this.expression(it, scope, alias);
        switch (node.kind) {
            case 'PROPERTY':
                return `${alias}.${quoteName(rootProperty(node.path, scope, 'An expression'))}`;
            case 'VALUE':
                return this.bind(node.value);
            case 'ARITHMETIC':
                // toFloat: Cypher divides two integers as integers.
                return node.operator === '/'
                    ? `(toFloat(${of(node.left)}) / ${of(node.right)})`
                    : `(${of(node.left)} ${node.operator} ${of(node.right)})`;
            case 'NEGATE':
                return `(-${of(node.operand)})`;
            case 'FUNCTION':
                return `${node.name}(${node.args.map(of).join(', ')})`;
            default:
                return `CASE ${node.branches
                    .map((it) => `WHEN ${this.caseCondition(it.when, scope, alias)} THEN ${of(it.then)}`)
                    .join(' ')} ELSE ${of(node.otherwise)} END`;
        }
    }

    private caseCondition(node: ConditionNode, scope: Scope, alias: string): string {
        switch (node.kind) {
            case 'COMPARE':
                return `${this.expression(node.left, scope, alias)} ${node.operator} ${this.expression(
                    node.right,
                    scope,
                    alias
                )}`;
            case 'HAS_VALUE':
                return `${this.expression(node.operand, scope, alias)} IS ${node.negate ? '' : 'NOT '}NULL`;
            case 'NOT':
                return `NOT (${this.caseCondition(node.condition, scope, alias)})`;
            default:
                return `(${node.conditions.map((it) => this.caseCondition(it, scope, alias)).join(` ${node.kind} `)})`;
        }
    }

    private condition(condition: Condition, scope: Scope, aliases: Aliases): string {
        switch (condition.kind) {
            case 'AND':
                return condition.conditions.length
                    ? group(
                          condition.conditions.map((it) => this.condition(it, scope, aliases)),
                          ' AND '
                      )
                    : 'true';
            case 'OR':
                return condition.conditions.length
                    ? group(
                          condition.conditions.map((it) => this.condition(it, scope, aliases)),
                          ' OR '
                      )
                    : 'false';
            case 'NOT':
                return `NOT ${group(
                    condition.conditions.map((it) => this.condition(it, scope, aliases)),
                    ' AND ',
                    true
                )}`;
            default:
                return this.walk(condition.path, 0, condition.test, scope, aliases);
        }
    }

    private walk(path: readonly string[], i: number, test: Test, scope: Scope, aliases: Aliases): string {
        if (i === path.length) {
            return this.atNode(test, path, aliases);
        }
        const next = step(scope, path[i]);
        const last = i === path.length - 1;
        switch (next.kind) {
            case 'SAME_NODE':
                return this.walk(path, i + 1, test, next.scope, aliases);
            case 'TARGET':
                return this.walk(path, i + 1, test, next.scope, { node: aliases.node });
            case 'HOP':
                return this.across(next, path, i, test, aliases);
            case 'PROPERTY': {
                if (!last) {
                    throw new DrivineError(`${path.slice(0, i + 1).join('.')} is a property; it has no fields.`);
                }
                const owner = next.on === 'RELATIONSHIP' ? aliases.rel : aliases.node;
                return this.compare(test, `${owner}.${quoteName(next.property)}`, next.jsonPacked, path);
            }
            default:
                if (!last || test.kind !== 'COMPARE' || test.operator !== 'HAS_ITEM') {
                    throw new DrivineError(
                        `${path.slice(0, i + 1).join('.')} holds the node's labels: test it with hasItem.`
                    );
                }
                return `${aliases.node}:${quoteName(String(test.value))}`;
        }
    }

    /**
     * A test across a relationship: it holds when one of the nodes the relationship leads to meets the rest of the
     * path's test, or, when the path ends at the relationship and quantifies, all of the quantifier's conditions.
     */
    private across(
        next: Step & { kind: 'HOP' },
        path: readonly string[],
        i: number,
        test: Test,
        aliases: Aliases
    ): string {
        const node = this.alias('x');
        const rel = next.scope.kind === 'REL_FRAGMENT' ? this.alias('r') : '';
        const hop = this.pattern(next.rel, aliases.node, rel, node);
        const quantified = i === path.length - 1 && test.kind === 'QUANTIFY' ? test : undefined;
        const match = this.grammar.someMatch(hop, node, rel, (relProperties) => {
            const into = { node, rel: relProperties };
            return quantified
                ? quantified.conditions.map((it) => this.condition(it, next.scope, into)).join(' AND ')
                : this.walk(path, i + 1, test, next.scope, into);
        });
        return quantified?.negate ? `NOT ${match}` : match;
    }

    /** A test that ended on a node, rather than on one of its properties. */
    private atNode(test: Test, path: readonly string[], aliases: Aliases): string {
        const where = path.length ? path.join('.') : 'the root';
        switch (test.kind) {
            case 'INSTANCE_OF':
                return `${aliases.node}${labelExpression(classLabels(test.type))}`;
            case 'ANY_LABEL':
                return `any(_l IN labels(${aliases.node}) WHERE _l IN ${this.bind([...test.labels])})`;
            case 'QUANTIFY':
                throw new DrivineError(`any and none follow a relationship; ${where} is not one.`);
            default:
                throw new DrivineError(`${where} is a node: compare one of its fields.`);
        }
    }

    private compare(test: Test, expression: string, jsonPacked: boolean, path: readonly string[]): string {
        if (test.kind !== 'COMPARE') {
            throw new DrivineError(`${path.join('.')} is a property, not a node.`);
        }
        const packed = (value: unknown): unknown => (jsonPacked ? JSON.stringify(value) : value);
        switch (test.operator) {
            case 'IN':
            case 'NOT_IN': {
                if (!Array.isArray(test.value)) {
                    throw new DrivineError(`${path.join('.')} is tested against a list, not ${test.value}.`);
                }
                const tested = `${expression} IN ${this.bind(test.value.map(packed))}`;
                return test.operator === 'NOT_IN' ? `NOT ${tested}` : tested;
            }
            case 'CONTAINS_IGNORE_CASE':
            case 'EQ_IGNORE_CASE':
                return `toLower(${expression}) ${test.operator === 'EQ_IGNORE_CASE' ? '=' : 'CONTAINS'} ${this.bind(
                    String(test.value).toLowerCase()
                )}`;
            case 'HAS_ITEM':
                return `${this.bind(packed(test.value))} IN ${expression}`;
            case 'IS_NULL':
                return `${expression} IS NULL`;
            case 'IS_NOT_NULL':
                return `${expression} IS NOT NULL`;
            default:
                return `${expression} ${BINARY[test.operator]} ${this.bind(packed(test.value))}`;
        }
    }

    /** The pattern of one relationship from `from`, its far node labelled; over several hops for a deep fragment list. */
    private pattern(rel: RelationshipModel, from: string, relAlias: string, to: string): string {
        const into = target(rel);
        const depth = this.depth[rel.field] ?? rel.maxDepth;
        const hops = rel.related.kind === 'NODE_FRAGMENT' && depth > 1 ? `*1..${depth}` : '';
        return pattern(rel, from, relAlias, `${to}:${labelsOf(into)}`, hops);
    }

    private bind(value: unknown): string {
        const name = `_q${Object.keys(this.bindings).length}`;
        this.bindings[name] = value;
        return `$${name}`;
    }

    private alias(prefix: string): string {
        return `_${prefix}${this.aliasCount++}`;
    }
}

/** The operators written between the property and its value. */
const BINARY: Partial<Record<Operator, string>> = {
    EQ: '=',
    NEQ: '<>',
    GT: '>',
    GTE: '>=',
    LT: '<',
    LTE: '<=',
    CONTAINS: 'CONTAINS',
    STARTS_WITH: 'STARTS WITH',
    ENDS_WITH: 'ENDS WITH',
    MATCHES: '=~'
};

export function listOf<T>(value: T | readonly T[] | undefined): T[] {
    return value === undefined ? [] : ([value].flat() as T[]);
}

/** A root term of an order: by an expression, or by the root property stored under `property`. */
export interface RootKey {
    kind: 'ROOT';
    term: OrderTerm;
    property?: string;
}

/**
 * A term that orders a list relationship in each object, not the roots: the list at `relationship` (field names from
 * the root, through single relationships on the way), by `key` (field names within each item).
 */
export interface CollectionSort {
    kind: 'COLLECTION';
    relationship: string[];
    key: string[];
    direction: 'ASC' | 'DESC';
    nulls?: 'FIRST' | 'LAST';
}

/** Which a term is: of the roots, or of a list in each. */
export function classify(term: OrderTerm, scope: Scope): RootKey | CollectionSort {
    if (term.expression) {
        return { kind: 'ROOT', term };
    }
    let at = scope;
    let hops = 0;
    let lastList = -1;
    for (const [i, name] of term.path.entries()) {
        const next = step(at, name);
        if (next.kind === 'HOP') {
            hops++;
            lastList = next.rel.isCollection ? i : lastList;
        }
        if (next.kind === 'PROPERTY' || next.kind === 'LABELS') {
            break;
        }
        at = next.scope;
    }
    if (!hops) {
        return { kind: 'ROOT', term, property: rootProperty(term.path, scope, 'An order') };
    }
    const key = term.path.slice(lastList + 1);
    if (lastList < 0 || !key.length || key.some((it) => it.startsWith('\u0000'))) {
        throw new DrivineError(
            `An order is by a property of the root, or of the nodes a list relationship leads to (by field); ` +
                `${term.path.join('.')} is neither.`
        );
    }
    return {
        kind: 'COLLECTION',
        relationship: term.path.slice(0, lastList + 1),
        key,
        direction: term.direction,
        nulls: term.nulls
    };
}

/** The stored name of the root property a path leads to; `what` names what wants one. */
export function rootProperty(path: readonly string[], scope: Scope, what: string): string {
    let at = scope;
    for (const [i, name] of path.entries()) {
        const next = step(at, name);
        if (next.kind === 'SAME_NODE') {
            at = next.scope;
        } else if (next.kind === 'PROPERTY' && next.on === 'NODE' && i === path.length - 1) {
            return next.property;
        } else {
            break;
        }
    }
    throw new DrivineError(`${what} is by a property of the root; ${path.join('.')} is not one.`);
}

function order(term: OrderTerm, expression: string): string {
    const key = `${expression}${term.direction === 'DESC' ? ' DESC' : ''}`;
    // A placement as its own key, before the property: false sorts before true on every engine.
    if (term.nulls === 'FIRST') {
        return `${expression} IS NULL DESC, ${key}`;
    }
    return term.nulls === 'LAST' ? `${expression} IS NULL, ${key}` : key;
}

/** The root properties a condition holds equal to a value at its top level: an equality within anyOf holds none. */
export function pinnedProperties(condition: Condition, scope: Scope): string[] {
    if (condition.kind === 'AND') {
        return condition.conditions.flatMap((it) => pinnedProperties(it, scope));
    }
    if (condition.kind !== 'PATH' || condition.test.kind !== 'COMPARE' || condition.test.operator !== 'EQ') {
        return [];
    }
    try {
        return [rootProperty(condition.path, scope, 'A pin')];
    } catch {
        return [];
    }
}

/** Joined, in parentheses when there is more than one (or always, when `always`). */
export function group(parts: string[], separator: string, always: boolean = false): string {
    return parts.length > 1 || always ? `(${parts.join(separator)})` : parts[0];
}

export function count(name: string, value: number | undefined): number | undefined {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new DrivineError(`${name} is a whole number of objects, not ${value}.`);
    }
    return value;
}
