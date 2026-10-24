import { Expression } from '@/cypher/ast/Expression';

/** A node of a pattern, `(variable:Label {key: value})`: each part may be left out. */
export interface NodePattern {
    readonly variable?: string;
    readonly labels: string[];
    readonly properties?: Expression;
}

/** Which way a relationship points, read from the node before it in the pattern. */
export type Direction = 'OUTGOING' | 'INCOMING' | 'EITHER';

/** How many steps a variable-length relationship takes; a bound left out is open. */
export interface Range {
    readonly min?: number;
    readonly max?: number;
}

/**
 * A relationship of a pattern, `-[variable:TYPE|OTHER *min..max {key: value}]->`. Its `types` are alternatives, any of
 * which a relationship may be. With a `range`, it is a path of such relationships of that many steps. With a `group`,
 * it is a quantified path pattern, `((a)-[:R]->(b)){1,3}`, that many repetitions of the group's pattern between the
 * nodes beside it, and has no variable, types or properties of its own.
 */
export interface RelationshipPattern {
    readonly variable?: string;
    readonly types: string[];
    readonly direction: Direction;
    readonly range?: Range;
    readonly properties?: Expression;
    readonly group?: Group;
}

/**
 * The pattern a quantified path pattern repeats, each repetition's first node the last of the one before, and the
 * `where` each repetition meets. To the rest of the statement, a variable of the pattern is the list of what it
 * matched in each repetition.
 */
export interface Group {
    readonly pattern: Pattern;
    readonly where?: Expression;
}

/** `shortestPath(…)`, one of the shortest paths, or `allShortestPaths(…)`, every one. */
export type Shortest = 'ONE' | 'ALL';

/**
 * A path of a `MATCH`, a `CREATE`, a `MERGE`, an `EXISTS`, a pattern comprehension or a pattern predicate: nodes joined
 * by relationships, one more node than relationships. With a `variable`, the path itself is bound to it. With
 * `shortest`, only the paths of the least length are found: one of them, or all.
 */
export interface Pattern {
    readonly variable?: string;
    readonly nodes: NodePattern[];
    readonly relationships: RelationshipPattern[];
    readonly shortest?: Shortest;
}
