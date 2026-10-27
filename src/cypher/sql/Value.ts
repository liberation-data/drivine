import { Temporal } from '@/cypher/sql/Temporal';

/**
 * A JSON value: `jsonb`, or with `ordered` `json`, whose object keys keep the order they were written in. Where the
 * statement makes it of a `temporal` kind (a constructor, a parameter of a date, temporal arithmetic), it is that kind's
 * ISO text; where it makes it a list whose every item is of one, `items` is that kind, so an item taken from it, unwound
 * or indexed, is of it. Where it is a map or a list the statement builds that holds a node or a relationship, `identity`
 * is the same value, as JSON that compares, with each node or relationship in it as its id: it is compared by that, as a
 * graph engine compares what it holds by identity, not by its properties.
 */
export interface JsonValue {
    readonly kind: 'Json';
    readonly sql: string;
    readonly ordered?: boolean;
    readonly temporal?: Temporal;
    readonly items?: Temporal;
    readonly identity?: string;
    /** Where the statement makes it a list whose every item is a list of `items` of one kind, that kind: an item taken from it has it as its `items`. */
    readonly itemItems?: Temporal;
    /** Whether the statement makes it a list, and with `itemLists` a list of lists: a store may sort a list as Cypher does only then. */
    readonly list?: boolean;
    readonly itemLists?: boolean;
    /**
     * Whether the statement makes it a text or null (a text written, `toString`, a string function, a `+` of texts), and
     * with `texts` a list whose every item is: a `+` writes such a side as its own text, not as `toString` writes a float.
     */
    readonly text?: boolean;
    readonly texts?: boolean;
    /**
     * Whether it is known to hold no null in a list or a map, at any depth: a value of one kind, a property read from the
     * store, which holds none, or a list or map the statement writes or is given without one. It may itself be null. Two
     * such values compare as JSON; any other may hold a null, which makes Cypher's comparison of the two null where it is
     * not false.
     */
    readonly flat?: boolean;
    /**
     * Where a write reads it from the row it is making, to work out what it writes, the keys it is at in that row: a
     * property of it is read from the row at those keys and the property's, as {@link SqlCypherCompiler.rowValue} reads
     * it. A subquery that gives it where it no longer holds the row's value drops them: a `UNION` in `CALL { … }` whose
     * queries take it from different keys, and an `OPTIONAL CALL`, which gives null where it finds nothing.
     */
    readonly rowKeys?: string[];
}

/** What a {@link JsonValue} is besides its SQL. */
export type JsonOf = Omit<JsonValue, 'kind' | 'sql'>;

/** A truth value: SQL's boolean, with its null for Cypher's. */
export interface BoolValue {
    readonly kind: 'Bool';
    readonly sql: string;
}

/** A node: the columns of its row. */
export interface NodeValue {
    readonly kind: 'Node';
    readonly nid: string;
    readonly labels: string;
    readonly props: string;
    readonly stamp: string;
}

/** A relationship: the columns of its row. */
export interface RelationshipValue {
    readonly kind: 'Relationship';
    readonly eid: string;
    readonly src: string;
    readonly dst: string;
    readonly type: string;
    readonly props: string;
}

/**
 * A list of nodes, or with `relationships` of relationships: `ids`, the JSON list of their ids, in order. It is given as
 * their properties, and read as the nodes or relationships themselves where it is unwound, so a write reaches them,
 * and where it is compared, indexed, searched with `IN` or iterated, so they compare by their ids. Where `collect` gathers
 * it, `gathered` is the JSON list of their properties, gathered beside the ids, for a store reads no aggregate of the
 * query it is in from a subquery. With `flat`, it is known to hold no null: see {@link JsonValue.flat}.
 */
export interface EntitiesValue {
    readonly kind: 'Entities';
    readonly ids: string;
    readonly relationships: boolean;
    readonly gathered?: string;
    readonly flat?: boolean;
}

/** A path: the ids of its nodes, and of its relationships, in the order the pattern names them. */
export interface PathValue {
    readonly kind: 'Path';
    readonly nids: string;
    readonly eids: string;
}

/**
 * A compiled expression: the SQL that gives its value, and what kind of value it is. A Cypher value is JSON on a SQL
 * store, as a node's properties are: so a comparison is JSON's, and `'7'` is not `7`. A node and a relationship are
 * their rows' columns, so a pattern can join to them and a projection can give their properties.
 */
export type Value = JsonValue | BoolValue | NodeValue | RelationshipValue | EntitiesValue | PathValue;

/** A JSON value of the SQL `sql`: see {@link JsonValue}. */
export function json(sql: string, of: JsonOf = {}): JsonValue {
    return { kind: 'Json', sql, ...of };
}

/** A truth value of the SQL `sql`. */
export function bool(sql: string): BoolValue {
    return { kind: 'Bool', sql };
}

/** The node of a row named `row` of the node table, or of columns named so. */
export function nodeOf(row: string): NodeValue {
    return { kind: 'Node', nid: `${row}.nid`, labels: `${row}.labels`, props: `${row}.props`, stamp: `${row}.stamp` };
}

/** The relationship of a row named `row` of the relationship table. */
export function relationshipOf(row: string): RelationshipValue {
    return {
        kind: 'Relationship',
        eid: `${row}.eid`,
        src: `${row}.src`,
        dst: `${row}.dst`,
        type: `${row}.type`,
        props: `${row}.props`
    };
}
