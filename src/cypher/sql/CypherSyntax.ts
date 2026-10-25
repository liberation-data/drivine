import { DrivineError } from '@/DrivineError';
import { Expression } from '@/cypher/ast/Expression';
import { Pattern } from '@/cypher/ast/Pattern';
import { Clause } from '@/cypher/ast/Query';

/** The functions that aggregate the rows of a group. */
const AGGREGATES = ['count', 'collect', 'sum', 'avg', 'min', 'max'];

/**
 * The function that keeps each item of a list once, where it is first: see `CypherWriter.aggregatesFirst`. Named as no
 * function is, unless quoted so.
 */
export const DISTINCT_ITEMS = '#distinct items';

/** A string as a SQL literal. */
export function literal(text: string): string {
    return `'${text.replace(/'/g, "''")}'`;
}

/** `text`, each line indented a step. */
export function indent(text: string): string {
    return text
        .split('\n')
        .map((it) => `    ${it}`)
        .join('\n');
}

/** Cypher the compiler does not take: refused by name, so the caller is told what, and not that the SQL failed. */
export function unsupported(construct: string): never {
    throw new DrivineError(`${construct} is Cypher, and is not compiled to SQL yet.`);
}

/** Whether `clause` writes, which makes its statement a procedure. */
export function writes(clause: Clause): boolean {
    switch (clause.kind) {
        case 'Create':
        case 'Merge':
        case 'Set':
        case 'Remove':
        case 'Delete':
        case 'Foreach':
            return true;
        case 'Call':
            return [...clause.query.clauses, ...clause.query.unions.flatMap((it) => it.clauses)].some(writes);
        default:
            return false;
    }
}

/** openCypher's functions of one number that a store's `math` works out, as Neo4j names them, lowered. */
export const MATH_FUNCTIONS = [
    'exp',
    'log',
    'log10',
    'sqrt',
    'sin',
    'cos',
    'tan',
    'cot',
    'asin',
    'acos',
    'atan',
    'degrees',
    'radians',
    'haversin'
];

/**
 * The doubles Java's `Math.toDegrees` and `Math.toRadians` multiply by, as Neo4j's `degrees` and `radians` do: a store
 * that works out 180 / π otherwise, or divides, can differ in the last digit, as at `degrees(0.1)`.
 */
export const RADIANS_TO_DEGREES = '57.29577951308232';
export const DEGREES_TO_RADIANS = '0.017453292519943295';

/** Java's rounding modes, as `round(value, precision, mode)` names them, as Neo4j takes them. */
export type RoundingMode = 'UP' | 'DOWN' | 'CEILING' | 'FLOOR' | 'HALF_UP' | 'HALF_DOWN' | 'HALF_EVEN' | 'UNNECESSARY';

export const ROUNDING_MODES: RoundingMode[] = [
    'UP',
    'DOWN',
    'CEILING',
    'FLOOR',
    'HALF_UP',
    'HALF_DOWN',
    'HALF_EVEN',
    'UNNECESSARY'
];

/** Whether `expression` is a call of `randomUUID()`, the one function compiled here that gives a value anew each time it is called. */
export function isAnew(expression: Expression): boolean {
    return expression.kind === 'Function' && expression.name.toLowerCase() === 'randomuuid';
}

export function isAggregate(expression: Expression): boolean {
    return (
        expression.kind === 'CountStar' ||
        (expression.kind === 'Function' && AGGREGATES.includes(expression.name.toLowerCase()))
    );
}

/**
 * The lists `expression` reads item by item, in a subquery of its own: a comprehension's, a quantifier's or a reduce's,
 * what `IN` searches, what a slice, `reverse` or `tail` takes items of.
 */
export function iterated(expression: Expression): Expression[] {
    switch (expression.kind) {
        case 'ListComprehension':
        case 'Quantifier':
        case 'Reduce':
            return [expression.list];
        case 'Slice':
            return [expression.subject];
        case 'Binary':
            return expression.operator === 'IN' ? [expression.right] : [];
        case 'Function':
            return ['reverse', 'tail'].includes(expression.name.toLowerCase()) ? expression.arguments.slice(0, 1) : [];
        default:
            return [];
    }
}

/** Whether `expression` holds an expression `test` holds of, outside a nested query of its own. */
export function contains(expression: Expression, test: (expression: Expression) => boolean): boolean {
    return test(expression) || children(expression).some((it) => contains(it, test));
}

