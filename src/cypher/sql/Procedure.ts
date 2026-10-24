import { Direction } from '@/cypher/ast/Pattern';

/** The variables of a procedure, for a statement that writes. */
export const Procedure = {
    /** The parameters, a JSON map. */
    PARAMS: 'cy_params',
    /** The rows, a JSON list of maps, each variable a row holds at its key. */
    ROWS: 'cy_rows',
    /** The rows a write leaves, as it makes them. */
    OUT: 'cy_out',
    /** The row a write is making, a JSON map. */
    ROW: 'cy_row',
    /** A JSON value a write has worked out. */
    VALUE: 'cy_value',
    /** The id of the node or the relationship a write has made. */
    ID: 'cy_id',
    /** A count. */
    COUNT: 'cy_count',
    /** Whether a `MERGE` found its pattern. */
    FOUND: 'cy_found',
    /**
     * The rows a `FOREACH`, or a `CALL { … }` that writes, is written over: what it puts back once its clauses are
     * written, where it returns nothing. Followed by its depth, from 1 to `NESTING`.
     */
    SAVED: 'cy_saved',
    /**
     * The rows a `CALL { … }` that writes and returns gives, or the rows and items a `FOREACH` writes for, each one
     * alone, followed by its depth, from 1 to `NESTING`.
     */
    GATHERED: 'cy_gathered',
    /** How deep `FOREACH`es and writing `CALL`s nest. */
    NESTING: 3,
    /** The nodes a `DELETE` deletes once its rows are done, a JSON list of ids. */
    DOOMED: 'cy_doomed',
    /** The record of a write's loop over the rows: its `item` is a row. */
    RECORD: 'cy_record',
    /** The record of a `MERGE`'s loop over what it found: its `item` is a row. */
    MATCHED: 'cy_matched'
};

/**
 * A variable-length relationship's walk, from the node whose id is `from` to the one whose is `to`, as rows named
 * `name`: by relationships named `edge` in `direction` that meet `conditions`, to a depth from `min` to `max` (any, if
 * undefined). With `backwards` it is walked from the pattern's later node. `seed`, where there is one, is the condition
 * the node walked from meets of its own, over a node row.
 */
export interface Walk {
    from: string;
    to: string;
    name: string;
    step: string;
    edge: string;
    direction: Direction;
    min: number;
    max?: number;
    conditions: string[];
    backwards: boolean;
    seed?: (row: string) => string;
}

/**
 * What a walk is: its rows' `source`, the `condition` that joins them to the pattern, the list of the ids of the
 * relationships each row took, `eids`, and the list of the ids of the nodes it reached after the pattern's earlier node,
 * `nids`, both in the pattern's order.
 */
export interface Walked {
    source: string;
    condition: string;
    eids: string;
    nids: string;
}

/** The statement that runs a procedure: what makes it first, where the store makes one, and what calls it. */
export interface ProcedureCall {
    setup: string[];
    sql: string;
}
