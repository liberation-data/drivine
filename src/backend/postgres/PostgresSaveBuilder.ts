import { ClassKind } from '@/annotation/Metadata';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { PostgresSaveStatement } from '@/backend/postgres/PostgresSaveStatement';
import { PostgresWriteStatement } from '@/backend/postgres/PostgresWriteStatement';
import { SaveStatement } from '@/backend/SaveStatement';
import { bagEntries, fragmentOf, idOf, objectProps, propsOf } from '@/backend/SaveStatementBuilder';
import { NodeWrites, RootStep, WritePlan } from '@/backend/sql/WritePlan';
import { target as targetOf } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import { heldIds, items, nodeOf, rootOf, stampExcluded } from '@/backend/sql/SqlSaves';
import { NullPolicy } from '@/manager/NullPolicy';
import { RemovedTargets, SaveOptions } from '@/manager/SaveOptions';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { ModelRegistry } from '@/model/ModelRegistry';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { Stamps } from '@/model/Stamps';

/** What writing one node takes: how to find it, and the labels and properties to give it. */
interface NodeWrite {
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
 * Writes a save as one plan for drivine4j's write function, applied whole or not at all, with or without a transaction.
 * It decides what OracleSaveBuilder decides, from the same model: the root found (or made) and locked, checked against
 * the object's stamp when it carries one, its properties written and its labels set; the relationships named in
 * `replace` trimmed; then each related node written and joined, as deep as the view goes. The function keeps stamps by
 * drivine4j's rules, which are the Cypher save's.
 */
export class PostgresSaveBuilder {
    private readonly plan = new WritePlan();
    private readonly stamped: { model: FragmentModel; ids: any[] }[] = [];
    /** For each index a related node's step was given, its stamped model's place among `stamped`, and its id. */
    private readonly handed = new Map<string, { model: number; id: any }>();
    private options: SaveOptions<any> = {};

    constructor(
        private readonly graph: PostgresGraph,
        private readonly registry?: ModelRegistry
    ) {}

    build(
        target: TargetModel,
        object: any,
        options: SaveOptions<any> = {},
        createOnly: boolean = false
    ): SaveStatement {
        this.options = options;
        if (target.kind === 'NODE_FRAGMENT') {
            if (options.replace === 'all' || options.replace?.length) {
                throw new DrivineError(
                    `replace names relationship fields of a view. ${target.model.type.name} is a @NodeFragment.`
                );
            }
            const model = this.concrete(target.model, object);
            const expected = this.root(model, object, createOnly, false);
            return this.statement(model, object, expected);
        }
        const view = target.model;
        const rootObject = object[view.rootField];
        if (rootObject == null) {
            throw new DrivineError(
                `${view.type.name}.${view.rootField}, the root, is ${rootObject}. A view is saved from its root.`
            );
        }
        const replace = this.replacedFields(view, object, options);
        const root = this.concrete(view.root, rootObject);
        const expected = this.root(root, rootObject, createOnly, replace.length > 0);
        this.trims(view, object, replace);
        this.related(view, object, 0, []);
        return this.statement(root, rootObject, expected);
    }

    /** Finds or makes the root, checks it, and writes it. Returns the stamp it was checked against, if any. */
    private root(model: FragmentModel, object: any, createOnly: boolean, replacing: boolean): string | undefined {
        const { only, except }: SaveOptions<any> = this.options;
        const keep = (field: string): boolean => (only ? only.includes(field) : !except?.includes(field));
        const clear = this.options.nullPolicy === NullPolicy.CLEAR;
        const held = this.options.heldProperties ?? {};
        const props: Record<string, any> = { ...objectProps(model, object, this.options) };
        const bagged = { ...model, propertyBags: model.propertyBags.filter((it) => keep(it.field)) };
        bagEntries(bagged, object, Object.keys(held), clear).forEach((value, key) => (props[key] = value));
        const write = this.nodeWrite(
            model,
            object,
            props,
            model.nodeLabels && keep(model.nodeLabels.field) ? clear : undefined,
            held
        );
        const expected: string | undefined = model.stampField ? object[model.stampField] ?? undefined : undefined;
        if (createOnly && expected != null) {
            throw new DrivineError(
                `A ${model.type.name} that carries a stamp was loaded, and create makes a node that is not there. Save it, or update it.`
            );
        }
        // The data token is compared; the whole stamp, and so the links token too, when the save replaces a list.
        const root: RootStep = {
            carried: expected,
            expect: expected == null ? undefined : replacing ? expected : Stamps.dataToken(expected),
            whole: expected != null && replacing,
            mode: createOnly ? 'ABSENT' : 'EITHER'
        };
        this.node(write, undefined, root);
        return expected;
    }

    /**
     * Writes each relationship of a view, from the node the plan numbers `from`: each related node written, then
     * joined; a related view's relationships after, as far as maxDepth.
     */
    private related(view: GraphViewModel, object: any, from: number, path: RelationshipModel[]): void {
        for (const rel of view.relationships) {
            if (rel.readOnly || path.filter((it) => it === rel).length >= rel.maxDepth) {
                continue;
            }
            const into = targetOf(rel);
            for (const item of items(rel, object?.[rel.field])) {
                const node = nodeOf(rel, item);
                if (node == null) {
                    throw new DrivineError(`A ${rel.related.model.type.name} in ${rel.field} has no target node.`);
                }
                const nodeObject = into.kind === 'GRAPH_VIEW' ? node[into.model.rootField] : node;
                const root = rootOf(into);
                const concrete = this.concrete(root, nodeObject);
                const props: Record<string, any> = { ...propsOf(concrete, nodeObject, stampExcluded(concrete)) };
                bagEntries(concrete, nodeObject).forEach((value, key) => (props[key] = value));
                const write = this.nodeWrite(
                    concrete,
                    nodeObject,
                    props,
                    concrete.nodeLabels ? false : undefined,
                    {},
                    root
                );
                const to = this.node(write, this.handedBack(root, write.id));
                const relProps =
                    rel.related.kind === 'RELATIONSHIP_FRAGMENT'
                        ? propsOf(rel.related.model, item, [rel.related.model.targetField])
                        : {};
                this.plan.link(from, to, rel.type, rel.direction, present(relProps), absent(relProps));
                if (into.kind === 'GRAPH_VIEW') {
                    this.related(into.model, node, to, [...path, rel]);
                }
            }
        }
    }

