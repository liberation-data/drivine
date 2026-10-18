import { Direction } from '@/annotation/Metadata';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { ViewProjector } from '@/backend/ViewProjector';

/**
 * The nodes a view reaches from its root, as one list expression: a pattern comprehension per position in the view,
 * each a flat path from the root, joined with `+`. Paths are flat, with no comprehension nested in another, because
 * FalkorDB evaluates nested ones wrongly when they are combined (FalkorDB/FalkorDB#2006, #3386).
 *
 * The view's maxDepth and the requirements of its nested views apply, so the list holds what loading the view would
 * load. A node reached by two paths is listed twice.
 */
export class CascadeTargets {
    private aliasCount = 0;

    constructor(private readonly grammar: CypherGrammar) {}

    of(model: GraphViewModel, root: string): string {
        const lists = this.view(model, `(${root})`, [], []);
        return lists.length ? lists.join(' + ') : '[]';
    }

    private view(model: GraphViewModel, chain: string, conditions: string[], path: RelationshipModel[]): string[] {
        return model.relationships.flatMap((rel) => {
            if (path.filter((it) => it === rel).length >= rel.maxDepth) {
                return [];
            }
            const alias = `c${++this.aliasCount}`;
            const into = target(rel);
            const extended = `${chain}${hop(rel)}(${alias}${labelExpression(labelsOf(into))})`;
            const own = into.kind === 'GRAPH_VIEW' ? new ViewProjector(this.grammar).requirements(into.model, alias) : [];
            const all = [...conditions, ...own];
            const where = all.length ? ` WHERE ${all.join(' AND ')}` : '';
            const here = `[${extended}${where} | ${alias}]`;
            return into.kind === 'GRAPH_VIEW'
                ? [here, ...this.view(into.model, extended, all, [...path, rel])]
                : [here];
        });
    }
}

function target(rel: RelationshipModel): TargetModel {
    const related = rel.related;
    return related.kind === 'RELATIONSHIP_FRAGMENT' ? related.model.target : related;
}

function labelsOf(into: TargetModel): string[] {
    return into.kind === 'GRAPH_VIEW' ? into.model.root.labels : into.model.labels;
}

function hop(rel: RelationshipModel): string {
    const edge = `[:${quoteName(rel.type)}]`;
    switch (rel.direction) {
        case Direction.INCOMING:
            return `<-${edge}-`;
        case Direction.UNDIRECTED:
            return `-${edge}-`;
        default:
            return `-${edge}->`;
    }
}
