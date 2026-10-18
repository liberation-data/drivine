import { ClassRef } from '@/query/QuerySpecification';

/** A value a node property holds, and a query compares. */
export type Scalar = string | number | bigint | boolean | Date;

/** The names of a class's fields that hold data, rather than methods. */
export type DataKeys<T> = { [K in keyof T]-?: NonNullable<T[K]> extends Function ? never : K }[keyof T] & string;

/**
 * The references a query reaches through a class's fields: for a view, its root and its relationships; for a fragment,
 * its properties. Each field's reference follows from its type, so only what a field can do is offered: strings
 * compare as strings, numbers and dates by order, lists hold items, and objects (a view's root, a relationship's
 * nodes, a property bag's entries) lead to their own fields.
 */
export type Refs<T> = { readonly [K in DataKeys<T>]-?: RefOf<NonNullable<T[K]>> };

export type RefOf<V> = [V] extends [string]
    ? StringRef<V>
    : [V] extends [number | bigint | Date]
    ? ComparableRef<V>
    : [V] extends [boolean]
    ? ValueRef<V>
    : V extends ReadonlyArray<infer U>
    ? NonNullable<U> extends Scalar
        ? ListRef<NonNullable<U>>
        : NodeRefs<NonNullable<U>>
    : V extends ReadonlySet<infer U>
    ? ListRef<U>
    : V extends object
    ? NodeRefs<V>
    : ValueRef<V>;

/** The references of the class a query loads, and a test of the root's class. */
export type RootRefs<T> = Refs<T> & {
    /** The root is of the class, or a subclass: it carries all of the class's labels. */
    instanceOf(type: ClassRef): Condition;
};

/** A property: compared to values, and ordered by. */
export interface ValueRef<V> {
    eq(value: V): Condition;
    neq(value: V): Condition;
    in(values: readonly V[]): Condition;
    notIn(values: readonly V[]): Condition;
    isNull(): Condition;
    isNotNull(): Condition;
    asc(): OrderTerm;
    desc(): OrderTerm;
}

export interface ComparableRef<V> extends ValueRef<V> {
    gt(value: V): Condition;
    gte(value: V): Condition;
    lt(value: V): Condition;
    lte(value: V): Condition;
}

export interface StringRef<V extends string = string> extends ComparableRef<V> {
    contains(text: string): Condition;
    startsWith(text: string): Condition;
    endsWith(text: string): Condition;
    /** The whole value matches the regular expression, in the engine's own dialect (Java's on Neo4j). */
    matches(regex: string): Condition;
    containsIgnoreCase(text: string): Condition;
    eqIgnoreCase(text: string): Condition;
}

/** A property holding a list: of a node's labels, for a @NodeLabels field. */
export interface ListRef<U> {
    hasItem(value: U): Condition;
    isNull(): Condition;
    isNotNull(): Condition;
}

/**
 * A node, or the nodes a relationship leads to. A condition on one of their fields holds when at least one of the nodes
 * meets it: `q.assignees.name.eq('Kent')`. `any` holds when one node meets all of a set of conditions together, `none`
 * when no node meets them.
 */
export type NodeRefs<V> = Refs<V> & {
    any(conditions: (node: Refs<V>) => Where): Condition;
    none(conditions: (node: Refs<V>) => Where): Condition;
    instanceOf(type: ClassRef): Condition;
};

/** A condition, or several, all of which must hold. */
export type Where = Condition | readonly Condition[];

/** A test of a query's nodes, made through its references and composed with `anyOf`, `allOf` and `not`. */
export type Condition = CompositeCondition | PathCondition;

export interface CompositeCondition {
    readonly kind: 'AND' | 'OR' | 'NOT';
    readonly conditions: readonly Condition[];
}

/** A test at the end of a path of field names from the query's root (or from an `any`'s node). */
export interface PathCondition {
    readonly kind: 'PATH';
    readonly path: readonly string[];
    readonly test: Test;
}

export type Operator =
    | 'EQ'
    | 'NEQ'
    | 'GT'
    | 'GTE'
    | 'LT'
    | 'LTE'
    | 'IN'
    | 'NOT_IN'
    | 'CONTAINS'
    | 'STARTS_WITH'
    | 'ENDS_WITH'
    | 'MATCHES'
    | 'CONTAINS_IGNORE_CASE'
    | 'EQ_IGNORE_CASE'
    | 'IS_NULL'
    | 'IS_NOT_NULL'
    | 'HAS_ITEM';

export type Test =
    | { readonly kind: 'COMPARE'; readonly operator: Operator; readonly value?: unknown }
    | { readonly kind: 'QUANTIFY'; readonly negate: boolean; readonly conditions: readonly Condition[] }
    | { readonly kind: 'INSTANCE_OF'; readonly type: ClassRef };

/** One term of an order, by a property of the root. */
export interface OrderTerm {
    readonly path: readonly string[];
    readonly direction: 'ASC' | 'DESC';
    /** Where rows with no value go; unset, where the engine puts them. */
    readonly nulls?: 'FIRST' | 'LAST';
    /** This term, with rows that have no value before every row that has one. */
    nullsFirst(): OrderTerm;
    /** This term, with rows that have no value after every row that has one. */
    nullsLast(): OrderTerm;
}

/** What a query asks of a load beyond its class. */
export interface Query {
    where?: Where;
    /** Terms applied in turn, each breaking the ties of those before. */
    orderBy?: OrderTerm | readonly OrderTerm[];
    /** At most this many objects (for a view, roots), after the order. */
    limit?: number;
    /** Leaves out this many objects first. */
    skip?: number;
    /** maxDepth overrides for recursive relationships, by field name. */
    depth?: Record<string, number>;
}

/** A query written against the references of the class it loads: `q => ({where: q.person.name.eq('Kent')})`. */
export type QueryFn<T> = (q: RootRefs<T>) => Query;

/** Holds when at least one of the conditions does. */
export function anyOf(...conditions: Where[]): Condition {
    return { kind: 'OR', conditions: conditions.map(allOfOne) };
}

/** Holds when all of the conditions do. */
export function allOf(...conditions: Where[]): Condition {
    return { kind: 'AND', conditions: conditions.flat() };
}

/** Holds when the conditions, all together, do not. */
export function not(...conditions: Where[]): Condition {
    return { kind: 'NOT', conditions: conditions.flat() };
}

/** A Where as one condition. */
export function allOfOne(where: Where): Condition {
    return isConditionList(where) ? allOf(...where) : where;
}

function isConditionList(where: Where): where is readonly Condition[] {
    return Array.isArray(where);
}
