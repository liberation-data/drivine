import { Direction } from '@/annotation/Metadata';
import { selfLoopOnce, SqlGraph, sqlText } from '@/backend/sql/SqlGraph';
import { RelationshipModel } from '@/model/RelationshipModel';

/**
 * The nodes of `cascade_targets` a `DELETE_ORPHAN` keeps, as the body of a recursive query named `cascade_kept`. A node
 * is kept when a node outside the cascade (`cascade_all`, the roots and the targets) is related to it, or when it is one
 * step of a relationship the cascade follows below a kept one: a kept message keeps its attachments, and its session
 * is still deleted. What is kept is read before anything is deleted, so a node's relationships to the others the
 * cascade takes do not keep it. `union` joins the two: `UNION` where the store reads a recursive query so, which keeps
 * each node once, and `UNION ALL` where it must.
 *
 * Where it follows a relationship of either direction and the store asks (`bothWays`), each step reads the
 * relationships both ways round ({@link SqlGraph.bothWays}) and joins on an equality, where an OR across the two
 * directions read every relationship at each step: on Oracle 30 ms against under 10, and on SQLite 93 ms against 7,
 * from 20 nodes over 40,000 relationships. Postgres probes the OR by index (0.6 ms), and read both ways round there it
 * hashed the whole table at each step (34 ms), so it keeps the OR (#588).
 */
export function keptTargets(
    graph: SqlGraph,
    followed: RelationshipModel[],
    union: 'UNION' | 'UNION ALL',
    bothWays: boolean = false
): string {
    const steps = followed.filter(
        (rel, i) => followed.findIndex((it) => it.type === rel.type && it.direction === rel.direction) === i
    );
    const outside =
        `SELECT t.nid FROM cascade_targets t WHERE EXISTS (SELECT 1 FROM ${graph.edges} e ` +
        `WHERE (e.src = t.nid AND e.dst NOT IN (SELECT nid FROM cascade_all)) ` +
        `OR (e.dst = t.nid AND e.src NOT IN (SELECT nid FROM cascade_all)))`;
    if (bothWays && steps.some((rel) => rel.direction === Direction.UNDIRECTED)) {
        // Each relationship read from the kept node k's end: as stored going out, the other way round coming in.
        const holds = steps
            .map((rel) => {
                const type = `e.type = ${sqlText(rel.type)}`;
                return rel.direction === Direction.INCOMING
                    ? `(${type} AND e.back = 1)`
                    : rel.direction === Direction.UNDIRECTED
                    ? `(${type} AND ${selfLoopOnce('e')})`
                    : `(${type} AND e.back = 0)`;
            })
            .join(' OR ');
        return [
            outside,
            union,
            `SELECT e.b FROM cascade_kept k JOIN ${graph.bothWays()} e ON e.a = k.nid AND (${holds}) ` +
                `WHERE e.b IN (SELECT nid FROM cascade_targets)`
        ].join('\n    ');
    }
    // The far end of the edge e from the kept node k.
    const far = 'CASE WHEN e.src = k.nid THEN e.dst ELSE e.src END';
    const holds = steps
        .map((rel) => {
            const type = `e.type = ${sqlText(rel.type)}`;
            return rel.direction === Direction.INCOMING
                ? `(${type} AND e.dst = k.nid)`
                : rel.direction === Direction.UNDIRECTED
                ? `(${type} AND (e.src = k.nid OR e.dst = k.nid))`
                : `(${type} AND e.src = k.nid)`;
        })
        .join(' OR ');
    return [
        outside,
        union,
        `SELECT ${far} FROM cascade_kept k JOIN ${graph.edges} e ON ${holds} ` +
            `WHERE ${far} IN (SELECT nid FROM cascade_targets)`
    ].join('\n    ');
}

/**
 * The read that counts the nodes `beyond` selects, one level below a relationship's maxDepth, that are not nodes of the
 * view the cascade takes otherwise (`within`) nor its roots (`roots`, the query of the roots' ids): those the delete
 * would leave behind. `within` and `beyond` read the roots from `cascade_roots`. Returns one number: `{beyond}`.
 */
export function beyondCount(roots: string, within: string[], beyond: string): string {
    return [
        `WITH cascade_roots AS (${roots}),`,
        `cascade_levels AS (SELECT t.nid FROM (${within.join('\n    UNION ALL ')}) t)`,
        `SELECT CAST(COUNT(DISTINCT b.nid) AS integer) AS "beyond" FROM (${beyond}) b`,
        `WHERE b.nid NOT IN (SELECT nid FROM cascade_levels) AND b.nid NOT IN (SELECT nid FROM cascade_roots)`
    ].join('\n');
}
