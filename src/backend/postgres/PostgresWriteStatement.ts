import { GraphStatement } from '@/backend/GraphStatement';
import { columnValue } from '@/backend/postgres/PostgresStatement';
import { WritePlan, WriteReturns } from '@/backend/sql/WritePlan';
import { QuerySpecification } from '@/query/QuerySpecification';
import { sqlText } from '@/backend/sql/SqlGraph';

/** The parameter the shapes a plan names are bound as: a JSON array of `{labels, key}`. */
const SHAPES = '_shapes';

/** The parameter that carries the query a `patch` step asks of the node it found, or null. */
const PATCHED_IF = '_patchedIf';

/**
 * A store's function that carries out a plan of steps: Postgres's `<graph>_write`, a function the store keeps, and
 * SQLite's `drivine_write`, one Drivine registers on each connection. Each carries out the same plan alike.
 */
export interface WriteFunction {
    /** The graph's node table, which the query a `patch` step asks reads. */
    readonly nodes: string;

    /** The statement that calls the function, whose rows are each a text, or a number for a count. */
    writeCall(returns: WriteReturns): string;
}

/**
 * A statement that carries out a plan through the store's write function, drivine4j's, and reads what it gives back as
 * the object manager reads a write's result. The plan is made when the statement is bound, from the values the manager
 * binds then: a patch's, or a relationship's ends.
 */
export class PostgresWriteStatement extends GraphStatement {
    /** The statement that calls a Postgres graph's write function, as drivine4j calls it. */
    static call(graph: string, returns: WriteReturns): string {
        const call =
            `${graph}_write(CAST($${WritePlan.PLAN} AS jsonb), CAST($${SHAPES} AS jsonb), ` +
            `CAST($${WritePlan.MARK} AS text), '${returns}', CAST($${PATCHED_IF} AS text))`;
        // A count is a number, as the graph engines give it; a stamp is text.
        const value = returns === 'COUNT' ? 'CAST(w.v AS bigint)' : 'w.v';
        return `SELECT ${value} FROM ${call} AS w (v)`;
    }

    /**
     * The statement that calls SQLite's write function on the graph, as drivine4j calls it: it gives back a JSON array,
     * read as rows in order.
     */
    static sqliteCall(graph: string, returns: WriteReturns): string {
        return (
            `SELECT w.value AS v FROM json_each(drivine_write(${sqlText(graph)}, $${WritePlan.PLAN}, $${SHAPES}, ` +
            `$${WritePlan.MARK}, '${returns}', $${PATCHED_IF})) w ORDER BY w.key`
        );
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
        graph: WriteFunction,
        returns: WriteReturns,
        private readonly planned: (bound: Record<string, any>) => { plan: WritePlan; patchedIf?: string },
        private readonly reshaped: (rows: string[], bound: Record<string, any>) => any[]
    ) {
        super(graph.writeCall(returns));
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
