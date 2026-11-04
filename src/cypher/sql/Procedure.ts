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
    /**
     * The row a `CALL { … }` that writes and returns is written for, followed by its depth, from 1 to `NESTING`: each
     * row it gives is that row with what it returns, whatever the call bound to the row's names inside it.
     */
    CALLER: 'cy_caller',
    /** How deep `FOREACH`es and writing `CALL`s nest. */
    NESTING: 3,
    /** The record of a write's loop over the rows: its `item` is a row. */
    RECORD: 'cy_record',
    /** The record of a `MERGE`'s loop over what it found: its `item` is a row. */
    MATCHED: 'cy_matched'
};

/**
 * A walk from the node whose id is `from` to the one whose is `to`, as rows named `name`, to a depth from `min` to `max`
 * (any, if undefined). Each step takes the `hops` in turn, from the node the step is at, and meets `conditions`: one hop
 * for a variable-length relationship, a hop for each relationship of a quantified path pattern's. A node the conditions
 * read is the row `nodes` names, at its place among the hops' nodes: the node the step is at first, then the far node of
 * each hop. With `backwards` a walk of one hop is walked from the pattern's later node. `seed`, where there is one, is
 * the condition the node walked from meets of its own, over a node row.
 */
export interface Walk {
    from: string;
    to: string;
    name: string;
    step: string;
    hops: WalkHop[];
    nodes: (string | undefined)[];
    min: number;
    max?: number;
    conditions: string[];
    backwards: boolean;
    seed?: (row: string) => string;
}

/** A relationship a walk's step takes, the row `edge`, in `direction` from the node the step is at. */
export interface WalkHop {
    edge: string;
    direction: Direction;
}

/**
 * The joins of a walk's step, see {@link SqlCypherCompiler.steps}: each hop's relationship, and each node a condition
 * reads; the ids of the nodes the hops reach, in turn, `reached`; and the conditions that no two relationships of the
 * step are one, `distinct`.
 */
export interface Steps {
    joins: string[];
    reached: string[];
    distinct: string[];
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

/**
 * A step of the procedure a statement that writes compiles to: see {@link SqlCypherCompiler}. Its SQL names the
 * procedure's variables ({@link Procedure.ROWS}, {@link Procedure.ROW} …) as values it reads. A store with a procedural
 * language writes the steps in it, as Postgres's PL/pgSQL and Oracle's PL/SQL; one without carries them out one by one,
 * as SQLite's `drivine_cypher` does.
 *
 * - `Select`: `variable` set to the value of `expression` in the first row of the query `SELECT expression` and `from`,
 *   or to null where it gives none. `planned` is the step as a procedural language writes it, `SELECT … INTO …`, with
 *   what the store's planner is told of it.
 * - `Let`: `variable` set to the value of `expression`, which reads no table.
 * - `Loop`: `body` for each row of `query`, in its order, with the row's `item` column the value `record.item`: the rows
 *   are the query's as it starts, whatever the body writes. A query written over lines is `multiline`.
 * - `If`: `body`, where the SQL truth value `condition` holds.
 * - `Raise`: the procedure failed, with `message`: what it wrote is undone.
 * - `Execute`: the statement `statement`, which writes; with `into`, the value of the column it returns set to that variable.
 * - `Return`: the rows of `query`, whose one column is `result`, returned as the statement's rows.
 */
export type ProcedureStep =
    | { kind: 'Select'; variable: string; expression: string; from: string; planned: string }
    | { kind: 'Let'; variable: string; expression: string }
    | { kind: 'Loop'; record: string; query: string; multiline: boolean; body: ProcedureStep[] }
    | { kind: 'If'; condition: string; body: ProcedureStep[] }
    | { kind: 'Raise'; message: string }
    | { kind: 'Execute'; statement: string; into?: string }
    | { kind: 'Return'; query: string };
