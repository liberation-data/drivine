import { Integer, isInt } from 'neo4j-driver';
import { DrivineError } from '@/DrivineError';
import { CypherFloat, Expression } from '@/cypher/ast/Expression';
import { Pattern } from '@/cypher/ast/Pattern';
import { Call, Clause, Projection, ProjectionItem, Query, With } from '@/cypher/ast/Query';

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

/**
 * The most arguments a function takes on Postgres: a list or a map written by one call of a function past them, as a
 * literal of more than 100 items or 50 entries is, is written in parts (liberation-data/drivine#372).
 */
export const MOST_ARGUMENTS = 100;

/** `items` in runs of `size`, in order, the last of what is left. */
export function chunked<T>(items: T[], size: number): T[][] {
    const runs: T[][] = [];
    for (let start = 0; start < items.length; start += size) {
        runs.push(items.slice(start, start + size));
    }
    return runs;
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

/**
 * The variables of the row, of `names`, that the query `clauses` of `call` imports, as Neo4j has it: those its brackets
 * name, `CALL (a, b) { … }`, or each with `CALL (*) { … }`; with no brackets, those its leading `WITH` names as they
 * are, or each with `WITH *`; none where it has neither, `CALL () { … }` or `CALL { MATCH … }`. In a `UNION`, each
 * query's own leading `WITH`. Refuses a bracketed name not of the row, and, as Neo4j does (its 42I28), a leading `WITH`
 * that names a variable of the row, or `*`, with anything more: such a `WITH` imports, and one that names none is any
 * `WITH`, `CALL { WITH 1 AS one WHERE … }`.
 */
export function imports(call: Call, clauses: Clause[], names: Iterable<string>): Set<string> {
    const all = new Set(names);
    if (call.importsAll) {
        return all;
    }
    if (call.imports !== undefined) {
        const missing = call.imports.find((it) => !all.has(it));
        if (missing !== undefined) {
            throw new DrivineError(
                `${missing} is not defined: a variable is bound by a pattern, a WITH or an UNWIND before it is used.`
            );
        }
        return new Set(call.imports);
    }
    const first = clauses[0];
    if (first?.kind !== 'With') {
        return new Set();
    }
    const leading = first.projection;
    const named = (item: ProjectionItem): string | undefined =>
        item.expression.kind === 'Variable' ? item.expression.name : undefined;
    const ofRow = (item: ProjectionItem): boolean => {
        const name = named(item);
        return name !== undefined && all.has(name);
    };
    if (!leading.star && !leading.items.some(ofRow)) {
        return new Set();
    }
    if (!leading.items.every((it) => named(it) === it.name) || !plainWith(first)) {
        throw new DrivineError(
            'The importing WITH of a CALL { … } names variables of the row alone, as in Cypher: no alias, expression, DISTINCT, ' +
                'WHERE, ORDER BY, SKIP or LIMIT. Import them with CALL (a, b) { … }, and work on them in a WITH after.'
        );
    }
    return leading.star ? all : new Set(leading.items.map((it) => it.name).filter((it) => all.has(it)));
}

/** Whether `clause` has no `WHERE`, `DISTINCT`, `ORDER BY`, `SKIP` or `LIMIT`: a `WITH` that only names what it passes on. */
export function plainWith(clause: With): boolean {
    const projection = clause.projection;
    return (
        clause.where === undefined &&
        !projection.distinct &&
        projection.orderBy.length === 0 &&
        projection.skip === undefined &&
        projection.limit === undefined
    );
}

/** Whether `call` imports by its brackets, `CALL (a) { … }` or `CALL (*) { … }`: what it imports so it sees throughout. */
export function bracketed(call: Call): boolean {
    return call.imports !== undefined || call.importsAll === true;
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

/** The functions of one value a store writes (`function`) whose result is a text, or null: see `JsonValue.text`. */
export const TEXT_FUNCTIONS = ['tostring', 'toupper', 'tolower', 'trim'];

/** A side of a `+` the statement makes a text, or null, though it does not give it: see `JsonValue.text`. */
export const MADE_TEXT = Symbol('MadeText');

/** Whether `value`, given by the statement, is a number JSON holds as one: NaN and the infinities it holds as none. */
export function isGivenNumber(value: unknown): value is number | bigint | CypherFloat | Integer {
    if (value instanceof CypherFloat) {
        return Number.isFinite(value.value);
    }
    return typeof value === 'bigint' || isInt(value) || (typeof value === 'number' && Number.isFinite(value));
}

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

/**
 * What the name of a variable begins with that holds a randomUUID() made first, for each row: see
 * `CypherWriter.anewFirst`. Named as no variable is, unless quoted so.
 */
export const ANEW = '#anew';

/**
 * Whether `expression` holds a call of randomUUID() anywhere: in a comprehension's, a quantifier's, a reduce's or a
 * pattern comprehension's own expressions too, where {@link contains} does not look. Not in a subquery's query.
 */
export function holdsAnew(expression: Expression): boolean {
    const any = (...expressions: (Expression | undefined)[]): boolean => present(...expressions).some(holdsAnew);
    switch (expression.kind) {
        case 'ListComprehension':
            return any(expression.list, expression.where, expression.projection);
        case 'Quantifier':
            return any(expression.list, expression.where);
        case 'Reduce':
            return any(expression.initial, expression.list, expression.expression);
        case 'PatternComprehension':
            return any(expression.where, expression.projection);
        default:
            return isAnew(expression) || children(expression).some(holdsAnew);
    }
}

/** Whether a clause of `query`, or of a query it calls, holds a call of randomUUID() ({@link holdsAnew}) in its expressions. */
export function queryHoldsAnew(query: Query): boolean {
    const projected = (projection: Projection): boolean =>
        [...projection.items.map((it) => it.expression), ...projection.orderBy.map((it) => it.expression)].some(
            holdsAnew
        );
    return [query.clauses, ...query.unions.map((it) => it.clauses)].flat().some((clause) => {
        switch (clause.kind) {
            case 'With':
                return projected(clause.projection) || (clause.where !== undefined && holdsAnew(clause.where));
            case 'Return':
                return projected(clause.projection);
            case 'Unwind':
                return holdsAnew(clause.list);
            case 'Match':
                return clause.where !== undefined && holdsAnew(clause.where);
            case 'Call':
                return queryHoldsAnew(clause.query);
            default:
                return false;
        }
    });
}

/**
 * `expression` with each randomUUID() in a comprehension's, a quantifier's, a reduce's or a pattern comprehension's own
 * expressions read beside the variable `seed`, made anew for each row: `CASE WHEN seed IS NULL THEN null ELSE
 * randomUUID() END`, which is randomUUID() still, as `seed` is never null. So the subquery that works the body out
 * reads the row, and a store works it out again for each row, as it does not for a subquery that reads nothing of it
 * (drivine4j#412). One so read already is left as it is ({@link isSeeded}, of the variables the compiler `made`). Each
 * item's variable is read beside `seed` too (`own`), the path's of a pattern comprehension, named here where it has
 * none: read beside the row's alone, a value bound in a subquery (`SqlCypherCompiler.shared`) reads nothing of the
 * item, and Postgres and Oracle worked it out once for all of them, so `[x IN range(1, 20) WHERE left(randomUUID(), 1)
 * < '8' | x]` kept every item or none; and an aggregate of a pattern comprehension's body that reads only the row's
 * columns is an aggregate of the row's query, which Postgres refuses.
 */
export function seeded(
    expression: Expression,
    seed: string,
    made: ReadonlySet<string>,
    inBody: boolean = false,
    own: string[] = []
): Expression {
    const body = (part: Expression, variable: string): Expression => seeded(part, seed, made, true, [...own, variable]);
    const same = (part: Expression): Expression => seeded(part, seed, made, inBody, own);
    return replaced(expression, (e): Expression | undefined => {
        if (isSeeded(e, made)) {
            return e;
        }
        if (inBody && isAnew(e)) {
            const condition = [seed, ...own]
                .map(
                    (it): Expression => ({
                        kind: 'Unary',
                        operator: 'IS_NULL',
                        operand: { kind: 'Variable', name: it }
                    })
                )
                .reduce((a, b): Expression => ({ kind: 'Binary', operator: 'AND', left: a, right: b }));
            return { kind: 'Case', alternatives: [[condition, { kind: 'Literal', value: null }]], otherwise: e };
        }
        return seededBody(e, seed, own.length, same, body);
    });
}

/**
 * `e`, a comprehension, a quantifier, a reduce or a pattern comprehension, with its own expressions read beside `seed`
 * as {@link seeded} reads them: `same` for those read in its own scope, `body` for those read for each item. A pattern
 * comprehension's path is named after `seed` and how deep in bodies it is, `depth`, where it has no name. Undefined for
 * any other expression, and for a pattern comprehension whose own expressions hold no randomUUID().
 */
function seededBody(
    e: Expression,
    seed: string,
    depth: number,
    same: (part: Expression) => Expression,
    body: (part: Expression, variable: string) => Expression
): Expression | undefined {
    switch (e.kind) {
        case 'ListComprehension':
            return {
                ...e,
                list: same(e.list),
                where: e.where && body(e.where, e.variable),
                projection: e.projection && body(e.projection, e.variable)
            };
        case 'Quantifier':
            return { ...e, list: same(e.list), where: e.where && body(e.where, e.variable) };
        case 'Reduce':
            return { ...e, initial: same(e.initial), list: same(e.list), expression: body(e.expression, e.variable) };
        case 'PatternComprehension': {
            // Named only where its body holds one, so a statement without randomUUID() is compiled as it was.
            if (!present(e.where, e.projection).some(holdsAnew)) {
                return undefined;
            }
            const path = e.pattern.variable ?? `${seed} path${depth}`;
            return {
                ...e,
                pattern: { ...e.pattern, variable: path },
                where: e.where && body(e.where, path),
                projection: body(e.projection, path)
            };
        }
        default:
            return undefined;
    }
}

/**
 * Whether `expression` is a randomUUID() read beside a variable made first for the row, as {@link seeded} reads one: of
 * those the compiler `made`, never a variable of the statement's named alike.
 */
export function isSeeded(expression: Expression, made: ReadonlySet<string>): boolean {
    if (expression.kind !== 'Case' || expression.alternatives.length !== 1) {
        return false;
    }
    let condition = expression.alternatives[0][0];
    while (condition.kind === 'Binary' && condition.operator === 'AND') {
        condition = condition.left;
    }
    return (
        condition.kind === 'Unary' &&
        condition.operator === 'IS_NULL' &&
        condition.operand.kind === 'Variable' &&
        made.has(condition.operand.name)
    );
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
