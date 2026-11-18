import { Direction } from '@/annotation/Metadata';
import { CascadeBeyond } from '@/backend/CascadeTargets';
import { quoteName } from '@/backend/Cypher';
import { SqlGraph, sqlText } from '@/backend/sql/SqlGraph';
import { rootOf } from '@/backend/sql/SqlSaves';
import { target } from '@/backend/ViewProjector';
import { AggregateModel, GraphViewModel, PathHop, PathModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { SharedStore } from '@/cypher/SharedCypherCompiler';
import { SqlFragments } from '@/cypher/SqlFragments';

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

/**
 * A cascade as it is walked: what it reaches, the queries of the roots of each view it reaches by the view's class, and
 * the class of the view each of its `beyond` is a relationship of.
 */
interface CascadeWalk {
    cascade: SqlCascade;
    views: Map<Function, string[]>;
    beyond: Function[];
}

/** The FROM that reads node rows by their ids, and the hint its SELECT carries. */
export interface NodesOf {
    from: string;
    hint: string;
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
    /**
     * The shared module's fragments the views write (a path ordered by a hop's property): what they bind is to be bound
     * beside the statement's own, and on Oracle what they ask of the statement written into it (see OracleFragments).
     */
    readonly fragments: SqlFragments;

    private aliasCount = 0;

    /** An empty JSON object. */
    protected abstract readonly emptyObject: string;

    protected constructor(
        protected readonly graph: SqlGraph,
        protected readonly depth: Record<string, number> = {},
        store: SharedStore
    ) {
        this.fragments = new SqlFragments(store, { name: graph.name });
    }

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
     * of the view reaches through the relationships a save writes, as far as each relationship's maxDepth, and only into
     * nested views whose requirements a node meets, as a load would; each relationship followed; and for a relationship
     * to views of the same class, the query of the nodes one level below its maxDepth.
     */
    cascade(model: GraphViewModel, roots: string): SqlCascade {
        const walk: CascadeWalk = { cascade: { reached: [], followed: [], beyond: [] }, views: new Map(), beyond: [] };
        this.reachedFrom(model, 'n', [], [`FROM ${this.graph.nodes} n`], [roots], walk);
        walk.cascade.beyond.forEach((it, i) => it.within.push(...(walk.views.get(walk.beyond[i]) ?? [])));
        return walk.cascade;
    }

    /**
     * The relationships of the type as a subquery of rows `eid`, `a` and `b`, each a step from `a` to `b` in the
     * direction, an undirected relationship a row each way round: what `reached` walks.
     */
    protected steps(type: string, direction: Direction): string {
        const typed = `FROM ${this.graph.edges} WHERE type = ${sqlText(type)}`;
        return direction === Direction.UNDIRECTED
            ? `(SELECT eid, src AS a, dst AS b ${typed} UNION ALL SELECT eid, dst, src ${typed})`
            : direction === Direction.INCOMING
            ? `(SELECT eid, dst AS a, src AS b ${typed})`
            : `(SELECT eid, src AS a, dst AS b ${typed})`;
    }

    /** Whether the node keys `a` and `b` are equal, as the store joins a node back to the node table by its key. */
    protected sameNode(a: string, b: string): string {
        return `${a} = ${b}`;
    }

    /** What ends a query that reads its first row only. */
    protected firstRow(): string {
        return 'FETCH FIRST 1 ROW ONLY';
    }

    private reachedFrom(
        model: GraphViewModel,
        from: string,
        path: RelationshipModel[],
        froms: string[],
        wheres: string[],
        walk: CascadeWalk
    ): void {
        const cascade: SqlCascade = walk.cascade;
        // A read-only field (@ReadOnly, or a list of fragments read over several hops) is not the view's to delete.
        // A view nested in itself is not one: each level is one relationship from the level above.
        for (const rel of model.relationships.filter((it) => !it.readOnly)) {
            const depth = this.depth[rel.field] ?? rel.maxDepth;
            const into = target(rel);
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
                cascade.beyond.push({
                    view: model.type.name,
                    field: rel.field,
                    maxDepth: depth,
                    nodes: query,
                    within: []
                });
                walk.beyond.push(model.type);
                continue;
            }
            cascade.followed.push(rel);
            cascade.reached.push(query);
            if (into.kind === 'GRAPH_VIEW') {
                walk.views.set(into.model.type, [...(walk.views.get(into.model.type) ?? []), query]);
                this.reachedFrom(into.model, step.node, [...path, rel], nextFroms, nextWheres, walk);
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
            : `(SELECT ${item} ${step.from} AND ${where} ${this.firstRow()})`;
    }

    /** A list of fragments read over 1 to `depth` hops, each node once. */
    private deepFragments(rel: RelationshipModel, from: string, depth: number): string {
        const x = this.nextAlias('x');
        const reached = this.reached(rel.type, rel.direction, from, depth);
        const { from: nodes, hint }: NodesOf = this.nodesOf(reached, x);
        const where = `WHERE ${this.hasLabels(x, labelsOf(target(rel)))}`;
        return rel.isCollection
            ? `(${this.select(hint)}${this.arrayOf(this.nodeDocument(x))} ${nodes} ${where})`
            : `(${this.select(hint)}${this.nodeDocument(x)} ${nodes} ${where} ${this.firstRow()})`;
    }

    /** The nodes at the far end of a path, each once: in the order one of its hops names, where one does. */
    private path(path: PathModel, from: string): string {
        const x = this.nextAlias('x');
        const ordered = path.hops.find((it) => it.orderBy);
        if (!ordered) {
            const { from: nodes, hint }: NodesOf = this.nodesOf(this.pathIds(path, from), x);
            return path.isCollection
                ? `(${this.select(hint)}${this.arrayOf(this.nodeDocument(x))} ${nodes})`
                : `(${this.select(hint)}${this.nodeDocument(x)} ${nodes} ${this.firstRow()})`;
        }
        const o = this.nextAlias('o');
        const kept = `${this.nextAlias('k')}_`;
        const terms = this.pathTerms(ordered);
        const nodes =
            `FROM ${this.graph.nodes} ${x} JOIN (${this.orderedPathNodes(path, from, ordered, terms)}) ${o} ` +
            `ON ${o}.nid = ${x}.nid JOIN ${this.graph.nodes} ${kept} ON ${this.sameNode(`${kept}.nid`, `${o}.hop`)}`;
        const order = `${terms(kept)}, ${x}.nid`;
        return path.isCollection
            ? `(SELECT ${this.arrayOf(this.nodeDocument(x), order)} ${nodes})`
            : `(SELECT ${this.nodeDocument(x)} ${nodes} ORDER BY ${order} ${this.firstRow()})`;
    }

    /**
     * The terms that order the node row `row`, of a node of the hop a path is ordered by, as Cypher orders the hop's
     * property: the shared module's (drivine-cypher-spec#235, its fragments; drivine4j's `pathOrder`), whatever its
     * kind, a date included, read highest first where the hop reads so, and a node without the property last
     * whichever way the path is read.
     */
    private pathTerms(ordered: PathHop): (row: string) => string {
        return (row) =>
            this.fragments
                .ordered(
                    { n: { node: row, labels: [] } },
                    `n.${quoteName(ordered.orderBy!)}`,
                    !ordered.ascending,
                    'LAST'
                )
                .join(', ');
    }

    /**
     * The nodes at the far end of a path, each once, as `nid`, with as `hop` the node of the hop the path is ordered by
     * that it keeps: the first of those that lead to it in Cypher's order of the hop's property, `terms`, the lowest or,
     * read highest first, the highest. A node of the hop without the property is kept only where none that leads to it
     * has it.
     */
    private orderedPathNodes(path: PathModel, from: string, ordered: PathHop, terms: (row: string) => string): string {
        const { body, nodes }: PathRows = this.pathRows(path, from);
        const node = nodes[path.hops.indexOf(ordered)];
        const last = nodes[nodes.length - 1];
        return this.firstOfWays(
            `SELECT ${last}.nid AS nid, ${node}.nid AS hop, ${node}.props AS props, ${node}.stamp AS stamp ${body}`,
            terms
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

    /**
     * The ways `ways` reaches the nodes at the far end of a path, rows of `nid`, `hop`, `props` and `stamp`, the node
     * reached and the node of the ordered hop the way passes through, with its properties and stamp (which a path
     * ordered by the stamp reads): grouped by `nid`, each with as `hop` the first of its ways' by `terms`, which order a
     * row of the node of the hop.
     */
    protected abstract firstOfWays(ways: string, terms: (row: string) => string): string;
}

/** The hint that has Oracle read the node row `x` by its id, through the primary key. */
export function byId(x: string): string {
    return `INDEX(${x} (nid))`;
}

/** The labels of the node a relationship leads to: a view's root's, or the fragment's. */
function labelsOf(into: TargetModel): string[] {
    return rootOf(into).labels;
}
