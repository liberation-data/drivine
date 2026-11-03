import { Pattern } from '@/cypher/ast/Pattern';
import { Query } from '@/cypher/ast/Query';

/**
 * A floating-point number the statement writes, `1.5` or `2.0`: kept apart from a whole number, which a JavaScript
 * number is too, since Cypher keeps them apart (`2.0` is not `2`, and `7 / 2` is not `7.0 / 2`).
 */
export class CypherFloat {
    constructor(readonly value: number) {}

    /** As the JVM writes a double, so a message names it as drivine4j's does: `1.5`, `2.0`. */
    toString(): string {
        const text = String(this.value);
        return Number.isInteger(this.value) && !/e/i.test(text) ? `${text}.0` : text;
    }
}

/** A literal: a string, a whole number (a number), a floating-point one ({@link CypherFloat}), a boolean, or null. */
export interface Literal {
    readonly kind: 'Literal';
    readonly value: string | number | CypherFloat | boolean | null;
}

/** A parameter, `$name`, its value bound when the statement runs. */
export interface Parameter {
    readonly kind: 'Parameter';
    readonly name: string;
}

/** A variable a clause bound: a node, a relationship, a path or a value. */
export interface Variable {
    readonly kind: 'Variable';
    readonly name: string;
}

/** A property of a node, a relationship or a map: `subject.key`. */
export interface Property {
    readonly kind: 'Property';
    readonly subject: Expression;
    readonly key: string;
}

/** Whether a node carries each of `labels`: `subject:Label`. */
export interface HasLabels {
    readonly kind: 'HasLabels';
    readonly subject: Expression;
    readonly labels: string[];
}

/** A list, `[a, b]`. */
export interface ListLiteral {
    readonly kind: 'ListLiteral';
    readonly items: Expression[];
}

/** A map, `{key: value}`, its entries in the order written. */
export interface MapLiteral {
    readonly kind: 'MapLiteral';
    readonly entries: [string, Expression][];
}

/**
 * An element of a map projection: `.key`, the property of that name; `key: value`; `.*`, every property; or `other`, a
 * variable, under its own name.
 */
export type MapProjectionElement =
    | { readonly kind: 'Selected'; readonly key: string }
    | { readonly kind: 'Entry'; readonly key: string; readonly value: Expression }
    | { readonly kind: 'All' }
    | { readonly kind: 'Variable'; readonly name: string };

/** A map projection, `n { .name, key: value, .*, other }`, its elements in the order written. */
export interface MapProjection {
    readonly kind: 'MapProjection';
    readonly variable: string;
    readonly elements: MapProjectionElement[];
}

export type BinaryOperator =
    | 'OR'
    | 'XOR'
    | 'AND'
    | 'EQUALS'
    | 'NOT_EQUALS'
    | 'LESS_THAN'
    | 'GREATER_THAN'
    | 'LESS_THAN_OR_EQUAL'
    | 'GREATER_THAN_OR_EQUAL'
    | 'ADD'
    | 'SUBTRACT'
    | 'MULTIPLY'
    | 'DIVIDE'
    | 'MODULO'
    | 'POWER'
    | 'IN'
    | 'STARTS_WITH'
    | 'ENDS_WITH'
    | 'CONTAINS'
    | 'MATCHES';

/** An operator of two operands. */
export interface Binary {
    readonly kind: 'Binary';
    readonly operator: BinaryOperator;
    readonly left: Expression;
    readonly right: Expression;
}

export type UnaryOperator = 'NOT' | 'NEGATE' | 'IS_NULL' | 'IS_NOT_NULL';

/** An operator of one operand. */
export interface Unary {
    readonly kind: 'Unary';
    readonly operator: UnaryOperator;
    readonly operand: Expression;
}

/** An item of a list, `subject[index]`, or the value of a map's key, `subject["key"]`. */
export interface Index {
    readonly kind: 'Index';
    readonly subject: Expression;
    readonly index: Expression;
}

/** A slice of a list, `subject[from..to]`; a bound left out is open. */
export interface Slice {
    readonly kind: 'Slice';
    readonly subject: Expression;
    readonly from?: Expression;
    readonly to?: Expression;
}

