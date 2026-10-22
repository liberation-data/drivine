import { GraphStatement } from '@/backend/GraphStatement';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { columnValue } from '@/backend/postgres/PostgresStatement';
import { WritePlan, WriteReturns } from '@/backend/sql/WritePlan';
import { QuerySpecification } from '@/query/QuerySpecification';

/** The parameter the shapes a plan names are bound as: a JSON array of `{labels, key}`. */
const SHAPES = '_shapes';

/** The parameter that carries the query a `patch` step asks of the node it found, or null. */
const PATCHED_IF = '_patchedIf';

/**
 * A statement that carries out a plan through the store's write function, drivine4j's, and reads what it gives back as
 * the object manager reads a write's result. The plan is made when the statement is bound, from the values the manager
 * binds then: a patch's, or a relationship's ends.
 */
export class PostgresWriteStatement extends GraphStatement {
    /** The statement that calls the graph's write function, as drivine4j calls it. */
    static call(graph: PostgresGraph, returns: WriteReturns): string {
        const call =
            `${graph.name}_write(CAST($${WritePlan.PLAN} AS jsonb), CAST($${SHAPES} AS jsonb), ` +
            `CAST($${WritePlan.MARK} AS text), '${returns}', CAST($${PATCHED_IF} AS text))`;
        // A count is a number, as the graph engines give it; a stamp is text.
        const value = returns === 'COUNT' ? 'CAST(w.v AS bigint)' : 'w.v';
        return `SELECT ${value} FROM ${call} AS w (v)`;
    }

    /** The values a plan is bound with. */
    static bindings(plan: WritePlan, patchedIf?: string): Record<string, any> {
        return {
            [WritePlan.PLAN]: JSON.stringify(plan.plan),
            [SHAPES]: JSON.stringify(plan.shapesBound),
            [WritePlan.MARK]: plan.mark,
            [PATCHED_IF]: patchedIf ?? null
        };
    }

    /**
     * @param planned the plan for the values the manager binds, and the query a `patch` step asks, where there is one
     * @param reshaped the rows the function gives back, each a text, as the manager reads the statement's result
     */
    constructor(
        graph: PostgresGraph,
        returns: WriteReturns,
        private readonly planned: (bound: Record<string, any>) => { plan: WritePlan; patchedIf?: string },
        private readonly reshaped: (rows: string[], bound: Record<string, any>) => any[]
    ) {
        super(PostgresWriteStatement.call(graph, returns));
    }

    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        const bound = { ...this.bindings, ...more };
        const { plan, patchedIf }: { plan: WritePlan; patchedIf?: string } = this.planned(bound);
        return new QuerySpecification<T>(this.text)
            .bind(PostgresWriteStatement.bindings(plan, patchedIf))
            .addPostProcessors({
                apply: (rows: any[]) => this.reshaped(rows.map(columnValue), bound)
            });
    }
}