/** The variables `expression` names outside its aggregates: what an aggregating projection is grouped by. */
export function variablesOutsideAggregates(expression: Expression): Set<string> {
    if (isAggregate(expression)) {
        return new Set();
    }
    if (expression.kind === 'Variable') {
        return new Set([expression.name]);
    }
    const inner = children(expression).flatMap((it) => [...variablesOutsideAggregates(it)]);
    return new Set(expression.kind === 'MapProjection' ? [expression.variable, ...inner] : inner);
}

/**
 * Every variable `expression` names, its nested queries' and comprehensions' among them: a name a comprehension binds
 * of its own may be among them too, which costs no more than a variable read that is not needed.
 */
export function variablesIn(expression: Expression): Set<string> {
    const of = (...expressions: (Expression | undefined)[]): string[] =>
        expressions.flatMap((it) => (it ? [...variablesIn(it)] : []));
    switch (expression.kind) {
        case 'Variable':
            return new Set([expression.name]);
        case 'MapProjection':
            return new Set([
                expression.variable,
                ...expression.elements.flatMap((it) => (it.kind === 'Variable' ? [it.name] : [])),
                ...of(...children(expression))
            ]);
        case 'ListComprehension':
            return new Set(of(expression.list, expression.where, expression.projection));
        case 'Quantifier':
            return new Set(of(expression.list, expression.where));
        case 'Reduce':
            return new Set(of(expression.initial, expression.list, expression.expression));
        case 'PatternComprehension':
            return new Set([...variablesOfPattern(expression.pattern), ...of(expression.where, expression.projection)]);
        case 'PatternPredicate':
            return variablesOfPattern(expression.pattern);
        case 'Exists':
            return new Set([
                ...expression.patterns.flatMap((it) => [...variablesOfPattern(it)]),
                ...of(expression.where)
            ]);
        default:
            return new Set(of(...children(expression)));
    }
}

/** Every parameter `expression` names, in any expression it holds. */
export function parametersIn(expression: Expression): Set<string> {
    const of = (...expressions: (Expression | undefined)[]): string[] =>
        expressions.flatMap((it) => (it ? [...parametersIn(it)] : []));
    switch (expression.kind) {
        case 'Parameter':
            return new Set([expression.name]);
        case 'ListComprehension':
            return new Set(of(expression.list, expression.where, expression.projection));
        case 'Quantifier':
            return new Set(of(expression.list, expression.where));
        case 'Reduce':
            return new Set(of(expression.initial, expression.list, expression.expression));
        case 'PatternComprehension':
            return new Set(of(expression.where, expression.projection));
        default:
            return new Set(of(...children(expression)));
    }
}

/** Every variable `pattern` names, of its parts or in their properties, a quantified path pattern's among them. */
export function variablesOfPattern(pattern: Pattern): Set<string> {
    return new Set(
        [...pattern.nodes, ...pattern.relationships].flatMap((part) => [
            ...(part.variable ? [part.variable] : []),
            ...(part.properties ? [...variablesIn(part.properties)] : []),
            ...('group' in part && part.group
                ? [
                      ...variablesOfPattern(part.group.pattern),
                      ...(part.group.where ? [...variablesIn(part.group.where)] : [])
                  ]
                : [])
        ])
    );
}

/**
 * Whether `expression` holds a subquery anywhere: in a comprehension's, a quantifier's or a pattern's condition or
 * properties too, where {@link contains} does not look.
 */
export function holdsSubquery(expression: Expression): boolean {
    const any = (...expressions: (Expression | undefined)[]): boolean => present(...expressions).some(holdsSubquery);
    switch (expression.kind) {
        case 'Subquery':
            return true;
        case 'ListComprehension':
            return any(expression.list, expression.where, expression.projection);
        case 'Quantifier':
            return any(expression.list, expression.where);
        case 'Reduce':
            return any(expression.initial, expression.list, expression.expression);
        case 'PatternComprehension':
            return patternHoldsSubquery(expression.pattern) || any(expression.where, expression.projection);
        case 'PatternPredicate':
            return patternHoldsSubquery(expression.pattern);
        case 'Exists':
            return expression.patterns.some(patternHoldsSubquery) || any(expression.where);
        default:
            return children(expression).some(holdsSubquery);
    }
}

