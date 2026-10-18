import { DrivineError } from '@/DrivineError';
import { ComparableRef, OrderTerm, Scalar } from '@/dsl/Refs';

/** Where a property reference keeps its path, so that it can stand in an expression. */
export const REF_PATH: unique symbol = Symbol('drivine.refPath');

/** A value computed for each root from its properties, ordered by with `asc()` or `desc()`. */
export interface Expression {
    readonly node: ExpressionNode;
    asc(): OrderTerm;
    desc(): OrderTerm;
}

/** What arithmetic takes: a numeric property of the root, an expression, or a number (bound). */
export type Operand = Expression | ComparableRef<number> | ComparableRef<bigint> | number;

/** What a comparison takes besides: a property of any ordered type, or a value (bound). */
export type Comparand = Operand | ComparableRef<any> | Scalar;

export type ExpressionNode =
    | { kind: 'PROPERTY'; path: readonly string[] }
    | { kind: 'VALUE'; value: unknown }
    | { kind: 'ARITHMETIC'; operator: '+' | '-' | '*' | '/'; left: ExpressionNode; right: ExpressionNode }
    | { kind: 'NEGATE'; operand: ExpressionNode }
    | { kind: 'FUNCTION'; name: 'exp' | 'floor' | 'coalesce'; args: ExpressionNode[] }
    | { kind: 'CASE'; branches: { when: ConditionNode; then: ExpressionNode }[]; otherwise: ExpressionNode };

export type ConditionNode =
    | { kind: 'COMPARE'; operator: '>' | '<' | '>=' | '<=' | '=' | '<>'; left: ExpressionNode; right: ExpressionNode }
    | { kind: 'HAS_VALUE'; operand: ExpressionNode; negate: boolean }
    | { kind: 'AND' | 'OR'; conditions: ConditionNode[] }
    | { kind: 'NOT'; condition: ConditionNode };

/** A test within a `caseOf`, combined with `and`, `or` and `not`. */
export interface CaseCondition {
    readonly node: ConditionNode;
    and(other: CaseCondition): CaseCondition;
    or(other: CaseCondition): CaseCondition;
    not(): CaseCondition;
    /** The branch this condition chooses: `above(q.x, 1).then(0)`. */
    then(value: Operand): CaseBranch;
}

export interface CaseBranch {
    readonly when: ConditionNode;
    readonly then: ExpressionNode;
}

export function plus(left: Operand, right: Operand): Expression {
    return arithmetic('+', left, right);
}

export function minus(left: Operand, right: Operand): Expression {
    return arithmetic('-', left, right);
}

export function times(left: Operand, right: Operand): Expression {
    return arithmetic('*', left, right);
}

/** Division of real numbers on every engine: Cypher divides two integers as integers. */
export function div(left: Operand, right: Operand): Expression {
    return arithmetic('/', left, right);
}

export function negate(operand: Operand): Expression {
    return expression({ kind: 'NEGATE', operand: nodeOf(operand) });
}

/** e raised to the operand. */
export function exp(operand: Operand): Expression {
    return expression({ kind: 'FUNCTION', name: 'exp', args: [nodeOf(operand)] });
}

/** The largest whole number no greater than the operand. */
export function floor(operand: Operand): Expression {
    return expression({ kind: 'FUNCTION', name: 'floor', args: [nodeOf(operand)] });
}

/** The first operand that has a value. */
export function coalesce(...operands: Comparand[]): Expression {
    return expression({ kind: 'FUNCTION', name: 'coalesce', args: operands.map(nodeOf) });
}

/** A moment of the caller's as seconds since the epoch, with the fraction: folded here and bound as a number. */
export function epochSeconds(moment: Date): number {
    return moment.getTime() / 1000;
}

/** Any value, bound. */
export function param(value: Scalar): Expression {
    return expression({ kind: 'VALUE', value });
}

/** The value of the first branch whose condition holds, else `otherwise`. */
export function caseOf(branches: CaseBranch[], otherwise: Operand): Expression {
    if (!branches.length) {
        throw new DrivineError('caseOf needs a branch: with none, give the otherwise value itself.');
    }
    return expression({ kind: 'CASE', branches: [...branches], otherwise: nodeOf(otherwise) });
}

export function above(left: Comparand, right: Comparand): CaseCondition {
    return compare('>', left, right);
}

export function below(left: Comparand, right: Comparand): CaseCondition {
    return compare('<', left, right);
}

export function atLeast(left: Comparand, right: Comparand): CaseCondition {
    return compare('>=', left, right);
}

export function atMost(left: Comparand, right: Comparand): CaseCondition {
    return compare('<=', left, right);
}

export function equalTo(left: Comparand, right: Comparand): CaseCondition {
    return compare('=', left, right);
}

export function notEqualTo(left: Comparand, right: Comparand): CaseCondition {
    return compare('<>', left, right);
}

export function hasValue(operand: Comparand): CaseCondition {
    return condition({ kind: 'HAS_VALUE', operand: nodeOf(operand), negate: false });
}

export function hasNoValue(operand: Comparand): CaseCondition {
    return condition({ kind: 'HAS_VALUE', operand: nodeOf(operand), negate: true });
}

function arithmetic(operator: '+' | '-' | '*' | '/', left: Operand, right: Operand): Expression {
    return expression({ kind: 'ARITHMETIC', operator, left: nodeOf(left), right: nodeOf(right) });
}

function compare(operator: '>' | '<' | '>=' | '<=' | '=' | '<>', left: Comparand, right: Comparand): CaseCondition {
    return condition({ kind: 'COMPARE', operator, left: nodeOf(left), right: nodeOf(right) });
}

function condition(node: ConditionNode): CaseCondition {
    return {
        node,
        and: (other) => condition({ kind: 'AND', conditions: [node, other.node] }),
        or: (other) => condition({ kind: 'OR', conditions: [node, other.node] }),
        not: () => condition({ kind: 'NOT', condition: node }),
        then: (value) => ({ when: node, then: nodeOf(value) })
    };
}

function expression(node: ExpressionNode): Expression {
    const term = (direction: 'ASC' | 'DESC', nulls?: 'FIRST' | 'LAST'): OrderTerm => ({
        path: [],
        expression: node,
        direction,
        nulls,
        nullsFirst: () => term(direction, 'FIRST'),
        nullsLast: () => term(direction, 'LAST')
    });
    return { node, asc: () => term('ASC'), desc: () => term('DESC') };
}

function nodeOf(operand: Comparand): ExpressionNode {
    if (operand !== null && typeof operand === 'object' && !(operand instanceof Date)) {
        const path = (operand as any)[REF_PATH];
        if (path) {
            return { kind: 'PROPERTY', path };
        }
        if ('node' in operand && 'asc' in operand) {
            return (operand as Expression).node;
        }
        throw new DrivineError(
            'An expression takes properties of the root, expressions and values; not a node or an order.'
        );
    }
    if (operand == null) {
        throw new DrivineError(`An expression's value can't be ${operand}: use hasNoValue, or coalesce.`);
    }
    return { kind: 'VALUE', value: operand };
}
