import { Direction } from '@/annotation/Metadata';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
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

    constructor(private readonly grammar: CypherGrammar) {}

    project(model: GraphViewModel, alias: string): ViewProjection {
        return this.view(model, alias, []);
    }

    /**
     * The predicates a node bound to `alias` must meet to be the root of `model`: each required relationship exists.
     */
    requirements(model: GraphViewModel, alias: string): string[] {
        return model.relationships
            .filter((it) => it.required)
            .map((it) => this.grammar.existenceCheck(pattern(it, alias, '', `:${labelsOf(target(it))}`)));
    }

    private view(model: GraphViewModel, alias: string, path: RelationshipModel[]): ViewProjection {
        const calls: string[] = [];
        const rels = model.relationships.map((rel) => {
            const projection = this.relationship(rel, alias, path);
            calls.push(...projection.calls);
            return `${quoteName(rel.field)}: ${projection.expression}`;
        });
        return { calls, expression: `{root: ${fragment(alias)}, rels: {${rels.join(', ')}}}` };
    }

    private relationship(rel: RelationshipModel, from: string, path: RelationshipModel[]): ViewProjection {
        if (path.filter((it) => it === rel).length >= rel.maxDepth) {
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

        if (this.grammar.viewProjection === 'CALL_SUBQUERY') {
            const collected = `collect(CASE WHEN ${targetAlias} IS NOT NULL THEN ${item} END)`;
            const value = `v${n}`;
            const call =
                `CALL { WITH ${from} OPTIONAL MATCH ${match}${inner.calls.map((it) => ` ${it}`).join('')} ` +
                `RETURN ${rel.isCollection ? collected : `head(${collected})`} AS ${value} }`;
            return { calls: [call], expression: value };
        }
        if (inner.calls.length) {
            throw new Error('An inline projection has no CALL blocks.');
        }
        const comprehension = `[${match} | ${item}]`;
        return { calls: [], expression: rel.isCollection ? comprehension : `head(${comprehension})` };
    }
}

export function fragment(alias: string): string {
    return `{props: properties(${alias}), labels: labels(${alias})}`;
}

/** The node a relationship field leads to: for a relationship fragment, its target. */
function target(rel: RelationshipModel): TargetModel {
    const related = rel.related;
    return related.kind === 'RELATIONSHIP_FRAGMENT' ? related.model.target : related;
}

function labelsOf(into: TargetModel): string {
    const model: FragmentModel = into.kind === 'GRAPH_VIEW' ? into.model.root : into.model;
    return labelExpression(model.labels).slice(1);
}

function pattern(rel: RelationshipModel, from: string, relAlias: string, to: string): string {
    const edge = `[${relAlias}:${quoteName(rel.type)}]`;
    switch (rel.direction) {
        case Direction.INCOMING:
            return `(${from})<-${edge}-(${to})`;
        case Direction.UNDIRECTED:
            return `(${from})-${edge}-(${to})`;
        default:
            return `(${from})-${edge}->(${to})`;
    }
}
