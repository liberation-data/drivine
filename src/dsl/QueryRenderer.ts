import { labelExpression, quoteName } from '@/backend/Cypher';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelsOf, pattern, target } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import { Scope, scopeOf, Step, step } from '@/dsl/ModelScope';
import { rootRefs } from '@/dsl/QueryRefs';
import { allOfOne, Condition, Operator, OrderTerm, Query, QueryFn, Test, WhereFn } from '@/dsl/Refs';
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
        const where = query.where !== undefined ? renderer.where(allOfOne(query.where), scope, alias) : undefined;
        const terms = query.orderBy === undefined ? [] : ([query.orderBy].flat() as OrderTerm[]);
        return {
            where,
            orderBy: terms.length ? terms.map((it) => renderer.order(it, scope, alias)).join(', ') : undefined,
            limit: count('limit', query.limit),
            skip: count('skip', query.skip),
            depth: query.depth ?? {},
            bindings: renderer.bindings
        };
    }

    constructor(
        private readonly grammar: CypherGrammar,
        private readonly depth: Record<string, number> = {}
    ) {}

    where(condition: Condition, scope: Scope, alias: string): string {
        return this.condition(condition, scope, { node: alias });
    }

    order(term: OrderTerm, scope: Scope, alias: string): string {
        let at = scope;
        let expression: string | undefined;
        term.path.forEach((name, i) => {
            const next = step(at, name);
            if (next.kind === 'SAME_NODE') {
                at = next.scope;
            } else if (next.kind === 'PROPERTY' && next.on === 'NODE' && i === term.path.length - 1) {
                expression = `${alias}.${quoteName(next.property)}`;
            } else {
                throw new DrivineError(`An order is by a property of the root; ${term.path.join('.')} is not one.`);
            }
        });
        if (!expression) {
            throw new DrivineError(`An order is by a property of the root; ${term.path.join('.')} is not one.`);
        }
        const key = `${expression}${term.direction === 'DESC' ? ' DESC' : ''}`;
        // A placement as its own key, before the property: false sorts before true on every engine.
        if (term.nulls === 'FIRST') {
            return `${expression} IS NULL DESC, ${key}`;
        }
        return term.nulls === 'LAST' ? `${expression} IS NULL, ${key}` : key;
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

/** Joined, in parentheses when there is more than one (or always, when `always`). */
function group(parts: string[], separator: string, always: boolean = false): string {
    return parts.length > 1 || always ? `(${parts.join(separator)})` : parts[0];
}

function count(name: string, value: number | undefined): number | undefined {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new DrivineError(`${name} is a whole number of objects, not ${value}.`);
    }
    return value;
}
