import { DrivineError } from '@/DrivineError';
import { cypherCompilerModule } from '@/cypher/SharedCypherCompiler';
import { randomUuid } from '@/utils/Random';
import { ModuleStore, restampParameters, stampParameters, storeStatements } from '@/backend/StoreStatements';
import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * A graph whose store layout this version of Drivine does not read: written in an earlier layout and holding values,
 * written by a later Drivine, or stamped by two at once (liberation-data/drivine-cypher-spec#161). The shared module
 * decides (its `layout` request), and the message says which, and what to do: reload the graph with this version, or
 * upgrade. Thrown on every connection, as no statement may run over a store whose values are held otherwise.
 * drivine4j's `StoreLayoutException`.
 */
export class StoreLayoutError extends DrivineError {
    constructor(
        /** The graph refused. */
        readonly graph: string,
        message: string,
        /** The earlier layout the graph was written in, where a migration moves it to this one (#765). */
        readonly from?: number,
        /** Whether the graph is part way through a migration to this layout, which resuming finishes. */
        readonly inProgress: boolean = false
    ) {
        super(message);
        this.name = 'StoreLayoutError';
    }
}

/** The module's verdict on a graph's layout. */
export type LayoutVerdict =
    | { verdict: 'current' }
    | { verdict: 'stamp'; drops: string[]; assign: boolean; parameters: Record<string, any> }
    | {
          verdict: 'refuse';
          message: string;
          /** The earlier layout a graph that holds values was written in, which a migration moves from. */
          from?: number;
          /** Whether a migration to this layout was begun and not finished (its checkpoint table stands). */
          inProgress?: boolean;
      };

/** What the module judges a graph by: its stamps, whether it holds a node not Drivine's, and what an earlier layout left. */
export interface LayoutEvidence {
    stamps: { layout: number | string | null }[];
    foreignNodes: boolean;
    objects: { name: string; type: string }[];
}

/** The module's verdict on the graph `graph` of the store whose stamp names it `engine`, by `evidence`. */
export function layoutVerdict(engine: string, graph: string, evidence: LayoutEvidence): LayoutVerdict {
    const answer = JSON.parse(
        cypherCompilerModule().compile(JSON.stringify({ layout: { engine, graph, ...evidence } }))
    );
    if ('error' in answer) {
        throw new DrivineError(`The shared module can't judge the layout of the graph '${graph}': ${answer.error}`);
    }
    return answer as LayoutVerdict;
}

/** Runs a statement of the store's own language, binding `$name`s, and gives its rows. */
export type LayoutRun = (statement: string, parameters?: Record<string, any>) => Promise<any[]>;

/** Runs each statement on `connection`, as SQL, outside any transaction the connection is not in already. */
export function runOn(connection: Connection): LayoutRun {
    return async (statement, parameters = {}) =>
        connection.query(new QuerySpecification(statement).bind(parameters).exactIntegers());
}

/**
 * The store layout's verdict on the graph `graph` (liberation-data/drivine-cypher-spec#161), asked of the module by the
 * graph's stamps, whether it holds a node other than Drivine's own, and the objects an earlier layout may have left;
 * asked on a provider's first connection, before anything is made in the graph, as this layout's lock table, which the
 * store's making makes, is the module's evidence that a graph without a stamp is of this layout. drivine4j's
 * `SqlGraph.layout`.
 *
 * A graph whose table of nodes isn't there yet (`tablesMade` counts none) is new, and nothing is asked. A graph in this
 * layout is used. One that holds none of the application's values and is in an earlier layout, or none, is made this
 * one's: the earlier layout's objects dropped, its stamp given this layout, and asked again; nothing is migrated. One of
 * this layout whose stamp a clear deleted is stamped again. Any other graph is refused with {@link StoreLayoutError}.
 *
 * @param tablesMade a query of the store's catalog whose one value is how many of the graph's table of nodes it holds
 */
export async function judgeLayout(
    store: ModuleStore,
    graph: string,
    tablesMade: string,
    run: LayoutRun
): Promise<void> {
    const statements = storeStatements(store, graph);
    const stamp = statements.stamp;
    for (let asked = 1; asked <= 2; asked++) {
        // Asked of the store's catalog, which no statement fails: on Postgres a failed one ends its transaction.
        if (asked === 1 && Number(single(await run(tablesMade))) === 0) {
            return;
        }
        const stamps = (await run(stamp.readStamps)).map(document);
        const foreignNodes = (await run(stamp.foreignNodes)).length > 0;
        const objects = stamp.layoutObjects ? (await run(stamp.layoutObjects)).map(document) : [];
        const verdict = layoutVerdict(statements.engine, graph, {
            stamps: stamps.map((it) => ({ layout: it.layout ?? null })),
            foreignNodes,
            objects: objects.map((it) => ({ name: String(it.name), type: String(it.type) }))
        });
        if (verdict.verdict === 'current') {
            return;
        }
        if (verdict.verdict === 'refuse') {
            throw new StoreLayoutError(graph, verdict.message, verdict.from, verdict.inProgress ?? false);
        }
        if (asked === 2) {
            throw new StoreLayoutError(
                graph,
                `The graph '${graph}' was given store layout ${statements.layout}, and its stamps read back otherwise: ` +
                    'another process may be writing it with an earlier Drivine.'
            );
        }
        for (const drop of verdict.drops) {
            await run(drop);
        }
        if (verdict.assign) {
            // A graph of this layout whose stamp a clear deleted: stamped again as a stamp is first made. Another process
            // may stamp it first; the insert is made only where there is none, and both read the one back.
            await run(
                stamp.assignIfAbsent,
                stampParameters(store, graph, randomUuid(), new Date().toISOString(), statements.engine)
            );
        } else if (stamp.restampLayout) {
            await run(stamp.restampLayout, { ...restampParameters(store, graph), ...verdict.parameters });
        }
    }
}

/** A row of one value: that value. */
function single(rows: any[]): unknown {
    const row = rows[0];
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
        const values = Object.values(row);
        return values.length === 1 ? values[0] : row;
    }
    return row;
}

/** A row of one JSON column as the object it holds, whether the store gives it as text or as an object. */
function document(row: any): Record<string, any> {
    const value = single([row]);
    return typeof value === 'string' ? JSON.parse(value) : (value as Record<string, any>);
}
