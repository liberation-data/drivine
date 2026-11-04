import { Direction } from '@/annotation/Metadata';
import { hasLabels, jsonType, nodeDocument, numberOf, SqliteGraph, textOf } from '@/backend/sqlite/SqliteGraph';
import { sqlText } from '@/backend/sql/SqlGraph';
import { NodesOf, OrderReads, SqlViews } from '@/backend/sql/SqlViews';
import { Stamps } from '@/model/Stamps';

/**
 * Writes a view on SQLite (see SqlViews): each relationship's nodes aggregated with `json_group_array`, and a
 * relationship to a depth followed by a recursive query. A document a subquery gives is text, so each value put into a
 * JSON object or array is read as JSON with `json(…)`: otherwise it would be put in as a string.
 */
export class SqliteViews extends SqlViews {
    protected readonly emptyObject = `'{}'`;

    constructor(graph: SqliteGraph, depth: Record<string, number> = {}) {
        super(graph, depth);
    }

    object(entries: [string, string][]): string {
        return `json_object(${entries.map(([key, value]) => `${sqlText(key)}, json(${value})`).join(', ')})`;
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
     * which it takes again, as Cypher walks a path: a node reached by several ways is a row for each. SQLite has no
     * arrays, so the relationships taken are a text of their ids, `,1,5,`.
     */
    reached(type: string, direction: Direction, from: string, depth: number): string {
        const walk = this.nextAlias('w');
        const edges = this.steps(type, direction);
        return (
            `WITH RECURSIVE ${walk} (nid, depth, eids) AS (` +
            `SELECT e.b, 1, ',' || e.eid || ',' FROM ${edges} e WHERE e.a = ${from}.nid ` +
            `UNION ALL SELECT e.b, w.depth + 1, w.eids || e.eid || ',' FROM ${walk} w JOIN ${edges} e ON e.a = w.nid ` +
            `WHERE w.depth < ${depth} AND instr(w.eids, ',' || e.eid || ',') = 0) SELECT nid FROM ${walk}`
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
        return `json_group_array(json(${item})${order ? ` ORDER BY ${order}` : ''})`;
    }

    protected select(): string {
        return 'SELECT ';
    }

    protected firstRow(): string {
        return 'LIMIT 1';
    }

    /** A stored `""` reads as `""`, so it is a text and needs no reading of its own. */
    protected orderReads(node: string, property: string): OrderReads {
        const text =
            property === Stamps.PROPERTY
                ? textOf(node, property)
                : `CASE WHEN ${jsonType(node, property)} = 'text' THEN ${textOf(node, property)} END`;
        return {
            num: property === Stamps.PROPERTY ? 'CAST(NULL AS REAL)' : numberOf(node, property),
            txt: text,
            emp: 'CAST(NULL AS INTEGER)'
        };
    }
}
