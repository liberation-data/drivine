import { Direction } from '@/annotation/Metadata';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { FragmentModel } from '@/model/FragmentModel';
import { AggregateModel, GraphViewModel, PathModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';

/**
 * A view's projection: CALL blocks to run, in order, after the root is matched, and the expression the RETURN gives.
 */
export interface ViewProjection {
    calls: string[];
    expression: string;
}

/**
 * Writes the projection of a view.
 *
 * A view projects as `{root: <fragment>, rels: {<field>: ...}}`, a fragment as `{props, labels}`, and a relationship
 * fragment as `{rel, target}`. A list relationship projects as a list, a single one as its first item or null.
 *
 * A relationship is followed as many times as its maxDepth along any one path; past that, a list is `[]` and a
 * single item null. That is what ends a view that refers to itself.
 */
export class ViewProjector {
    private aliasCount = 0;

    /**
     * @param depth maxDepth overrides for this query, by relationship field name.
     */
    constructor(
        private readonly grammar: CypherGrammar,
        private readonly depth: Record<string, number> = {}
    ) {}

    project(model: GraphViewModel, alias: string): ViewProjection {
        return this.view(model, alias, []);
    }

    /**
     * The predicates a node bound to `alias` must meet to be the root of `model`: each required relationship exists.
     */
    requirements(model: GraphViewModel, alias: string): string[] {
        const paths = model.paths
            .filter((it) => it.required)
            .map((it) => {
                if (!this.grammar.farLabelsAfterMatch) {
                    return this.grammar.existenceCheck(pathPattern(it, alias, '', true));
                }
                const far = `p${++this.aliasCount}`;
                return this.grammar.someMatch(pathPattern(it, alias, far, false), far, '', () =>
                    labelTest(far, farLabels(it))
                );
            });
        return [...this.relationshipRequirements(model, alias), ...paths];
    }

    private relationshipRequirements(model: GraphViewModel, alias: string): string[] {
        return model.relationships
            .filter((it) => it.required)
            .map((it) =>
                this.grammar.existenceCheck(pattern(it, alias, '', `:${labelsOf(target(it))}`, this.hops(it)))
            );
    }

    /** How deep a relationship goes for this query. */
    private depthOf(rel: RelationshipModel): number {
        return this.depth[rel.field] ?? rel.maxDepth;
    }

    /** Whether a relationship is read over several hops: a list of fragments with a depth above 1. */
    private multiHop(rel: RelationshipModel): boolean {
        return rel.related.kind === 'NODE_FRAGMENT' && this.depthOf(rel) > 1;
    }

    private view(model: GraphViewModel, alias: string, path: RelationshipModel[]): ViewProjection {
        const calls: string[] = [];
        const rels = model.relationships.map((rel) => {
            const projection = this.relationship(rel, alias, path);
            calls.push(...projection.calls);
            return `${quoteName(rel.field)}: ${projection.expression}`;
        });
        for (const path of model.paths) {
            const projection = this.path(path, alias);
            calls.push(...projection.calls);
            rels.push(`${quoteName(path.field)}: ${projection.expression}`);
        }
        for (const aggregate of model.aggregates) {
            const projection = this.aggregate(aggregate, alias);
            calls.push(...projection.calls);
            rels.push(`${quoteName(aggregate.field)}: ${projection.expression}`);
        }
        return { calls, expression: `{root: ${fragment(alias)}, rels: {${rels.join(', ')}}}` };
    }

    /** The hops a relationship's pattern spans: '' for one, `*1..k` for a fragment list read over several. */
    private hops(rel: RelationshipModel): string {
        return this.multiHop(rel) ? `*1..${this.depthOf(rel)}` : '';
    }

    private relationship(rel: RelationshipModel, from: string, path: RelationshipModel[]): ViewProjection {
        if (this.multiHop(rel)) {
            return this.multiHopFragments(rel, from);
        }
        if (path.filter((it) => it === rel).length >= this.depthOf(rel)) {
            return { calls: [], expression: rel.isCollection ? '[]' : 'null' };
        }
        const n = ++this.aliasCount;
        const relAlias = `r${n}`;
        const targetAlias = `t${n}`;
        const into = target(rel);
        const inner =
            into.kind === 'GRAPH_VIEW'
                ? this.view(into.model, targetAlias, [...path, rel])
                : { calls: [], expression: fragment(targetAlias) };
        const item =
            rel.related.kind === 'RELATIONSHIP_FRAGMENT'
                ? `{rel: properties(${relAlias}), target: ${inner.expression}}`
                : inner.expression;
        const conditions = into.kind === 'GRAPH_VIEW' ? this.requirements(into.model, targetAlias) : [];
        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const match = `${pattern(rel, from, relAlias, `${targetAlias}:${labelsOf(into)}`)}${where}`;

        // Where the grammar projects inline, a view nested here with a CALL of its own, an ordered path's, is read in a
        // CALL too: a pattern comprehension has nowhere to put one.
        if (this.grammar.viewProjection === 'CALL_SUBQUERY' || inner.calls.length) {
            const collected = `collect(CASE WHEN ${targetAlias} IS NOT NULL THEN ${item} END)`;
            const value = `v${n}`;
            const call =
                `CALL { WITH ${from} OPTIONAL MATCH ${match}${inner.calls.map((it) => ` ${it}`).join('')} ` +
                `RETURN ${rel.isCollection ? collected : `head(${collected})`} AS ${value} }`;
            return { calls: [call], expression: value };
        }
        const comprehension = `[${match} | ${item}]`;
        return { calls: [], expression: rel.isCollection ? comprehension : `head(${comprehension})` };
    }

    /**
     * The nodes at the far end of a path, each once, in the order one of its hops names where one does. Where the
     * grammar says so, the far node's labels are tested as each is collected, after the match.
     *
     * An ordered path is read in a CALL on every engine, its rows sorted by ORDER BY before they are collected, as
     * drivine4j reads it: a pattern comprehension has no ORDER BY.
     */
    private path(path: PathModel, from: string): ViewProjection {
        const n = ++this.aliasCount;
        const t = `t${n}`;
        const order = pathOrder(path, t, n);
        const value = `v${n}`;
        if (this.grammar.viewProjection === 'CALL_SUBQUERY') {
            const after = this.grammar.farLabelsAfterMatch;
            const match = pathPattern(path, from, t, !after, order?.node);
            const kept = after ? labelTest(t, farLabels(path)) : `${t} IS NOT NULL`;
            const collected = `collect(DISTINCT CASE WHEN ${kept} THEN ${fragment(t)} END)`;
            return {
                calls: [
                    `CALL { WITH ${from} OPTIONAL MATCH ${match}${this.sorted(from, t, order)} ` +
                        `RETURN ${path.isCollection ? collected : `head(${collected})`} AS ${value} }`
                ],
                expression: value
            };
        }
        const x = `x${n}`;
        if (order) {
            // collect(DISTINCT …) of the nodes, not of their maps: Memgraph's DISTINCT leaves equal maps apart.
            const nodes = `s${n}`;
            const list = `[${x} IN ${nodes} | ${fragment(x)}]`;
            return {
                calls: [
                    `CALL { WITH ${from} OPTIONAL MATCH ${pathPattern(path, from, t, true, order.node)}` +
                        `${this.sorted(from, t, order)} WITH collect(DISTINCT ${t}) AS ${nodes} ` +
                        `RETURN ${path.isCollection ? list : `head(${list})`} AS ${value} }`
                ],
                expression: value
            };
        }
        const reached = `[${pathPattern(path, from, t, true)} | ${t}]`;
        const distinct = `reduce(acc = [], y IN ${reached} | CASE WHEN y IN acc THEN acc ELSE acc + y END)`;
        const list = `[${x} IN ${distinct} | ${fragment(x)}]`;
        return { calls: [], expression: path.isCollection ? list : `head(${list})` };
    }

    /**
     * The rows of a path's match sorted by the key of its order, where it has one: collect(DISTINCT …) keeps each node
     * where it first occurs, so sorting the rows first orders the list. A node without the key comes last whichever way
     * the path is read: the engines put a null last lowest first and first highest first, so the sort asks whether the
     * key is null before it reads the key. Where the engine's ORDER BY orders no values of two kinds, their kinds are
     * ranked first (see CypherGrammar.kindRank).
     */
    private sorted(from: string, far: string, order?: PathOrder): string {
        if (!order) {
            return '';
        }
        const way = order.ascending ? 'ASC' : 'DESC';
        const rank = this.grammar.kindRank ? `${this.grammar.kindRank(order.key)} ${way}, ` : '';
        return (
            ` WITH ${[...new Set([from, far, order.node])].join(', ')} ORDER BY ${order.key} IS NULL, ` +
            `${rank}${order.key} ${way}`
        );
    }

    /** An aggregate over the nodes one relationship type leads to from `from`. */
    private aggregate(aggregate: AggregateModel, from: string): ViewProjection {
        const n = ++this.aliasCount;
        const x = `t${n}`;
        const edge = `[:${quoteName(aggregate.type)}]`;
        const step =
            aggregate.direction === Direction.INCOMING
                ? `(${from})<-${edge}-(${x})`
                : aggregate.direction === Direction.UNDIRECTED
                ? `(${from})-${edge}-(${x})`
                : `(${from})-${edge}->(${x})`;
        const property = aggregate.property ? `${x}.${quoteName(aggregate.property)}` : undefined;
        if (this.grammar.viewProjection === 'CALL_SUBQUERY') {
            const value = `v${n}`;
            const fn =
                aggregate.function === 'COUNT'
                    ? `count(${property ?? x})`
                    : `${aggregate.function.toLowerCase()}(${property})`;
            return {
                calls: [`CALL { WITH ${from} OPTIONAL MATCH ${step} RETURN ${fn} AS ${value} }`],
                expression: value
            };
        }
        const values = property ? `[${step} WHERE ${property} IS NOT NULL | ${property}]` : `[${step} | 1]`;
        switch (aggregate.function) {
            case 'COUNT':
                return { calls: [], expression: `size(${values})` };
            case 'SUM':
                return { calls: [], expression: `reduce(s = 0, v IN ${values} | s + v)` };
            case 'AVG':
                return {
                    calls: [],
                    expression: `CASE WHEN size(${values}) = 0 THEN null ELSE reduce(s = 0.0, v IN ${values} | s + v) / size(${values}) END`
                };
            default: {
                const better = aggregate.function === 'MIN' ? '<' : '>';
                return {
                    calls: [],
                    expression: `reduce(m = null, v IN ${values} | CASE WHEN m IS NULL OR v ${better} m THEN v ELSE m END)`
                };
            }
        }
    }

    /** A list of fragments read over 1 to depth hops, each node once. */
    private multiHopFragments(rel: RelationshipModel, from: string): ViewProjection {
        const n = ++this.aliasCount;
        const t = `t${n}`;
        const match = pattern(rel, from, '', `${t}:${labelsOf(target(rel))}`, this.hops(rel));
        if (this.grammar.viewProjection === 'CALL_SUBQUERY') {
            const collected = `collect(DISTINCT CASE WHEN ${t} IS NOT NULL THEN ${fragment(t)} END)`;
            const value = `v${n}`;
            return {
                calls: [
                    `CALL { WITH ${from} OPTIONAL MATCH ${match} RETURN ${
                        rel.isCollection ? collected : `head(${collected})`
                    } AS ${value} }`
                ],
                expression: value
            };
        }
        const distinct = `reduce(acc = [], y IN [${match} | ${t}] | CASE WHEN y IN acc THEN acc ELSE acc + y END)`;
        const list = `[x${n} IN ${distinct} | ${fragment(`x${n}`)}]`;
        return { calls: [], expression: rel.isCollection ? list : `head(${list})` };
    }
}

export function fragment(alias: string): string {
    return `{props: properties(${alias}), labels: labels(${alias})}`;
}

/** The node a relationship field leads to: for a relationship fragment, its target. */
export function target(rel: RelationshipModel): TargetModel {
    const related = rel.related;
    return related.kind === 'RELATIONSHIP_FRAGMENT' ? related.model.target : related;
}

export function labelsOf(into: TargetModel): string {
    const model: FragmentModel = into.kind === 'GRAPH_VIEW' ? into.model.root : into.model;
    return labelExpression(model.labels).slice(1);
}

export function pattern(rel: RelationshipModel, from: string, relAlias: string, to: string, hops: string = ''): string {
    const edge = `[${relAlias}:${quoteName(rel.type)}${hops}]`;
    switch (rel.direction) {
        case Direction.INCOMING:
            return `(${from})<-${edge}-(${to})`;
        case Direction.UNDIRECTED:
            return `(${from})-${edge}-(${to})`;
        default:
            return `(${from})-${edge}->(${to})`;
    }
}

/**
 * The order a path is read in, where one of its hops names one: the node that hop reaches (the far node when it is the
 * last hop), the key read from it, and which way.
 */
interface PathOrder {
    node: string;
    key: string;
    ascending: boolean;
}

function pathOrder(path: PathModel, far: string, n: number): PathOrder | undefined {
    const at = path.hops.findIndex((it) => it.orderBy);
    if (at < 0) {
        return undefined;
    }
    const hop = path.hops[at];
    const node = at === path.hops.length - 1 ? far : `h${n}`;
    return { node, key: `${node}.${quoteName(hop.orderBy!)}`, ascending: hop.ascending };
}

/** The labels a path's far node carries: its last hop's, and its target's. */
function farLabels(path: PathModel): string[] {
    const last = path.hops[path.hops.length - 1];
    return [...(last.label ? [last.label] : []), ...path.target.labels];
}

/** A test that the node bound to `alias` carries every one of the labels; that it is there, for none. */
export function labelTest(alias: string, labels: string[]): string {
    return labels.length ? labels.map((it) => `${alias}:${quoteName(it)}`).join(' AND ') : `${alias} IS NOT NULL`;
}

/**
 * A path from `from` through its hops, the far node bound to `far` (with its labels, its last hop's among them, when
 * `labelled`), and the node of the hop the path is ordered by bound to `ordered`.
 */
function pathPattern(path: PathModel, from: string, far: string, labelled: boolean, ordered?: string): string {
    const steps = path.hops.map((hop, i) => {
        const last = i === path.hops.length - 1;
        const edge = `[:${quoteName(hop.type)}]`;
        const arrow =
            hop.direction === Direction.INCOMING
                ? `<-${edge}-`
                : hop.direction === Direction.UNDIRECTED
                ? `-${edge}-`
                : `-${edge}->`;
        const own = hop.label ? [hop.label] : [];
        const labels = last ? (labelled ? labelExpression(farLabels(path)) : '') : labelExpression(own);
        const named = last ? far : hop.orderBy && ordered ? ordered : '';
        return `${arrow}(${named}${labels})`;
    });
    return `(${from})${steps.join('')}`;
}
