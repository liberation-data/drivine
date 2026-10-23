import { Direction } from '@/annotation/Metadata';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { labelTest, ViewProjector } from '@/backend/ViewProjector';

/**
 * A relationship of a view to views of its own class, which a cascade follows to its maxDepth, and the nodes one level
 * further: a list expression in Cypher, a query of their ids in SQL. Those are what the cascade would leave behind,
 * with all they hold.
 */
export interface CascadeBeyond {
    /** The view that declares the relationship, and the relationship's field. */
    view: string;
    field: string;
    maxDepth: number;
    nodes: string;
}

/** The nodes one step reaches, as a list expression, the chain that ends in them, and the conditions they meet. */
interface Step {
    list: string;
    extended: string;
    all: string[];
}

/** The nodes a cascade reaches from a root, and where it stops short. */
export interface Cascade {
    targets: string;
    beyond: CascadeBeyond[];
    /**
     * The nodes one step of a relationship the cascade follows above the node `node`, each type and direction once, as
     * a list expression: a node is held by those.
     */
    holders(node: string): string;
}

/**
 * The nodes a view reaches from its root, as one list expression: a pattern comprehension per position in the view,
 * each a flat path from the root, joined with `+`. Paths are flat, with no comprehension nested in another, because
 * FalkorDB evaluates nested ones wrongly when they are combined (FalkorDB/FalkorDB#2006, #3386).
 *
 * The view's maxDepth and the requirements of its nested views apply, so the list holds what loading the view would
 * load through the relationships a save writes. A read-only field is not followed: other code writes what it loads. A
 * node reached by two paths is listed twice. A view that contains itself is read a level at a time, each level holding
 * what the root does.
 */
export class CascadeTargets {
    private aliasCount = 0;
    private readonly followed: RelationshipModel[] = [];
    private readonly beyond: CascadeBeyond[] = [];

    constructor(private readonly grammar: CypherGrammar) {}

    of(model: GraphViewModel, root: string): string {
        return this.cascade(model, root).targets;
    }

    /**
     * What a cascade from the node `root` reaches, with each relationship it follows, and for a relationship to views of
     * the same class the nodes one level below its maxDepth.
     */
    cascade(model: GraphViewModel, root: string): Cascade {
        const lists = this.view(model, `(${root})`, [], []);
        const steps = this.followed.filter(
            (rel, i) => this.followed.findIndex((it) => it.type === rel.type && it.direction === rel.direction) === i
        );
        return {
            targets: lists.length ? lists.join(' + ') : '[]',
            holders: (node) => (steps.length ? steps.map((rel) => `[(h)${hop(rel)}(${node}) | h]`).join(' + ') : '[]'),
            beyond: this.beyond
        };
    }

    private view(model: GraphViewModel, chain: string, conditions: string[], path: RelationshipModel[]): string[] {
        return model.relationships.flatMap((rel) => {
            // A read-only field (@ReadOnly, or a list of fragments read over several hops) is not the view's to delete.
            // A view nested in itself is not one: each level is one relationship from the level above.
            if (rel.readOnly) {
                return [];
            }
            const into = target(rel);
            if (path.filter((it) => it === rel).length >= rel.maxDepth) {
                if (into.kind === 'GRAPH_VIEW' && into.model.type === model.type) {
                    const nodes: string = this.step(rel, into, chain, conditions).list;
                    this.beyond.push({ view: model.type.name, field: rel.field, maxDepth: rel.maxDepth, nodes });
                }
                return [];
            }
            this.followed.push(rel);
            const { list, extended, all }: Step = this.step(rel, into, chain, conditions);
            return into.kind === 'GRAPH_VIEW'
                ? [list, ...this.view(into.model, extended, all, [...path, rel])]
                : [list];
        });
    }

    /** The nodes one step of the relationship reaches from the end of `chain`, and the chain that ends in them. */
    private step(rel: RelationshipModel, into: TargetModel, chain: string, conditions: string[]): Step {
        const alias = `c${++this.aliasCount}`;
        const step = `${chain}${hop(rel)}(${alias}`;
        const extended = `${step}${labelExpression(labelsOf(into))})`;
        const own = into.kind === 'GRAPH_VIEW' ? new ViewProjector(this.grammar).requirements(into.model, alias) : [];
        const all = [...conditions, ...own];
        const where = all.length ? ` WHERE ${all.join(' AND ')}` : '';
        // Where the grammar says so, the far node's labels are tested after the match, the next level's chain
        // keeping them.
        const list = this.grammar.farLabelsAfterMatch
            ? `[${alias} IN [${step})${where} | ${alias}] WHERE ${labelTest(alias, labelsOf(into))}]`
            : `[${extended}${where} | ${alias}]`;
        return { list, extended, all };
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
