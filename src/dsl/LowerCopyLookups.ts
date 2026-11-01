import { Scope, scopeOf, storedName } from '@/dsl/ModelScope';
import { rootProperty } from '@/dsl/QueryRenderer';
import { Condition, Operator, Query, QueryFn, Where, WhereFn } from '@/dsl/Refs';
import { LowerCopies } from '@/model/LowerCopies';
import { TargetModel } from '@/model/RelationshipModel';

/** Each case-insensitive comparison, and what it is on a lowercased copy. */
const LOWERED: Partial<Record<Operator, Operator>> = {
    EQ_IGNORE_CASE: 'EQ_LOWERED',
    CONTAINS_IGNORE_CASE: 'CONTAINS_LOWERED'
};

/**
 * The condition with each case-insensitive comparison of a `@CaseInsensitive` property of the root made a plain
 * comparison with the property's lowercased copy, which an index over the copy serves: `eqIgnoreCase` becomes
 * `EQ_LOWERED` on the copy, and `containsIgnoreCase` `CONTAINS_LOWERED`. drivine4j's `LowerCopyLookups`.
 *
 * Only for the properties in `filled`, whose copy every node of a label of the root is known to have: until then a node
 * saved before there were copies would be missed, and the comparison lowercases the property itself, as for any other.
 * Nor for an empty value, which Oracle keeps no copy of. Only the root's own conditions, within `anyOf` and `not` too:
 * the nodes related to a root are read as the maps a load projects, which hold no copy.
 */
export function lowered(where: Where, scope: Scope, filled: ReadonlySet<string>): Where {
    const rewritten = (condition: Condition): Condition => {
        if (condition.kind !== 'PATH') {
            return { kind: condition.kind, conditions: condition.conditions.map(rewritten) };
        }
        const test = condition.test;
        const operator = test.kind === 'COMPARE' ? LOWERED[test.operator] : undefined;
        if (!operator || test.kind !== 'COMPARE' || typeof test.value !== 'string' || !test.value.length) {
            return condition;
        }
        let property: string;
        try {
            property = rootProperty(condition.path, scope, 'A lookup');
        } catch {
            // Not a property of the root: of a related node, say.
            return condition;
        }
        if (!filled.has(property)) {
            return condition;
        }
        return {
            kind: 'PATH',
            path: [...condition.path.slice(0, -1), storedName(LowerCopies.of(property))],
            test: { kind: 'COMPARE', operator, value: test.value }
        };
    };
    return Array.isArray(where) ? where.map(rewritten) : rewritten(where as Condition);
}

/** The query, its condition written over the copies in `filled` where it can be: see `lowered`. */
export function loweredQuery<T>(fn: QueryFn<T>, target: TargetModel, filled: ReadonlySet<string>): QueryFn<T> {
    if (!filled.size) {
        return fn;
    }
    const scope = scopeOf(target);
    return (refs) => {
        const query: Query = fn(refs);
        return query.where === undefined ? query : { ...query, where: lowered(query.where, scope, filled) };
    };
}

/** The condition, written over the copies in `filled` where it can be: see `lowered`. */
export function loweredWhere<T>(fn: WhereFn<T>, target: TargetModel, filled: ReadonlySet<string>): WhereFn<T> {
    if (!filled.size) {
        return fn;
    }
    const scope = scopeOf(target);
    return (refs) => lowered(fn(refs), scope, filled);
}
