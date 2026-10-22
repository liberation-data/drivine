import { Direction } from '@/annotation/Metadata';
import { CascadeBeyond } from '@/backend/CascadeTargets';
import { SqlGraph, sqlText } from '@/backend/sql/SqlGraph';
import { rootOf } from '@/backend/sql/SqlSaves';
import { target } from '@/backend/ViewProjector';
import { AggregateModel, GraphViewModel, PathHop, PathModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';

/** The FROM and WHERE of a path, and the row each of its hops reaches. */
interface PathRows {
    body: string;
    nodes: string[];
}

/**
 * What a cascade reaches from its roots: queries of the ids of the nodes, each relationship followed to them, and for
 * each relationship to views of its own class the query of the nodes one level below its maxDepth, which the cascade
 * would leave behind.
 */
export interface SqlCascade {
    reached: string[];
    followed: RelationshipModel[];
    beyond: CascadeBeyond[];
}

/** The FROM that reads node rows by their ids, and the hint its SELECT carries. */
export interface NodesOf {
    from: string;
    hint: string;
}

/** What a path ordered by a hop reads of the hop's node: its value as a number, as text, and whether it is `""`. */
export interface OrderReads {
    num: string;
    txt: string;
    emp: string;
}

/**
 * Writes a view as one JSON document per root, `{root, rels}`, as the graph engines return it: each relationship a
 * correlated subquery over the relationship table, its nodes aggregated into a JSON array. A relationship is followed
 * as many times as its maxDepth along any one path; past that, a list is empty and a single absent.
 *
 * Oracle and Postgres read a view alike; what is each store's own is its dialect: a JSON object and array, a node's
 * document, a label test, the nodes a relationship reaches to a depth, a property read as a number, and the hints
 * Oracle's subqueries carry.
 */
export abstract class SqlViews {
    private aliasCount = 0;

    /** An empty JSON object. */
    protected abstract readonly emptyObject: string;

    protected constructor(
        protected readonly graph: SqlGraph,
        protected readonly depth: Record<string, number> = {}
    ) {}

    // ----- Views -----

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
                return `EXISTS (${this.relatedSubquery()} ${step.from} AND ${step.x})`;
            });
        const paths = model.paths.filter((it) => it.required).map((path) => `EXISTS (${this.pathIds(path, alias)})`);
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
        const edge = this.nextAlias('e');
        const node = this.nextAlias('x');
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
            x: labels.length ? this.hasLabels(node, labels) : '1 = 1'
        };
    }

    /**
     * What a cascade from the roots the predicate `roots` selects of the node row `n` reaches: queries of the ids of the nodes a load
     * of the view reaches, as far as each relationship's maxDepth, and only into nested views whose requirements a node
     * meets, as a load would; each relationship followed; and for a relationship to views of the same class, the query
     * of the nodes one level below its maxDepth.
     */
    cascade(model: GraphViewModel, roots: string): SqlCascade {
        const cascade: SqlCascade = { reached: [], followed: [], beyond: [] };
        this.reachedFrom(model, 'n', [], [`FROM ${this.graph.nodes} n`], [roots], cascade);
        return cascade;
    }

    private reachedFrom(
        model: GraphViewModel,
        from: string,
        path: RelationshipModel[],
        froms: string[],
        wheres: string[],
        cascade: SqlCascade
    ): void {
        for (const rel of model.relationships) {
            const depth = this.depth[rel.field] ?? rel.maxDepth;
            const into = target(rel);
            if (rel.related.kind === 'NODE_FRAGMENT' && depth > 1) {
                const x = this.nextAlias('x');
                const r = this.nextAlias('r');
                const reached = this.reached(rel.type, rel.direction, from, depth);
                cascade.followed.push(rel);
                cascade.reached.push(
                    `${this.select(byId(x))}${x}.nid ${froms.join(' ')} CROSS JOIN LATERAL (${reached}) ${r} ` +
                        `JOIN ${this.graph.nodes} ${x} ON ${x}.nid = ${r}.nid ` +
                        `WHERE ${[...wheres, this.hasLabels(x, labelsOf(into))].join(' AND ')}`
                );
                continue;
            }
            const deep = path.filter((it) => it === rel).length >= depth;
            if (deep && !(into.kind === 'GRAPH_VIEW' && into.model.type === model.type)) {
                continue;
            }
            const step = this.step(rel.type, rel.direction, from, labelsOf(into));
            const [fromClause, whereClause] = step.from.split('\nWHERE ');
            const nextFroms = [...froms, fromClause.replace(/^FROM /, 'CROSS JOIN ')];
            const required = into.kind === 'GRAPH_VIEW' ? this.requirements(into.model, step.node) : [];
            const nextWheres = [...wheres, whereClause, step.x, ...required];
            const query = `SELECT ${step.node}.nid ${nextFroms.join(' ')} WHERE ${nextWheres.join(' AND ')}`;
            if (deep) {
                cascade.beyond.push({ view: model.type.name, field: rel.field, maxDepth: depth, nodes: query });
                continue;
            }
            cascade.followed.push(rel);
            cascade.reached.push(query);
            if (into.kind === 'GRAPH_VIEW') {
                this.reachedFrom(into.model, step.node, [...path, rel], nextFroms, nextWheres, cascade);
            }
        }
    }

    private view(model: GraphViewModel, alias: string, path: RelationshipModel[]): string {
        const entries: [string, string][] = [
            ...model.relationships.map((rel): [string, string] => [rel.field, this.relationship(rel, alias, path)]),
            ...model.paths.map((it): [string, string] => [it.field, this.path(it, alias)]),
            ...model.aggregates.map((it): [string, string] => [it.field, this.aggregate(it, alias)])
        ];
        const rels = entries.length ? this.object(entries) : this.emptyObject;
        return this.object([
            ['root', this.nodeDocument(alias)],
            ['rels', rels]
        ]);
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
            into.kind === 'GRAPH_VIEW'
                ? this.view(into.model, step.node, [...path, rel])
                : this.nodeDocument(step.node);
        const item =
            rel.related.kind === 'RELATIONSHIP_FRAGMENT'
                ? this.object([
                      ['rel', `${step.edge}.props`],
                      ['target', node]
                  ])
                : node;
        const required = into.kind === 'GRAPH_VIEW' ? this.requirements(into.model, step.node) : [];
        const where = [step.x, ...required].join(' AND ');
        return rel.isCollection
            ? `(SELECT ${this.arrayOf(item)} ${step.from} AND ${where})`
            : `(SELECT ${item} ${step.from} AND ${where} FETCH FIRST 1 ROW ONLY)`;
    }

    /** A list of fragments read over 1 to `depth` hops, each node once. */
    private deepFragments(rel: RelationshipModel, from: string, depth: number): string {
        const x = this.nextAlias('x');
        const reached = this.reached(rel.type, rel.direction, from, depth);
        const { from: nodes, hint }: NodesOf = this.nodesOf(reached, x);
        const where = `WHERE ${this.hasLabels(x, labelsOf(target(rel)))}`;
        return rel.isCollection
            ? `(${this.select(hint)}${this.arrayOf(this.nodeDocument(x))} ${nodes} ${where})`
            : `(${this.select(hint)}${this.nodeDocument(x)} ${nodes} ${where} FETCH FIRST 1 ROW ONLY)`;
    }

    /** The nodes at the far end of a path, each once: in the order one of its hops names, where one does. */
    private path(path: PathModel, from: string): string {
        const x = this.nextAlias('x');
        const ordered = path.hops.find((it) => it.orderBy);
        if (!ordered) {
            const { from: nodes, hint }: NodesOf = this.nodesOf(this.pathIds(path, from), x);
            return path.isCollection
                ? `(${this.select(hint)}${this.arrayOf(this.nodeDocument(x))} ${nodes})`
                : `(${this.select(hint)}${this.nodeDocument(x)} ${nodes} FETCH FIRST 1 ROW ONLY)`;
        }
        const o = this.nextAlias('o');
        const direction = ordered.ascending ? 'ASC' : 'DESC';
        const nodes = `FROM ${this.graph.nodes} ${x} JOIN (${this.orderedPathNodes(
            path,
            from,
            ordered
        )}) ${o} ON ${o}.nid = ${x}.nid`;
        const order =
            `${o}.order_kind ${direction} NULLS LAST, ${o}.order_number ${direction} NULLS LAST, ` +
            `${o}.order_text ${direction} NULLS ${ordered.ascending ? 'FIRST' : 'LAST'}, ${x}.nid`;
        return path.isCollection
            ? `(SELECT ${this.arrayOf(this.nodeDocument(x), order)} ${nodes})`
            : `(SELECT ${this.nodeDocument(x)} ${nodes} ORDER BY ${order} FETCH FIRST 1 ROW ONLY)`;
    }

    /**
     * The nodes at the far end of a path, each with the value the hop the path is ordered by keeps for it: that of the
     * first node of the hop that leads to it, the lowest or, read highest first, the highest. The node the hop reaches
     * is mapped to no class, so its property's type is not known: it is read as a number, which is null for a value
     * that is not a JSON number (a text of digits included), and as text. `order_kind` is 0 for a text, 1 for a number
     * and null for a node without the property, so a text comes before a number read lowest first, as the graph engines
     * order them, and a node without the property last, whichever way the path is read. Only the kind kept is read
     * further: a node reached through a text and a number keeps the text, read lowest first, and the number, read
     * highest first. Where the store reads a stored `""` as null (Oracle), whether the node holds one is read on its
     * own: it is a text, and the lowest. `order_text` is null for it, and orders first among the texts read lowest
     * first.
     */
    private orderedPathNodes(path: PathModel, from: string, ordered: PathHop): string {
        const { body, nodes }: PathRows = this.pathRows(path, from);
        const node = nodes[path.hops.indexOf(ordered)];
        const last = nodes[nodes.length - 1];
        const r = this.nextAlias('r');
        const keep = ordered.ascending ? 'MIN' : 'MAX';
        const reads = this.orderReads(node, ordered.orderBy!);
        const kind =
            `${keep}(CASE WHEN ${r}.num IS NOT NULL THEN 1 ` + `WHEN ${r}.txt IS NOT NULL OR ${r}.emp = 1 THEN 0 END)`;
        const text = `CASE WHEN ${r}.num IS NULL THEN ${r}.txt END`;
        // Read lowest first, a node that a "" leads to keeps no text, which orders first among the texts.
        const kept = ordered.ascending ? `CASE WHEN MAX(${r}.emp) IS NULL THEN MIN(${text}) END` : `MAX(${text})`;
        return (
            `SELECT ${r}.nid, ${kind} AS order_kind, ` +
            `CASE WHEN ${kind} = 1 THEN ${keep}(${r}.num) END AS order_number, ` +
            `CASE WHEN ${kind} = 0 THEN ${kept} END AS order_text ` +
            `FROM (SELECT ${last}.nid AS nid, ${reads.num} AS num, ${reads.txt} AS txt, ${reads.emp} AS emp ${body}) ` +
            `${r} GROUP BY ${r}.nid`
        );
    }

    /** The ids of the nodes at the far end of a path from the node row `from`, its hops' labels met. */
    private pathIds(path: PathModel, from: string): string {
        const { body, nodes }: PathRows = this.pathRows(path, from);
        return `SELECT ${nodes[nodes.length - 1]}.nid ${body}`;
    }

    /** The FROM and WHERE of a path from the node row `from`, its hops' labels met, and the row each hop reaches. */
    private pathRows(path: PathModel, from: string): PathRows {
        const froms: string[] = [];
        const wheres: string[] = [];
        const nodes: string[] = [];
        path.hops.forEach((hop, i) => {
            const last = i === path.hops.length - 1;
            const labels = [...(hop.label ? [hop.label] : []), ...(last ? path.target.labels : [])];
            const step = this.step(hop.type, hop.direction, nodes[i - 1] ?? from, labels);
            const [fromClause, whereClause] = step.from.split('\nWHERE ');
            froms.push(i === 0 ? fromClause : fromClause.replace(/^FROM /, 'CROSS JOIN '));
            wheres.push(whereClause, ...(labels.length ? [step.x] : []));
            nodes.push(step.node);
        });
        return { body: `${froms.join(' ')} WHERE ${wheres.join(' AND ')}`, nodes };
    }

    /** An aggregate over the nodes one relationship type leads to: COUNT of relationships, else of property values. */
    private aggregate(aggregate: AggregateModel, from: string): string {
        const step = this.step(aggregate.type, aggregate.direction, from, []);
        const number = aggregate.property ? this.number(step.node, aggregate.property) : undefined;
        const fn =
            aggregate.function === 'COUNT'
                ? `COUNT(${number ?? '*'})`
                : aggregate.function === 'SUM'
                ? this.zeroIfNull(`SUM(${number})`)
                : `${aggregate.function}(${number})`;
        return `(SELECT ${fn} ${step.from})`;
    }

    // ----- The dialect -----

    /** A JSON object of the entries, each a key and the expression for its value. */
    abstract object(entries: [string, string][]): string;

    /** The map a load returns for the node row `alias`. */
    abstract nodeDocument(alias: string): string;

    /** A predicate that holds when the node row `alias` carries every one of the labels. */
    abstract hasLabels(alias: string, labels: string[]): string;

    /** The SELECT of a subquery over related nodes, with the hints given, where the store reads hints. */
    abstract relatedSubquery(...hints: string[]): string;

    /** The ids (a column `nid`) of the nodes 1 to `depth` relationships of the type from the node row `from`. */
    abstract reached(type: string, direction: Direction, from: string, depth: number): string;

    /**
     * The node rows `x` whose ids the query `ids` selects, as a column `nid`, each once: the FROM of a query that reads
     * them, and the hint its SELECT carries.
     */
    abstract nodesOf(ids: string, x: string): NodesOf;

    /** The property of the node row `node` as a number where it holds one, and null where it holds anything else. */
    abstract number(node: string, property: string): string;

    /** `value`, or 0 where it is null. */
    abstract zeroIfNull(value: string): string;

    /** The JSON array of `item` over the rows gathered, in `order` where one is given. */
    protected abstract arrayOf(item: string, order?: string): string;

    /** The SELECT keyword with `hint`, where the store reads one. */
    protected abstract select(hint: string): string;

    /** The property of the node row `node` that a path is ordered by, read as a number, as text, and as whether it is `""`. */
    protected abstract orderReads(node: string, property: string): OrderReads;
}

/** The hint that has Oracle read the node row `x` by its id, through the primary key. */
export function byId(x: string): string {
    return `INDEX(${x} (nid))`;
}

/** The labels of the node a relationship leads to: a view's root's, or the fragment's. */
function labelsOf(into: TargetModel): string[] {
    return rootOf(into).labels;
}
