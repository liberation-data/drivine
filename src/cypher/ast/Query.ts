import { Expression } from '@/cypher/ast/Expression';
import { Pattern } from '@/cypher/ast/Pattern';

/** One item of a projection: its expression, and the name it is known by: its alias, or the text it was written as. */
export interface ProjectionItem {
    readonly expression: Expression;
    readonly name: string;
}

/** An order term. */
export interface SortItem {
    readonly expression: Expression;
    readonly descending: boolean;
}

/**
 * What a `WITH` or a `RETURN` gives the next part of a query, or the caller: its `items`, each under the name it is
 * known by, then the order of the rows, how many are skipped and how many are kept. With `star`, every variable in
 * scope is carried as well.
 */
export interface Projection {
    readonly distinct: boolean;
    readonly star: boolean;
    readonly items: ProjectionItem[];
    readonly orderBy: SortItem[];
    readonly skip?: Expression;
    readonly limit?: Expression;
}

/** An item of a `SET`, or of a `MERGE`'s `ON CREATE SET` or `ON MATCH SET`. */
export type SetItem =
    /** `n.key = value`: the property of that name, removed where the value is null. */
    | { readonly kind: 'Property'; readonly variable: string; readonly key: string; readonly value: Expression }
    /** `n = map`: every property replaced by the map's, or a node's or a relationship's properties. */
    | { readonly kind: 'Replace'; readonly variable: string; readonly value: Expression }
    /** `n += map`: the map's entries set over the properties, a null one removing its key. */
    | { readonly kind: 'Add'; readonly variable: string; readonly value: Expression }
    /** `n:Label`: the labels added to a node. */
    | { readonly kind: 'Labels'; readonly variable: string; readonly labels: string[] };

/** An item of a `REMOVE`: `n.key`, the property of that name, or `n:Label`, the labels taken from a node. */
export type RemoveItem =
    | { readonly kind: 'Property'; readonly variable: string; readonly key: string }
    | { readonly kind: 'Labels'; readonly variable: string; readonly labels: string[] };

/** `MATCH` or `OPTIONAL MATCH`: the paths that must be there, or with `optional` may be. */
export interface Match {
    readonly kind: 'Match';
    readonly optional: boolean;
    readonly patterns: Pattern[];
    readonly where?: Expression;
}

/** `UNWIND`: a row for each item of a list, bound to `variable`. */
export interface Unwind {
    readonly kind: 'Unwind';
    readonly list: Expression;
    readonly variable: string;
}

/** `WITH`: what the rest of the query sees, and the rows it keeps. */
export interface With {
    readonly kind: 'With';
    readonly projection: Projection;
    readonly where?: Expression;
}

/** `CREATE`: the nodes and relationships of `patterns` made, for each row. */
export interface Create {
    readonly kind: 'Create';
    readonly patterns: Pattern[];
}

/**
 * `MERGE`: for each row, the `pattern` found, each way it is there, or made whole where it is not, with `onCreate` set
 * on what it made and `onMatch` on what it found.
 */
export interface Merge {
    readonly kind: 'Merge';
    readonly pattern: Pattern;
    readonly onCreate: SetItem[];
    readonly onMatch: SetItem[];
}

/** `SET`: its `items` written in turn, for each row. */
export interface SetClause {
    readonly kind: 'Set';
    readonly items: SetItem[];
}

/** `REMOVE`: its `items` taken away in turn, for each row. */
export interface Remove {
    readonly kind: 'Remove';
    readonly items: RemoveItem[];
}

/** `DELETE` of nodes and relationships, or with `detach` a node with its relationships. */
export interface Delete {
    readonly kind: 'Delete';
    readonly detach: boolean;
    readonly expressions: Expression[];
}

/**
 * `CALL { … }`: for each row, the rows `query` gives, read from the variables around it, with what it returns bound for
 * the clauses after; with `optional`, a row it gives none for is kept, with nulls.
 */
export interface Call {
    readonly kind: 'Call';
    readonly optional: boolean;
    readonly query: Query;
}

/**
 * `FOREACH (x IN list | …)`: `clauses` written for each item of `list`, bound to `variable`; the rows are left as they
 * were.
 */
export interface Foreach {
    readonly kind: 'Foreach';
    readonly variable: string;
    readonly list: Expression;
    readonly clauses: Clause[];
}

/** `RETURN`: what the query gives back. */
export interface Return {
    readonly kind: 'Return';
    readonly projection: Projection;
}

/** A clause of a query, in the order the query reads them. */
export type Clause = Match | Unwind | With | Create | Merge | SetClause | Remove | Delete | Call | Foreach | Return;

/** A query joined to the one before it by `UNION`, its rows after that query's, or with `all` every row kept. */
export interface Union {
    readonly all: boolean;
    readonly clauses: Clause[];
}

/**
 * A query: its clauses in order, ending in a `RETURN`, or in a write that returns nothing; then the queries `unions`
 * joins to it, each ending in a `RETURN` of the same names.
 */
export interface Query {
    readonly clauses: Clause[];
    readonly unions: Union[];
}
