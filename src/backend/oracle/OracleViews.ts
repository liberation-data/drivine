import { Direction } from '@/annotation/Metadata';
import {
    hasLabels,
    holding,
    jsonKey,
    nodeDocument,
    OracleGraph,
    relatedSubquery,
    sqlText
} from '@/backend/oracle/OracleGraph';
import { byId, NodesOf, OrderReads, SqlViews } from '@/backend/sql/SqlViews';

/**
 * Writes a view on Oracle (see SqlViews): each relationship's nodes aggregated with JSON_ARRAYAGG, and a relationship
 * to a depth followed with CONNECT BY.
 */
export class OracleViews extends SqlViews {
    protected readonly emptyObject = `JSON('{}')`;

    constructor(graph: OracleGraph, depth: Record<string, number> = {}) {
        super(graph, depth);
    }

    object(entries: [string, string][]): string {
        return `JSON_OBJECT(${entries
            .map(([key, value]) => `${sqlText(key)} VALUE ${value}`)
            .join(', ')} RETURNING JSON)`;
    }

    nodeDocument(alias: string): string {
        return nodeDocument(alias);
    }

    hasLabels(alias: string, labels: string[]): string {
        return hasLabels(alias, labels);
    }

    relatedSubquery(...hints: string[]): string {
        return relatedSubquery(...hints);
    }

    reached(type: string, direction: Direction, from: string, depth: number): string {
        const edges =
            direction === Direction.UNDIRECTED
                ? `(SELECT src AS a, dst AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)} UNION ALL ` +
                  `SELECT dst, src FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`
                : direction === Direction.INCOMING
                ? `(SELECT dst AS a, src AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`
                : `(SELECT src AS a, dst AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`;
        return `SELECT b AS nid FROM ${edges} START WITH a = ${from}.nid CONNECT BY NOCYCLE PRIOR b = a AND LEVEL <= ${depth}`;
    }

    /**
     * They're joined from the ids, so a query correlated to another row is read from where it starts; tested with
     * `IN`, Oracle would test every node against it. The hint has each read by its id: Oracle takes a test of a node's
     * labels for a lookup of one row, and would read every node of the label for each id.
     */
    nodesOf(ids: string, x: string): NodesOf {
        const r = this.nextAlias('r');
        return {
            from: `FROM (SELECT DISTINCT nid FROM (${ids})) ${r} JOIN ${this.graph.nodes} ${x} ON ${x}.nid = ${r}.nid`,
            hint: byId(x)
        };
    }

    number(node: string, property: string): string {
        return `JSON_VALUE(${node}.props, '$${jsonKey(property)}' RETURNING NUMBER)`;
    }

    zeroIfNull(value: string): string {
        return `NVL(${value}, 0)`;
    }

    protected arrayOf(item: string, order?: string): string {
        return `JSON_ARRAYAGG(${item}${order ? ` ORDER BY ${order}` : ''} RETURNING JSON)`;
    }

    protected select(hint: string): string {
        return `SELECT /*+ ${hint} */ `;
    }

    /** `JSON_VALUE` reads a stored `""` as null, so whether the node holds one is read on its own. */
    protected orderReads(node: string, property: string): OrderReads {
        const key = `$${jsonKey(property)}`;
        const read = holding(node, property);
        return {
            num: `JSON_VALUE(${read}, '${key}.numberOnly()' RETURNING NUMBER)`,
            txt: `JSON_VALUE(${read}, '${key}')`,
            emp: `CASE WHEN JSON_EXISTS(${read}, '${key}?(@ == "")') THEN 1 END`
        };
    }
}