    /**
     * Trims each relationship field named in `replace` to what the object holds: relationships of its type and
     * direction from the root to nodes of its labels, other than those any field of that type and direction holds.
     */
    private trims(view: GraphViewModel, object: any, replace: string[]): void {
        const held = heldIds(view, object).map(storedKey);
        for (const field of replace) {
            const rel = view.relationships.find((it) => it.field === field);
            if (!rel) {
                throw new DrivineError(
                    `replace names ${field}, which is not a relationship field of ${view.type.name}.`
                );
            }
            if (rel.readOnly) {
                throw new DrivineError(
                    `replace names ${view.type.name}.${field}, which is read-only: a save never writes it.`
                );
            }
            const value = object[field];
            if (rel.isCollection && value == null) {
                throw new DrivineError(
                    `${view.type.name}.${field} is ${value}, so it can't say which relationships to keep. Give an empty ` +
                        `list to remove them all.`
                );
            }
            const into = rootOf(targetOf(rel));
            const keep = view.relationships
                .filter((it) => it.type === rel.type && it.direction === rel.direction)
                .flatMap((it) =>
                    items(it, object[it.field]).map((item) => idOf(rootOf(targetOf(it)), fragmentOf(it, item)))
                );
            this.plan.unlink(
                0,
                rel.type,
                rel.direction,
                this.plan.shape(into.labels, idProperty(into)),
                keep.map(storedKey),
                true,
                this.options.removedTargets === RemovedTargets.DELETE_UNREFERENCED,
                held
            );
        }
    }

    /** The step that writes a node: found by the labels and id property of the write's model. */
    private node(write: NodeWrite, index?: string, root?: RootStep): number {
        const key = idProperty(write.model);
        const props = withoutKey(write.props, key);
        const writes: NodeWrites = {
            set: present(props),
            unset: absent(props),
            add: write.add,
            drop: write.remove,
            owned: write.record
                ? { property: write.record.property, clear: write.record.replace, base: write.model.labels }
                : undefined
        };
        return this.plan.node(
            this.plan.shape(write.model.labels, key),
            key,
            write.id,
            storedKey(write.id),
            [...new Set(write.labels)],
            writes,
            index,
            root
        );
    }

    /** The index a related node of the model is handed its stamp back under, where the model declares one. */
    private handedBack(model: FragmentModel, id: any): string | undefined {
        if (!model.stampField) {
            return undefined;
        }
        let place = this.stamped.findIndex((it) => it.model === model);
        if (place < 0) {
            this.stamped.push({ model, ids: [] });
            place = this.stamped.length - 1;
        }
        const index = String(this.handed.size);
        this.handed.set(index, { model: place, id });
        return index;
    }

    private statement(root: FragmentModel, rootObject: any, expected?: string): SaveStatement {
        return new PostgresSaveStatement(
            PostgresWriteStatement.call(this.graph, 'STAMPS'),
            { ...PostgresWriteStatement.bindings(this.plan), root: { id: idOf(root, rootObject) } },
            root,
            rootObject,
            expected,
            this.stamped.map((it) => it.model),
            this.handed
        );
    }

    /** The write of a node: found by the labels of `found` (by default its own class's) and its id. */
    private nodeWrite(
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

    private replacedFields(view: GraphViewModel, object: any, options: SaveOptions<any>): string[] {
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

    private concrete(target: FragmentModel, object: any): FragmentModel {
        const type = object?.constructor;
        if (!this.registry || !type || type === target.type || this.registry.kindOf(type) !== ClassKind.NODE_FRAGMENT) {
            return target;
        }
        return this.registry.fragment(type);
    }
}

/** An id as the store reads its property back with `->>`: text as it is, a number or a boolean as its JSON. */
export function storedKey(id: unknown): string {
    return typeof id === 'string' ? id : JSON.stringify(id);
}

/** The properties a node step writes: its id is the step's key, which a node is made with and found by, and no more. */
export function withoutKey(props: Record<string, any>, key: string): Record<string, any> {
    return Object.fromEntries(Object.entries(props).filter(([name]) => name !== key));
}

/** The properties of a merge patch that are written: those that are not null. */
export function present(props: Record<string, any>): Record<string, any> {
    return Object.fromEntries(Object.entries(props).filter(([, value]) => value != null));
}

/** The properties of a merge patch that are removed: those that are null. */
export function absent(props: Record<string, any>): string[] {
    return Object.entries(props)
        .filter(([, value]) => value == null)
        .map(([key]) => key);
}

function idProperty(model: FragmentModel): string {
    if (!model.nodeIdProperty) {
        throw new DrivineError(`A ${model.type.name} has no @NodeId property. A save merges on the id.`);
    }
    return model.nodeIdProperty;
}