/** Whether `pattern` holds a subquery in its parts' properties or a quantified path pattern's condition. */
export function patternHoldsSubquery(pattern: Pattern): boolean {
    return (
        pattern.nodes.some((it) => it.properties !== undefined && holdsSubquery(it.properties)) ||
        pattern.relationships.some(
            (relationship) =>
                (relationship.properties !== undefined && holdsSubquery(relationship.properties)) ||
                (relationship.group !== undefined &&
                    (patternHoldsSubquery(relationship.group.pattern) ||
                        (relationship.group.where !== undefined && holdsSubquery(relationship.group.where))))
        )
    );
}

/** An expression of each kind with its parts, those {@link children} finds, each as `r` gives it: as it is, for a kind not here. */
const REPLACED: {
    [K in Expression['kind']]?: (
        expression: Extract<Expression, { kind: K }>,
        r: (part: Expression) => Expression
    ) => Expression;
} = {
    Property: (it, r) => ({ ...it, subject: r(it.subject) }),
    HasLabels: (it, r) => ({ ...it, subject: r(it.subject) }),
    ListLiteral: (it, r) => ({ ...it, items: it.items.map(r) }),
    MapLiteral: (it, r) => ({
        ...it,
        entries: it.entries.map(([key, value]): [string, Expression] => [key, r(value)])
    }),
    MapProjection: (it, r) => ({
        ...it,
        elements: it.elements.map((element) =>
            element.kind === 'Entry' ? { ...element, value: r(element.value) } : element
        )
    }),
    Binary: (it, r) => ({ ...it, left: r(it.left), right: r(it.right) }),
    Unary: (it, r) => ({ ...it, operand: r(it.operand) }),
    Index: (it, r) => ({ ...it, subject: r(it.subject), index: r(it.index) }),
    Slice: (it, r) => ({ ...it, subject: r(it.subject), from: it.from && r(it.from), to: it.to && r(it.to) }),
    Function: (it, r) => ({ ...it, arguments: it.arguments.map(r) }),
    Case: (it, r) => ({
        ...it,
        subject: it.subject && r(it.subject),
        alternatives: it.alternatives.map(([condition, result]): [Expression, Expression] => [r(condition), r(result)]),
        otherwise: it.otherwise && r(it.otherwise)
    }),
    ListComprehension: (it, r) => ({ ...it, list: r(it.list) }),
    Reduce: (it, r) => ({ ...it, initial: r(it.initial), list: r(it.list) }),
    Quantifier: (it, r) => ({ ...it, list: r(it.list) })
};

/** `expression` with each part `replacement` gives a replacement for replaced, among those {@link children} finds. */
export function replaced(
    expression: Expression,
    replacement: (expression: Expression) => Expression | undefined
): Expression {
    const given = replacement(expression);
    if (given !== undefined) {
        return given;
    }
    const of = REPLACED[expression.kind] as
        | ((expression: Expression, r: (part: Expression) => Expression) => Expression)
        | undefined;
    return of ? of(expression, (part) => replaced(part, replacement)) : expression;
}

/** The expressions an expression of each kind holds that are read in its own scope: none, for a kind not here. */
const CHILDREN: { [K in Expression['kind']]?: (expression: Extract<Expression, { kind: K }>) => Expression[] } = {
    Property: (it) => [it.subject],
    HasLabels: (it) => [it.subject],
    ListLiteral: (it) => it.items,
    MapLiteral: (it) => it.entries.map(([, value]) => value),
    MapProjection: (it) => it.elements.flatMap((element) => (element.kind === 'Entry' ? [element.value] : [])),
    Binary: (it) => [it.left, it.right],
    Unary: (it) => [it.operand],
    Index: (it) => [it.subject, it.index],
    Slice: (it) => present(it.subject, it.from, it.to),
    Function: (it) => it.arguments,
    Case: (it) => [...present(it.subject, it.otherwise), ...it.alternatives.flatMap(([key, value]) => [key, value])],
    ListComprehension: (it) => [it.list],
    Quantifier: (it) => [it.list],
    Reduce: (it) => [it.initial, it.list]
};

/** The expressions `expression` holds that are read in its own scope. */
export function children(expression: Expression): Expression[] {
    const of = CHILDREN[expression.kind] as ((expression: Expression) => Expression[]) | undefined;
    return of ? of(expression) : [];
}

function present(...expressions: (Expression | undefined)[]): Expression[] {
    return expressions.filter((it): it is Expression => it !== undefined);
}
