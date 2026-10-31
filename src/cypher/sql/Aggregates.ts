import { DrivineError } from '@/DrivineError';
import { Expression } from '@/cypher/ast/Expression';
import { Pattern } from '@/cypher/ast/Pattern';
import { Clause, Projection, Query, SetItem } from '@/cypher/ast/Query';
import { children, isAggregate, present } from '@/cypher/sql/CypherSyntax';

/**
 * Where a statement aggregates, as Neo4j refuses it when it plans the statement: an aggregate in a `WHERE` (its
 * InvalidAggregation, 42I24), of a `MATCH`, a `WITH`, a comprehension, a quantifier, a pattern's or `EXISTS { … }`'s,
 * in a `CALL { … }` or a subquery too. Read from the statement alone, before it is compiled, so a statement that
 * compiles is compiled as it was. A subquery's own query, `COUNT { MATCH … RETURN count(*) }`, aggregates in its own
 * projections. As drivine4j's Aggregates.
 */
export const Aggregates = {
    /** Refuses `query` where it aggregates as Cypher does not. */
    check(query: Query): void {
        ofQuery(query);
    }
};

function ofQuery(query: Query): void {
    [query.clauses, ...query.unions.map((it) => it.clauses)].forEach(ofClauses);
}

function ofClauses(clauses: Clause[]): void {
    clauses.forEach((clause) => {
        switch (clause.kind) {
            case 'Match':
                clause.patterns.forEach(ofPattern);
                where(clause.where);
                break;
            case 'Unwind':
                expression(clause.list);
                break;
            case 'With':
                ofProjection(clause.projection);
                where(clause.where);
                break;
            case 'Create':
                clause.patterns.forEach(ofPattern);
                break;
            case 'Merge':
                ofPattern(clause.pattern);
                [...clause.onCreate, ...clause.onMatch].forEach(ofSetItem);
                break;
            case 'Set':
                clause.items.forEach(ofSetItem);
                break;
            case 'Delete':
                clause.expressions.forEach(expression);
                break;
            case 'Call':
                ofQuery(clause.query);
                break;
            case 'Foreach':
                expression(clause.list);
                ofClauses(clause.clauses);
                break;
            case 'Return':
                ofProjection(clause.projection);
                break;
            default:
                // A REMOVE reads no expression.
                break;
        }
    });
}

function ofSetItem(item: SetItem): void {
    if (item.kind !== 'Labels') {
        expression(item.value);
    }
}

function ofProjection(projection: Projection): void {
    projection.items.forEach((it) => expression(it.expression));
    projection.orderBy.forEach((it) => expression(it.expression));
    expression(projection.skip);
    expression(projection.limit);
}

function ofPattern(pattern: Pattern): void {
    pattern.nodes.forEach((it) => expression(it.properties));
    pattern.relationships.forEach((relationship) => {
        expression(relationship.properties);
        if (relationship.group) {
            ofPattern(relationship.group.pattern);
            where(relationship.group.where);
        }
    });
}

/** Refuses a `WHERE`, `condition`, that aggregates outside a subquery's own query; then reads it as any expression. */
function where(condition: Expression | undefined): void {
    if (condition === undefined) {
        return;
    }
    const aggregate = aggregateIn(condition);
    if (aggregate) {
        throw new DrivineError(
            `${named(aggregate)} aggregates, and a WHERE holds no aggregate, as in Neo4j: aggregate in a WITH first, ` +
                "and filter what it gives in that WITH's WHERE, as in WITH x, count(*) AS c WHERE c > 1."
        );
    }
    expression(condition);
}

/** An aggregate's name as a message gives it. */
function named(aggregate: Expression): string {
    return aggregate.kind === 'Function' ? `${aggregate.name}()` : 'count(*)';
}

/**
 * The first aggregate `expression` holds, a comprehension's, a pattern's or `EXISTS { … }`'s among them, but not one a
 * subquery's own query holds.
 */
function aggregateIn(expression: Expression): Expression | undefined {
    if (isAggregate(expression)) {
        return expression;
    }
    for (const part of parts(expression)) {
        const found = aggregateIn(part);
        if (found) {
            return found;
        }
    }
    return undefined;
}

/** Reads `of` for the `WHERE`s and subqueries it holds. */
function expression(of: Expression | undefined): void {
    if (of === undefined) {
        return;
    }
    switch (of.kind) {
        case 'Subquery':
            ofQuery(of.query);
            break;
        case 'ListComprehension':
            expression(of.list);
            where(of.where);
            expression(of.projection);
            break;
        case 'Quantifier':
            expression(of.list);
            where(of.where);
            break;
        case 'PatternComprehension':
            ofPattern(of.pattern);
            where(of.where);
            expression(of.projection);
            break;
        case 'Exists':
            of.patterns.forEach(ofPattern);
            where(of.where);
            break;
        case 'PatternPredicate':
            ofPattern(of.pattern);
            break;
        default:
            parts(of).forEach(expression);
    }
}

/** Each expression `expression` holds directly: a comprehension's, a quantifier's, a reduce's and a pattern's parts too. */
function parts(expression: Expression): Expression[] {
    switch (expression.kind) {
        case 'ListComprehension':
            return present(expression.list, expression.where, expression.projection);
        case 'Quantifier':
            return present(expression.list, expression.where);
        case 'Reduce':
            return [expression.initial, expression.list, expression.expression];
        case 'PatternComprehension':
            return [...patternParts(expression.pattern), ...present(expression.where, expression.projection)];
        case 'PatternPredicate':
            return patternParts(expression.pattern);
        case 'Exists':
            return [...expression.patterns.flatMap(patternParts), ...present(expression.where)];
        case 'Subquery':
            return [];
        default:
            return children(expression);
    }
}

/** Each expression `pattern` holds: its parts' properties, and a quantified path pattern's parts and condition. */
function patternParts(pattern: Pattern): Expression[] {
    return [
        ...present(...pattern.nodes.map((it) => it.properties)),
        ...pattern.relationships.flatMap((relationship) => [
            ...present(relationship.properties),
            ...(relationship.group
                ? [...patternParts(relationship.group.pattern), ...present(relationship.group.where)]
                : [])
        ])
    ];
}
