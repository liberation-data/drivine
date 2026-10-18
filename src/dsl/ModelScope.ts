import { DrivineError } from '@/DrivineError';
import { FragmentModel, PropertyBagModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelatedModel, RelationshipModel } from '@/model/RelationshipModel';
import { RelationshipFragmentModel } from '@/model/RelationshipFragmentModel';

/** Where a query's path stands: on a view, a fragment, a property bag, or a relationship fragment. */
export type Scope =
    | { kind: 'VIEW'; model: GraphViewModel }
    | { kind: 'FRAGMENT'; model: FragmentModel }
    | { kind: 'BAG'; model: FragmentModel; bag: PropertyBagModel }
    | { kind: 'REL_FRAGMENT'; model: RelationshipFragmentModel };

/** Where one field of a path leads. */
export type Step =
    /** To the same node, seen another way: a view's root, a fragment's property bag. */
    | { kind: 'SAME_NODE'; scope: Scope }
    /** From a relationship fragment to the node it leads to. */
    | { kind: 'TARGET'; scope: Scope }
    /** Along a view's relationship, to the nodes it leads to. */
    | { kind: 'HOP'; rel: RelationshipModel; scope: Scope }
    /** To a property of the node, or of the relationship a relationship fragment holds. */
    | { kind: 'PROPERTY'; property: string; on: 'NODE' | 'RELATIONSHIP'; jsonPacked: boolean }
    /** To a @NodeLabels field: the node's labels. */
    | { kind: 'LABELS' };

export function scopeOf(related: RelatedModel): Scope {
    switch (related.kind) {
        case 'GRAPH_VIEW':
            return { kind: 'VIEW', model: related.model };
        case 'NODE_FRAGMENT':
            return { kind: 'FRAGMENT', model: related.model };
        default:
            return { kind: 'REL_FRAGMENT', model: related.model };
    }
}

export function step(scope: Scope, name: string): Step {
    switch (scope.kind) {
        case 'VIEW':
            return viewStep(scope.model, name);
        case 'FRAGMENT':
            return fragmentStep(scope.model, name);
        case 'BAG':
            return { kind: 'PROPERTY', property: `${scope.bag.namespace}${name}`, on: 'NODE', jsonPacked: false };
        default:
            return relationshipFragmentStep(scope.model, name);
    }
}

function viewStep(model: GraphViewModel, name: string): Step {
    if (name === model.rootField) {
        return { kind: 'SAME_NODE', scope: { kind: 'FRAGMENT', model: model.root } };
    }
    const rel = model.relationships.find((it) => it.field === name);
    if (rel) {
        return { kind: 'HOP', rel, scope: scopeOf(rel.related) };
    }
    if (model.paths.some((it) => it.field === name) || model.aggregates.some((it) => it.field === name)) {
        throw new DrivineError(
            `${model.type.name}.${name} is computed when the view is read, so a query can't test or order by it yet.`
        );
    }
    throw new DrivineError(`${model.type.name} has no root or relationship field ${name}.`);
}

function fragmentStep(model: FragmentModel, name: string): Step {
    if (model.transientFields.has(name)) {
        throw new DrivineError(`${model.type.name}.${name} is transient: it isn't stored, so a query can't test it.`);
    }
    const bag = model.propertyBags.find((it) => it.field === name);
    if (bag) {
        return { kind: 'SAME_NODE', scope: { kind: 'BAG', model, bag } };
    }
    if (model.nodeLabels?.field === name) {
        return { kind: 'LABELS' };
    }
    return {
        kind: 'PROPERTY',
        property: model.graphProperties.get(name) ?? name,
        on: 'NODE',
        jsonPacked: model.jsonPacked.has(name)
    };
}

function relationshipFragmentStep(model: RelationshipFragmentModel, name: string): Step {
    if (name === model.targetField) {
        return { kind: 'TARGET', scope: scopeOf(model.target) };
    }
    if (model.transientFields.has(name)) {
        throw new DrivineError(`${model.type.name}.${name} is transient: it isn't stored, so a query can't test it.`);
    }
    return {
        kind: 'PROPERTY',
        property: model.graphProperties.get(name) ?? name,
        on: 'RELATIONSHIP',
        jsonPacked: model.jsonPacked.has(name)
    };
}
