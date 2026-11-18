import { Direction } from '@/annotation/Metadata';
import {
    hasLabels,
    jsonKey,
    nodeDocument,
    OracleGraph,
    relatedSubquery,
    sameKey,
    sqlText
} from '@/backend/oracle/OracleGraph';
import { byId, NodesOf, SqlViews } from '@/backend/sql/SqlViews';

/**
 * Writes a view on Oracle (see SqlViews): each relationship's nodes aggregated with JSON_ARRAYAGG, and a relationship
 * to a depth followed by a join for each relationship along the way.
 */
export class OracleViews extends SqlViews {
    protected readonly emptyObject = `JSON('{}')`;

    constructor(graph: OracleGraph, depth: Record<string, number> = {}) {
        super(graph, depth, 'oracle');
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
        const edges = this.steps(type, direction);
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

    /**
     * The first hop of each node reached in the order `terms`, over the properties of the hop's node each way carries:
     * by a window over the ways, `FIRST_VALUE` and not `KEEP (DENSE_RANK FIRST …)`, which ends Oracle's (23.26) server
     * process ordered by a value of JSON (drivine4j's `OracleSelect.pathOrder`).
     */
    protected firstOfWays(ways: string, terms: (row: string) => string): string {
        const w = `${this.nextAlias('w')}_`;
        const r = this.nextAlias('r');
        return (
            `SELECT ${r}.nid, MIN(${r}.hop) AS hop FROM (SELECT ${w}.nid, FIRST_VALUE(${w}.hop) OVER ` +
            `(PARTITION BY ${w}.nid ORDER BY ${terms(w)}) AS hop FROM (${ways}) ${w}) ${r} GROUP BY ${r}.nid`
        );
    }

    /** By the keys Oracle keeps, as the module's compiler joins a node back ({@link sameKey}). */
    protected sameNode(a: string, b: string): string {
        return sameKey(a, b);
    }
}