/**
 * A function, by its name as written with its namespace (`toLower`, `apoc.text.join`): Cypher takes a function's name
 * in any case.
 */
export interface FunctionCall {
    readonly kind: 'Function';
    readonly name: string;
    readonly distinct: boolean;
    readonly arguments: Expression[];
}

/** `count(*)`. */
export interface CountStar {
    readonly kind: 'CountStar';
}

/** `CASE`: with a `subject`, each alternative's key is compared with it; without one, each is a condition. */
export interface Case {
    readonly kind: 'Case';
    readonly subject?: Expression;
    readonly alternatives: [Expression, Expression][];
    readonly otherwise?: Expression;
}

/** `[variable IN list WHERE filter | projection]`. */
export interface ListComprehension {
    readonly kind: 'ListComprehension';
    readonly variable: string;
    readonly list: Expression;
    readonly where?: Expression;
    readonly projection?: Expression;
}

/** `reduce(accumulator = initial, variable IN list | expression)`: the list folded, from the first item to the last. */
export interface Reduce {
    readonly kind: 'Reduce';
    readonly accumulator: string;
    readonly initial: Expression;
    readonly variable: string;
    readonly list: Expression;
    readonly expression: Expression;
}

/** `[(a)-[:R]->(b) WHERE filter | projection]`: a value for each way the pattern is found from what is bound. */
export interface PatternComprehension {
    readonly kind: 'PatternComprehension';
    readonly pattern: Pattern;
    readonly where?: Expression;
    readonly projection: Expression;
}

/** A pattern as a condition, `(a)-[:R]->()`: whether it is found. */
export interface PatternPredicate {
    readonly kind: 'PatternPredicate';
    readonly pattern: Pattern;
}

/** `EXISTS { pattern WHERE … }`. */
export interface Exists {
    readonly kind: 'Exists';
    readonly patterns: Pattern[];
    readonly where?: Expression;
}

/**
 * `EXISTS { … }` or `COUNT { … }` of a query: whether it gives a row, or how many it gives, for the row it is in. Its
 * `query` reads from the variables around it, and need not end in a `RETURN`.
 */
export interface Subquery {
    readonly kind: 'Subquery';
    readonly of: 'EXISTS' | 'COUNT';
    readonly query: Query;
}

/** `all`, `any`, `none` or `single` of a list: `any(x IN list WHERE condition)`. */
export interface Quantifier {
    readonly kind: 'Quantifier';
    readonly of: 'ALL' | 'ANY' | 'NONE' | 'SINGLE';
    readonly variable: string;
    readonly list: Expression;
    readonly where?: Expression;
}

/** An expression of a Cypher statement. */
export type Expression =
    | Literal
    | Parameter
    | Variable
    | Property
    | HasLabels
    | ListLiteral
    | MapLiteral
    | MapProjection
    | Binary
    | Unary
    | Index
    | Slice
    | FunctionCall
    | CountStar
    | Case
    | ListComprehension
    | Reduce
    | PatternComprehension
    | PatternPredicate
    | Exists
    | Subquery
    | Quantifier;

/** Whether `expression` is the literal `null`, as written. */
export function isNullLiteral(expression: Expression): boolean {
    return expression.kind === 'Literal' && expression.value === null;
}

/** Whether two expressions are the same, as written: so an order term may be an item, as the statement wrote it. */
export function sameExpression(a: Expression, b: Expression): boolean {
    return expressionKey(a) === expressionKey(b);
}

/**
 * A text that is the same for two expressions where they are the same: a function's name in any case, as Neo4j names
 * a function, so `toUpper(x)` is the key `TOUPPER(x)` is and neither is refused as grouped without being told.
 */
export function expressionKey(expression: Expression): string {
    return JSON.stringify(expression, (_, value) =>
        value instanceof CypherFloat
            ? { float: value.value }
            : value?.kind === 'Function'
              ? { ...value, name: (value as FunctionCall).name.toLowerCase() }
              : value
    );
}
