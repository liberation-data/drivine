import { PostgresSaveStatement } from '@/backend/postgres/PostgresSaveStatement';
import { PostgresWriteStatement, WriteFunction } from '@/backend/postgres/PostgresWriteStatement';
import { SaveStatement } from '@/backend/SaveStatement';
import {
    bagEntries,
    boundIdOf,
    fragmentOf,
    idOf,
    loadRecordOf,
    objectProps,
    propsOf
} from '@/backend/SaveStatementBuilder';
import { NodeWrites, RootStep, WritePlan } from '@/backend/sql/WritePlan';
import { target as targetOf } from '@/backend/ViewProjector';
import { DrivineError } from '@/DrivineError';
import {
    concreteModel,
    heldIds,
    items,
    nodeOf,
    nodeWrite,
    NodeWrite,
    replacedFields,
    rootOf,
    stampExcluded
} from '@/backend/sql/SqlSaves';
import { NullPolicy } from '@/manager/NullPolicy';
import { RemovedTargets, SaveOptions } from '@/manager/SaveOptions';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { ModelRegistry } from '@/model/ModelRegistry';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { Stamps } from '@/model/Stamps';
import { writeLayout } from '@/cypher/ValueLayout';
import { temporalText } from '@/backend/sql/NodeIds';

/**
 * Writes a save as one plan for drivine4j's write function (Postgres's, or SQLite's: see WriteFunction), applied whole or not at all, with or without a transaction.
 * It decides what OracleSaveBuilder decides, from the same model: the root found (or made) and locked, checked against
 * the object's stamp when it carries one, its properties written and its labels set; the relationships named in
 * `replace` trimmed; then each related node written and joined, as deep as the view goes. The function keeps stamps by
 * drivine4j's rules, which are the Cypher save's.
 */
export class PostgresSaveBuilder {
    private readonly plan = new WritePlan();
    private readonly stamped: FragmentModel[] = [];
    /** For each index a related node's step was given, its stamped model's place among `stamped`, and its id. */
    private readonly handed = new Map<string, { group: number; id: any }>();
    private options: SaveOptions<any> = {};

    constructor(
        private readonly graph: WriteFunction,
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
            const model = concreteModel(this.registry, target.model, object);
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
        const replace = replacedFields(view, object, options);
        const root = concreteModel(this.registry, view.root, rootObject);
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
        const props: Record<string, any> = { ...objectProps(model, object, this.options, true) };
        bagEntries(model, object, Object.keys(held), clear, keep).forEach((value, key) => (props[key] = value));
        const write = nodeWrite(
            model,
            object,
            props,
            model.nodeLabels && keep(model.nodeLabels.field) ? clear : undefined,
            held,
            model,
            loadRecordOf(object, this.options)
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
                const concrete = concreteModel(this.registry, root, nodeObject);
                const props: Record<string, any> = {
                    ...propsOf(concrete, nodeObject, stampExcluded(concrete), false, true)
                };
                bagEntries(concrete, nodeObject).forEach((value, key) => (props[key] = value));
                const write = nodeWrite(concrete, nodeObject, props, concrete.nodeLabels ? false : undefined, {}, root);
                const to = this.node(write, this.handedBack(root, write.id));
                const relProps =
                    rel.related.kind === 'RELATIONSHIP_FRAGMENT'
                        ? propsOf(rel.related.model, item, [rel.related.model.targetField], false, true)
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
        const held = heldIds(view, object).map((it) => storedKey(it, this.graph.store));
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
                    items(it, object[it.field]).map((item) => boundIdOf(rootOf(targetOf(it)), fragmentOf(it, item)))
                );
            this.plan.unlink(
                0,
                rel.type,
                rel.direction,
                this.plan.shape(into.labels, idProperty(into)),
                keep.map((it) => storedKey(it, this.graph.store)),
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
                : undefined,
            lower: write.lower
        };
        return this.plan.node(
            this.plan.shape(write.model.labels, key),
            key,
            write.bound,
            storedKey(write.bound, this.graph.store),
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
        let place = this.stamped.indexOf(model);
        if (place < 0) {
            this.stamped.push(model);
            place = this.stamped.length - 1;
        }
        const index = String(this.handed.size);
        this.handed.set(index, { group: place, id });
        return index;
    }

    private statement(root: FragmentModel, rootObject: any, expected?: string): SaveStatement {
        return new PostgresSaveStatement(
            this.graph.writeCall('STAMPS'),
            { ...PostgresWriteStatement.bindings(this.plan, this.graph.store), root: { id: idOf(root, rootObject) } },
            root,
            rootObject,
            expected,
            this.stamped,
            this.handed
        );
    }
}

/**
 * An id as the text a write plan keys its node by, within the plan (a step's `k`, an unlink's `ids` and `held`), which is
 * how the store's write reads a stored target's id back (the module's `keyText`): text as it is; a temporal value as its
 * tag's text `v`, as the module writes it (drivine4j's `NodeIds.temporalText`), and so an id held as loaded (see
 * boundIdOf) as the text of the tag it was loaded from; and anything else as the JSON text
 * `store`'s layout holds it as (see writeLayout), as a save writes it, so a float id is keyed by the text it is held as
 * (`1.0E-7` on SQLite, where JSON text writes `1e-7`). On Postgres a number is the text `jsonb` gives back for it,
 * `numeric`'s, with no exponent (`0.00000010` for `1.0E-7`): `jsonb` holds a number as a `numeric`, not as the text it was
 * written as. A node is found by its id's JSON, not by this text: see NodeIds.
 */
export function storedKey(id: unknown, store: 'postgres' | 'sqlite'): string {
    if (typeof id === 'string') {
        return id;
    }
    const text = writeLayout(id, store);
    return temporalText(text) ?? (store === 'postgres' ? numericText(text) : text);
}

/**
 * `json`, JSON text, as Postgres's `numeric` writes the number it is, where it is one (`1.0E-7` as `0.00000010`): its
 * digits with no exponent, as many after the point as were written after it less the exponent, and zero with no sign.
 * Any other JSON is as it is.
 */
export function numericText(json: string): string {
    const number = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(json);
    if (!number) {
        return json;
    }
    const [, sign, whole, fraction = '', exponent = '0'] = number;
    const digits = whole + fraction;
    const point = whole.length + Number(exponent);
    const before =
        point <= 0
            ? '0'
            : digits
                  .slice(0, point)
                  .padEnd(point, '0')
                  .replace(/^0+(?=\d)/, '');
    const after = point <= 0 ? '0'.repeat(-point) + digits : digits.slice(point);
    return `${/[1-9]/.test(digits) ? sign : ''}${before}${after ? `.${after}` : ''}`;
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
