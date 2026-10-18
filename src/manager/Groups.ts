import { Hop } from '@/annotation/GraphPath';
import { ClassRef } from '@/query/QuerySpecification';

/** Groups by a property of the source node. */
export interface PropertyKey {
    kind: 'property';
    property: string;
}

/** Groups by the node of a fragment class the source reaches through the hops. */
export interface PathKey<T = any> {
    kind: 'path';
    target: ClassRef<T>;
    hops: Hop[];
}

export type GroupKey = PropertyKey | PathKey;

export interface GroupAggregate {
    function: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
    /** The property of the source node aggregated; none for COUNT, which counts nodes. */
    property?: string;
    /** A Cypher predicate over `n`: only nodes that meet it count toward this number. */
    filter?: string;
}

/** Groups by a property of the source node. */
export function key(property: string): PropertyKey {
    return { kind: 'property', property };
}

/** Groups by the node of `target` the source reaches through the hops. The key comes back as that node, mapped. */
export function pathKey<T>(target: ClassRef<T>, hops: Hop[]): PathKey<T> {
    return { kind: 'path', target, hops };
}

/** The number of nodes in the group, or of those that meet `filter`. */
export function count(filter?: string): GroupAggregate {
    return { function: 'COUNT', filter };
}

/** The sum of a property over the group: 0 over no values. */
export function sum(property: string, filter?: string): GroupAggregate {
    return { function: 'SUM', property, filter };
}

/** The average of a property over the group: undefined over no values. */
export function avg(property: string, filter?: string): GroupAggregate {
    return { function: 'AVG', property, filter };
}

export function min(property: string, filter?: string): GroupAggregate {
    return { function: 'MIN', property, filter };
}

export function max(property: string, filter?: string): GroupAggregate {
    return { function: 'MAX', property, filter };
}

export type Comparison = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

export interface GroupQuery<K extends Record<string, GroupKey>, A extends Record<string, GroupAggregate>> {
    /** A Cypher predicate over the source node, `n`: which nodes are read at all. */
    where?: string;
    bindings?: Record<string, any>;
    /** What puts two nodes in one group. Two or more make a compound key. */
    keys: K;
    /** The numbers about each group. */
    aggregates?: A;
    /** Which groups are returned: each compares an aggregate with a value. Joined by AND. */
    having?: [keyof A & string, Comparison, number][];
    /** By key or aggregate name; ties are broken by the keys, ascending. */
    orderBy?: [(keyof K | keyof A) & string, 'asc' | 'desc'][];
    limit?: number;
    skip?: number;
}

/** The value of a key: a property's value, or for a path key the node, mapped. */
type KeyValue<G> = G extends PathKey<infer T> ? T : any;

export type GroupRow<K extends Record<string, GroupKey>, A extends Record<string, GroupAggregate>> = {
    [k in keyof K]: KeyValue<K[k]>;
} & { [a in keyof A]: number | undefined };
