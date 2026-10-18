import { Direction } from '@/annotation/Metadata';
import { hasLabels, jsonKey, nodeDocument, OracleGraph, sqlText } from '@/backend/oracle/OracleGraph';
import { target } from '@/backend/ViewProjector';
import { FragmentModel } from '@/model/FragmentModel';
import { AggregateModel, GraphViewModel, PathModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';

/**
 * Writes a view as one JSON document per root, `{root, rels}`, as the graph engines return it: each relationship a
 * correlated subquery over the relationship table, its nodes aggregated with JSON_ARRAYAGG. A relationship is followed
 * as many times as its maxDepth along any one path; past that, a list is empty and a single absent.
 */
export class OracleViews {
    private aliasCount = 0;

    constructor(
        private readonly graph: OracleGraph,
        private readonly depth: Record<string, number> = {}
    ) {}

    /** The table of nodes. */
    get graphNodes(): string {
        return this.graph.nodes;
    }

    /** An alias no other part of the statement uses. */
    nextAlias(prefix: string): string {
        return `${prefix}${++this.aliasCount}`;
    }

    /** The document of the view whose root is the node row `alias`. */
    document(model: GraphViewModel, alias: string): string {
        return this.view(model, alias, []);
    }

    /** What the node row `alias` must meet to be the view's root: each required relationship and path is there. */
    requirements(model: GraphViewModel, alias: string): string[] {
        const relationships = model.relationships
            .filter((it) => it.required)
            .map((rel) => {
                const step = this.step(rel.type, rel.direction, alias, labelsOf(target(rel)));
                return `EXISTS (SELECT 1 ${step.from} AND ${step.x})`;
            });
        const paths = model.paths.filter((it) => it.required).map((path) => `EXISTS (${this.pathNodes(path, alias)})`);
        return [...relationships, ...paths];
    }

    /**
     * One relationship of the type from the node row `from`: the clauses `FROM … WHERE …` (ending in an open WHERE to
     * add to), the edge's and the far node's aliases, and the test of the far node's labels (`1 = 1` for none).
     */
    step(
        type: string,
        direction: Direction,
        from: string,
        labels: string[]
    ): { from: string; edge: string; node: string; x: string } {
        const edge = this.alias('e');
        const node = this.alias('x');
        const typed = `${edge}.type = ${sqlText(type)}`;
        const join =
            direction === Direction.INCOMING
                ? `${node}.nid = ${edge}.src WHERE ${edge}.dst = ${from}.nid`
                : direction === Direction.UNDIRECTED
                ? `((${edge}.src = ${from}.nid AND ${node}.nid = ${edge}.dst) OR (${edge}.dst = ${from}.nid AND ` +
                  `${node}.nid = ${edge}.src)) WHERE 1 = 1`
                : `${node}.nid = ${edge}.dst WHERE ${edge}.src = ${from}.nid`;
        const [on, where] = join.split(' WHERE ');
        return {
            from: `FROM ${this.graph.edges} ${edge} JOIN ${this.graph.nodes} ${node} ON ${on}\nWHERE ${where} AND ${typed}`,
            edge,
            node,
            x: labels.length ? hasLabels(node, labels) : '1 = 1'
        };
    }

    /** The ids of the nodes 1 to `depth` relationships of the type away from the node row `from`. */
    reached(type: string, direction: Direction, from: string, depth: number): string {
        const edges =
            direction === Direction.UNDIRECTED
                ? `(SELECT src AS a, dst AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)} UNION ALL ` +
                  `SELECT dst, src FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`
                : direction === Direction.INCOMING
                ? `(SELECT dst AS a, src AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`
                : `(SELECT src AS a, dst AS b FROM ${this.graph.edges} WHERE type = ${sqlText(type)})`;
        return `SELECT b FROM ${edges} START WITH a = ${from}.nid CONNECT BY NOCYCLE PRIOR b = a AND LEVEL <= ${depth}`;
    }

    private view(model: GraphViewModel, alias: string, path: RelationshipModel[]): string {
        const entries = [
            ...model.relationships.map((rel) => [rel.field, this.relationship(rel, alias, path)]),
            ...model.paths.map((it) => [it.field, this.path(it, alias)]),
            ...model.aggregates.map((it) => [it.field, this.aggregate(it, alias)])
        ];
        const rels = entries.length
            ? `JSON_OBJECT(${entries
                  .map(([field, value]) => `${sqlText(field)} VALUE ${value}`)
                  .join(', ')} RETURNING JSON)`
            : `JSON('{}')`;
        return `JSON_OBJECT('root' VALUE ${nodeDocument(alias)}, 'rels' VALUE ${rels} RETURNING JSON)`;
    }

    private relationship(rel: RelationshipModel, from: string, path: RelationshipModel[]): string {
        const depth = this.depth[rel.field] ?? rel.maxDepth;
        if (rel.related.kind === 'NODE_FRAGMENT' && depth > 1) {
            return this.deepFragments(rel, from, depth);
        }
        if (path.filter((it) => it === rel).length >= depth) {
            return 'NULL';
        }
        const into = target(rel);
        const step = this.step(rel.type, rel.direction, from, labelsOf(into));
        const node =
            into.kind === 'GRAPH_VIEW' ? this.view(into.model, step.node, [...path, rel]) : nodeDocument(step.node);
        const item =
            rel.related.kind === 'RELATIONSHIP_FRAGMENT'
                ? `JSON_OBJECT('rel' VALUE ${step.edge}.props, 'target' VALUE ${node} RETURNING JSON)`
                : node;
        const required = into.kind === 'GRAPH_VIEW' ? this.requirements(into.model, step.node) : [];
        const where = [step.x, ...required].join(' AND ');
        return rel.isCollection
            ? `(SELECT JSON_ARRAYAGG(${item} RETURNING JSON) ${step.from} AND ${where})`
            : `(SELECT ${item} ${step.from} AND ${where} FETCH FIRST 1 ROW ONLY)`;
    }

    /** A list of fragments read over 1 to `depth` hops, each node once. */
    private deepFragments(rel: RelationshipModel, from: string, depth: number): string {
        const x = this.alias('x');
        const reached = this.reached(rel.type, rel.direction, from, depth);
        const nodes = `FROM ${this.graph.nodes} ${x} WHERE ${x}.nid IN (${reached}) AND ${hasLabels(
            x,
            labelsOf(target(rel))
        )}`;
        return rel.isCollection
            ? `(SELECT JSON_ARRAYAGG(${nodeDocument(x)} RETURNING JSON) ${nodes})`
            : `(SELECT ${nodeDocument(x)} ${nodes} FETCH FIRST 1 ROW ONLY)`;
    }

    /** The nodes at the far end of a path, each once. */
    private path(path: PathModel, from: string): string {
        const x = this.alias('x');
        const nodes = `FROM ${this.graph.nodes} ${x} WHERE ${x}.nid IN (${this.pathNodes(path, from)})`;
        return path.isCollection
            ? `(SELECT JSON_ARRAYAGG(${nodeDocument(x)} RETURNING JSON) ${nodes})`
            : `(SELECT ${nodeDocument(x)} ${nodes} FETCH FIRST 1 ROW ONLY)`;
    }

    /** The ids of the nodes at the far end of a path from the node row `from`, its hops' labels met. */
    private pathNodes(path: PathModel, from: string): string {
        let at = from;
        const froms: string[] = [];
        const wheres: string[] = [];
        path.hops.forEach((hop, i) => {
            const last = i === path.hops.length - 1;
            const labels = [...(hop.label ? [hop.label] : []), ...(last ? path.target.labels : [])];
            const step = this.step(hop.type, hop.direction, at, labels);
            const [fromClause, whereClause] = step.from.split('\nWHERE ');
            froms.push(i === 0 ? fromClause : fromClause.replace(/^FROM /, 'CROSS JOIN '));
            wheres.push(whereClause, ...(labels.length ? [step.x] : []));
            at = step.node;
        });
        return `SELECT ${at}.nid ${froms.join(' ')} WHERE ${wheres.join(' AND ')}`;
    }

    /** An aggregate over the nodes one relationship type leads to: COUNT of relationships, else of property values. */
    private aggregate(aggregate: AggregateModel, from: string): string {
        const step = this.step(aggregate.type, aggregate.direction, from, []);
        const number = aggregate.property
            ? `JSON_VALUE(${step.node}.props, '$${jsonKey(aggregate.property)}' RETURNING NUMBER)`
            : undefined;
        const fn =
            aggregate.function === 'COUNT'
                ? `COUNT(${number ?? '*'})`
                : aggregate.function === 'SUM'
                ? `NVL(SUM(${number}), 0)`
                : `${aggregate.function}(${number})`;
        return `(SELECT ${fn} ${step.from})`;
    }

    private alias(prefix: string): string {
        return this.nextAlias(prefix);
    }
}

function labelsOf(into: TargetModel): string[] {
    const model: FragmentModel = into.kind === 'GRAPH_VIEW' ? into.model.root : into.model;
    return model.labels;
}
