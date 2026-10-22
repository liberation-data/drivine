import { ClassKind } from '@/annotation/Metadata';
import { idOf } from '@/backend/SaveStatementBuilder';
import { target as targetOf } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { SaveOptions } from '@/manager/SaveOptions';
import { GraphViewModel } from '@/model/GraphViewModel';
import { ModelRegistry } from '@/model/ModelRegistry';
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

/** What writing one node takes: how to find it, and the labels and properties to give it. */
export interface NodeWrite {
    /** The model whose labels and id property the node is found by. */
    model: FragmentModel;
    id: any;
    /** The labels it is made with, when it is not there. */
    labels: string[];
    add: string[];
    remove: string[];
    /** A merge patch: a null removes the property. */
    props: Record<string, any>;
    /** For an open @NodeLabels field: the property recording the labels it wrote, and whether it is replaced. */
    record?: { property: string; replace: boolean };
}

/**
 * The write of a node: found by the labels of `found` (by default its own class's) and its id. With `labelsClear`
 * defined, the node is given the labels its @NodeLabels field holds, and with it true loses those it owns and no longer
 * holds: those `held` records, for an open field.
 */
export function nodeWrite(
    model: FragmentModel,
    object: any,
    props: Record<string, any>,
    labelsClear: boolean | undefined,
    held: Record<string, any>,
    found: FragmentModel = model
): NodeWrite {
    const write: NodeWrite = {
        model: found,
        id: idOf(model, object),
        labels: [...model.labels],
        add: model === found ? [] : model.labels.filter((it) => !found.labels.includes(it)),
        remove: [],
        props
    };
    if (labelsClear !== undefined && model.nodeLabels) {
        const field = model.nodeLabels;
        const labels = [...new Set([...((object?.[field.field] as Iterable<string>) ?? [])])];
        const outside = field.members ? labels.filter((it) => !field.members!.includes(it)) : [];
        if (outside.length) {
            throw new DrivineError(
                `${model.type.name}.${field.field} holds ${outside.join(', ')}, which its labels don't include.`
            );
        }
        if (labels.some((it) => typeof it !== 'string' || it.startsWith('__drivine.'))) {
            throw new DrivineError(
                `${model.type.name}.${field.field} holds a label that isn't a name, or begins '__drivine.'.`
            );
        }
        const owned: string[] = field.members ?? (held[field.recordProperty] as string[] | undefined) ?? [];
        write.add.push(...labels);
        write.labels.push(...labels);
        write.remove = labelsClear ? owned.filter((it) => !labels.includes(it) && !model.labels.includes(it)) : [];
        if (!field.members) {
            write.record = { property: field.recordProperty, replace: labelsClear };
        }
    }
    return write;
}

/** The relationship fields a save of the view replaces: those `replace` names, or with `'all'` every writable one. */
export function replacedFields(view: GraphViewModel, object: any, options: SaveOptions<any>): string[] {
    if (options.replace !== 'all') {
        return options.replace ?? [];
    }
    const root = object[view.rootField];
    if (!view.root.stampField || root?.[view.root.stampField] == null) {
        throw new DrivineError(
            `replace: 'all' needs a ${view.type.name} whose root carries a stamp: an object built from scratch holds ` +
                `its defaults, not what the store holds. Load it first, or name the fields to replace.`
        );
    }
    return view.relationships.filter((it) => !it.readOnly).map((it) => it.field);
}

/** The fragment an object is saved as: its own class where that is a registered subclass fragment, else the target. */
export function concreteModel(registry: ModelRegistry | undefined, target: FragmentModel, object: any): FragmentModel {
    const type = object?.constructor;
    if (!registry || !type || type === target.type || registry.kindOf(type) !== ClassKind.NODE_FRAGMENT) {
        return target;
    }
    return registry.fragment(type);
}
