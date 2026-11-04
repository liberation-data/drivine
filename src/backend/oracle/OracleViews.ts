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
 * to a depth followed by a join for each relationship along the way.
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

    /**
     * Each way from the node row `from`, as far as `depth` relationships, taking no relationship twice in a walk, as
     * Cypher takes a relationship once in a path: a node reached by several ways is a row for each. CONNECT BY can't
     * carry the relationships taken, and a recursive WITH can't see the outer row on Oracle (ORA-00904), so the walk
     * is unrolled to its depth, a branch for each length with each pair of its relationships told apart, as drivine4j
     * does (#597).
     */
    reached(type: string, direction: Direction, from: string, depth: number): string {
        const edges =
            direction === Direction.UNDIRECTED
                ? `(SELECT eid, src AS a, dst AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)} UNION ALL ` +
                  `SELECT eid, dst, src FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`
                : direction === Direction.INCOMING
                ? `(SELECT eid, dst AS a, src AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`
                : `(SELECT eid, src AS a, dst AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`;
        const branches: string[] = [];
        for (let k = 1; k <= depth; k++) {
            let branch = `SELECT h${k}.b AS nid FROM ${edges} h1`;
            for (let i = 2; i <= k; i++) {
                branch += ` JOIN ${edges} h${i} ON h${i}.a = h${i - 1}.b`;
            }
            branch += ` WHERE h1.a = ${from}.nid`;
            for (let i = 1; i < k; i++) {
                for (let j = i + 1; j <= k; j++) {
                    branch += ` AND h${i}.eid <> h${j}.eid`;
                }
            }
            branches.push(branch);
        }
        return branches.join(' UNION ALL ');
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
