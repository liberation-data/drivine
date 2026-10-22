import { Direction } from '@/annotation/Metadata';
import { hasLabels, jsonValue, nodeDocument, numberOf, PostgresGraph, textOf } from '@/backend/postgres/PostgresGraph';
import { sqlText } from '@/backend/sql/SqlGraph';
import { NodesOf, OrderReads, SqlViews } from '@/backend/sql/SqlViews';
import { GraphViewModel } from '@/model/GraphViewModel';
import { Stamps } from '@/model/Stamps';

/**
 * Writes a view on Postgres (see SqlViews): each relationship's nodes aggregated with `jsonb_agg`, and a relationship
 * to a depth followed by a recursive query.
 */
export class PostgresViews extends SqlViews {
    protected readonly emptyObject = `'{}'::jsonb`;

    constructor(graph: PostgresGraph, depth: Record<string, number> = {}) {
        super(graph, depth);
    }

    /** Queries of the ids of the nodes a load of the view from the roots `roots` selects reaches. */
    cascaded(model: GraphViewModel, roots: string): string[] {
        return this.reachedFromRoots(model, roots);
    }

    object(entries: [string, string][]): string {
        return `jsonb_build_object(${entries.map(([key, value]) => `${sqlText(key)}, ${value}`).join(', ')})`;
    }

    nodeDocument(alias: string): string {
        return nodeDocument(alias);
    }

    hasLabels(alias: string, labels: string[]): string {
        return hasLabels(alias, labels);
    }

    relatedSubquery(): string {
        return 'SELECT 1';
    }

    /**
     * Each way from the node row `from`, a relationship at a time, with the relationships it has taken so far, none of
     * which it takes again, as Cypher walks a path: a node reached by several ways is a row for each.
     */
    reached(type: string, direction: Direction, from: string, depth: number): string {
        const walk = this.nextAlias('w');
        const edges =
            direction === Direction.UNDIRECTED
                ? `(SELECT eid, src AS a, dst AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)} UNION ALL ` +
                  `SELECT eid, dst, src FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`
                : direction === Direction.INCOMING
                ? `(SELECT eid, dst AS a, src AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`
                : `(SELECT eid, src AS a, dst AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`;
        return (
            `WITH RECURSIVE ${walk} (nid, depth, eids) AS (` +
            `SELECT e.b, 1, ARRAY[e.eid] FROM ${edges} e WHERE e.a = ${from}.nid ` +
            `UNION ALL SELECT e.b, w.depth + 1, w.eids || e.eid FROM ${walk} w JOIN ${edges} e ON e.a = w.nid ` +
            `WHERE w.depth < ${depth} AND e.eid <> ALL (w.eids)) SELECT nid FROM ${walk}`
        );
    }

    nodesOf(ids: string, x: string): NodesOf {
        const r = this.nextAlias('r');
        return {
            from: `FROM (SELECT DISTINCT nid FROM (${ids}) ${r}_ids) ${r} JOIN ${this.graph.nodes} ${x} ON ${x}.nid = ${r}.nid`,
            hint: ''
        };
    }

    number(node: string, property: string): string {
        return numberOf(node, property);
    }

    zeroIfNull(value: string): string {
        return `COALESCE(${value}, 0)`;
    }

    protected arrayOf(item: string, order?: string): string {
        return `jsonb_agg(${item}${order ? ` ORDER BY ${order}` : ''})`;
    }

    protected select(): string {
        return 'SELECT ';
    }

    /** `->>` reads a stored `""` as `""`, so it is a text and needs no reading of its own. */
    protected orderReads(node: string, property: string): OrderReads {
        const text =
            property === Stamps.PROPERTY
                ? textOf(node, property)
                : `CASE WHEN jsonb_typeof(${jsonValue(node, property)}) = 'string' THEN ${textOf(node, property)} END`;
        return {
            num: property === Stamps.PROPERTY ? 'CAST(NULL AS numeric)' : numberOf(node, property),
            txt: text,
            emp: 'CAST(NULL AS integer)'
        };
    }
}
