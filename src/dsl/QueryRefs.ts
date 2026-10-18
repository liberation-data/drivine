import { DrivineError } from '@/DrivineError';
import { Scope, step, storedName } from '@/dsl/ModelScope';
import { REF_PATH } from '@/dsl/OrderExpressions';
import { allOfOne, Condition, Operator, OrderTerm, RootRefs, Test, Where } from '@/dsl/Refs';
import { ClassRef } from '@/query/QuerySpecification';

/**
 * The references of a query over the class whose scope is given. Each field is looked up in the model as it is
 * reached, so a field the model can't query fails there, naming it.
 */
export function rootRefs<T>(scope: Scope): RootRefs<T> {
    return nodeRefs(scope, [], false);
}

/**
 * The references of a node: `instanceOf` tests it; `any` and `none` quantify over it when it was reached along a
 * relationship; every other name is one of its fields.
 */
function nodeRefs(scope: Scope, path: string[], related: boolean): any {
    return new Proxy(
        {},
        {
            get(_: object, key: string | symbol) {
                if (typeof key !== 'string' || key === 'then') {
                    return undefined;
                }
                if (key === 'instanceOf') {
                    return (type: ClassRef) => at(path, { kind: 'INSTANCE_OF', type });
                }
                if (key === 'hasAnyLabel') {
                    return (...labels: string[]) => at(path, { kind: 'ANY_LABEL', labels });
                }
                if (key === 'property') {
                    return (name: string) => propertyRef([...path, storedName(name)]);
                }
                if (key === 'predicate') {
                    return (name: string, operator: Operator, value?: unknown) =>
                        propertyRef([...path, storedName(name)]).test(operator, value);
                }
                if (key === 'any' || key === 'none') {
                    return (conditions: (node: any) => Where) => {
                        if (!related) {
                            throw new DrivineError(
                                `${key} quantifies over the nodes a relationship leads to; ${described(
                                    path
                                )} is not one.`
                            );
                        }
                        const inner = allOfOne(conditions(nodeRefs(scope, [], false)));
                        return at(path, { kind: 'QUANTIFY', negate: key === 'none', conditions: [inner] });
                    };
                }
                const next = step(scope, key);
                const nextPath = [...path, key];
                switch (next.kind) {
                    case 'SAME_NODE':
                        return nodeRefs(next.scope, nextPath, false);
                    case 'TARGET':
                        return nodeRefs(next.scope, nextPath, false);
                    case 'HOP':
                        return nodeRefs(next.scope, nextPath, true);
                    default:
                        return propertyRef(nextPath);
                }
            }
        }
    );
}

function propertyRef(path: string[]): any {
    const compare =
        (operator: Operator) =>
        (value?: unknown): Condition => {
            if (requiresValue(operator) && value == null) {
                throw new DrivineError(
                    `${described(
                        path
                    )} can't be compared to ${value}: use isNull() or isNotNull() to test for no value.`
                );
            }
            return at(path, { kind: 'COMPARE', operator, value });
        };
    return {
        [REF_PATH]: path,
        test: (operator: Operator, value?: unknown) => compare(operator)(value),
        eq: compare('EQ'),
        neq: compare('NEQ'),
        gt: compare('GT'),
        gte: compare('GTE'),
        lt: compare('LT'),
        lte: compare('LTE'),
        in: compare('IN'),
        notIn: compare('NOT_IN'),
        contains: compare('CONTAINS'),
        startsWith: compare('STARTS_WITH'),
        endsWith: compare('ENDS_WITH'),
        matches: compare('MATCHES'),
        containsIgnoreCase: compare('CONTAINS_IGNORE_CASE'),
        eqIgnoreCase: compare('EQ_IGNORE_CASE'),
        hasItem: compare('HAS_ITEM'),
        isNull: () => at(path, { kind: 'COMPARE', operator: 'IS_NULL' }),
        isNotNull: () => at(path, { kind: 'COMPARE', operator: 'IS_NOT_NULL' }),
        after: (value: unknown) => {
            if (value == null) {
                throw new DrivineError(`A cursor holds a value of ${described(path)}, not ${value}.`);
            }
            return { path, value };
        },
        asc: () => order(path, 'ASC'),
        desc: () => order(path, 'DESC')
    };
}

function requiresValue(operator: Operator): boolean {
    return operator !== 'IS_NULL' && operator !== 'IS_NOT_NULL';
}

function at(path: string[], test: Test): Condition {
    return { kind: 'PATH', path, test };
}

function order(path: string[], direction: 'ASC' | 'DESC', nulls?: 'FIRST' | 'LAST'): OrderTerm {
    return {
        path,
        direction,
        nulls,
        nullsFirst: () => order(path, direction, 'FIRST'),
        nullsLast: () => order(path, direction, 'LAST')
    };
}

function described(path: string[]): string {
    return path.length ? path.join('.') : 'the root';
}
