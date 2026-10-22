import { target as targetOf } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';

/** The walk of an object a SQL store's save makes: the items of a relationship field, and the nodes they hold. */

/** The fields a save writes of a node of the model, leaving out its stamp, which the store keeps. */
export function stampExcluded(model: FragmentModel): string[] {
    return model.stampField ? [model.stampField] : [];
}

/** The fragment a relationship's target is: a view's root, or the fragment itself. */
export function rootOf(into: TargetModel): FragmentModel {
    return into.kind === 'GRAPH_VIEW' ? into.model.root : into.model;
}

/** The node an item of a relationship field holds: a relationship fragment's target, or the item itself. */
export function nodeOf(rel: RelationshipModel, item: any): any {
    return rel.related.kind === 'RELATIONSHIP_FRAGMENT' ? item?.[rel.related.model.targetField] : item;
}

/** The items a relationship field holds: none for null, one for a single relationship. */
export function items(rel: RelationshipModel, value: any): any[] {
    if (value == null) {
        return [];
    }
    if (rel.isCollection && !Array.isArray(value)) {
        throw new DrivineError(`${rel.field} is a list relationship, but holds a ${typeof value}.`);
    }
    return rel.isCollection ? value : [value];
}

/** The ids of every node the object holds, at any depth. */
export function heldIds(view: GraphViewModel, object: any, seen: Set<any> = new Set<any>()): any[] {
    if (object == null || seen.has(object)) {
        return [];
    }
    seen.add(object);
    const ids = [object[view.rootField]?.[view.root.nodeIdField!]];
    for (const rel of view.relationships) {
        const into = targetOf(rel);
        for (const item of items(rel, object[rel.field])) {
            const node = nodeOf(rel, item);
            ids.push(
                ...(into.kind === 'GRAPH_VIEW' ? heldIds(into.model, node, seen) : [node?.[into.model.nodeIdField!]])
            );
        }
    }
    return ids.filter((it) => it != null);
}
