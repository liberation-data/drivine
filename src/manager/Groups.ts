import { Hop } from '@/annotation/GraphPath';
import { ClassRef } from '@/query/QuerySpecification';
import { ComparableRef, ValueRef, Where } from '@/dsl/Refs';

/** Groups by a property of the source node: by its stored name, or a reference to it. */
export interface PropertyKey<V = any> {
    kind: 'property';
    property: string | ValueRef<V>;
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
    /** The property of the source node aggregated (its stored name, or a reference); none for COUNT. */
    property?: string | ComparableRef<any>;
    /** Only nodes that meet it count toward this number: a condition over the references, or Cypher over `n`. */
    filter?: string | Where;
}

/** Groups by a property of the source node. Given a reference, the key's value is typed as the property is. */
export function key<V>(property: ValueRef<V>): PropertyKey<V>;
export function key(property: string): PropertyKey;
export function key(property: string | ValueRef<any>): PropertyKey {
    return { kind: 'property', property };
}

/** Groups by the node of `target` the source reaches through the hops. The key comes back as that node, mapped. */
export function pathKey<T>(target: ClassRef<T>, hops: Hop[]): PathKey<T> {
    return { kind: 'path', target, hops };
}

/** The number of nodes in the group, or of those that meet `filter`. */
export function count(filter?: string | Where): GroupAggregate {
    return { function: 'COUNT', filter };
}

/** The sum of a property over the group: 0 over no values. */
export function sum(property: string | ComparableRef<any>, filter?: string | Where): GroupAggregate {
    return { function: 'SUM', property, filter };
}

/** The average of a property over the group: undefined over no values. */
export function avg(property: string | ComparableRef<any>, filter?: string | Where): GroupAggregate {
    return { function: 'AVG', property, filter };
}

export function min(property: string | ComparableRef<any>, filter?: string | Where): GroupAggregate {
    return { function: 'MIN', property, filter };
}

export function max(property: string | ComparableRef<any>, filter?: string | Where): GroupAggregate {
    return { function: 'MAX', property, filter };
}

export type Comparison = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

export interface GroupQuery<K extends Record<string, GroupKey>, A extends Record<string, GroupAggregate>> {
    /** Which nodes are read at all: a condition over the references, or a Cypher predicate over the node, `n`. */
    where?: string | Where;
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
type KeyValue<G> = G extends PathKey<infer T> ? T : G extends PropertyKey<infer V> ? V | undefined : any;

export type GroupRow<K extends Record<string, GroupKey>, A extends Record<string, GroupAggregate>> = {
    [k in keyof K]: KeyValue<K[k]>;
} & { [a in keyof A]: number | undefined };
