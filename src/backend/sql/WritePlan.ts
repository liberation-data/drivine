import { Direction } from '@/annotation/Metadata';
import { Stamps } from '@/model/Stamps';

/** What a statement that carries out a plan gives back. */
export type WriteReturns =
    /** One row: the root's stamp as handed back, then `index/found=stamp` for each node whose stamp is. */
    | 'STAMPS'
    /** A row for each node whose stamp is handed back, `index/found=stamp`. */
    | 'EACH_STAMP'
    /** One row: the number of relationships the steps counted. */
    | 'COUNT';

/** How a step finds a node: the labels it carries and the property its id is stored under. */
export interface NodeShape {
    labels: string[];
    key: string;
}

/** What a `node` step writes to a node, beyond its properties. */
export interface NodeWrites {
    /** The properties to write, by the names they are stored under. */
    set?: Record<string, any>;
    /** The properties to remove. */
    unset?: string[];
    /** The labels to give the node, and those to take from it. */
    add?: string[];
    drop?: string[];
    /**
     * The labels an open `@NodeLabels` field owns, recorded on the node under `property`. With `clear`, the step
     * drops those recorded and no longer held, keeping the `base` labels of the class.
     */
    owned?: { property: string; clear: boolean; base: string[] };
}

/** What a `node` step says about the save's root. */
export interface RootStep {
    /** The stamp the object carries, which the stamp handed back is composed from. */
    carried?: string;
    /** The stamp, or its data token, the node must carry for the save to go ahead. */
    expect?: string;
    /** Whether `expect` is the whole stamp rather than its data token. */
    whole: boolean;
    /** Whether the step makes the node when it is not there (EITHER), only when it is not (ABSENT), or never. */
    mode: 'EITHER' | 'ABSENT' | 'FOUND';
}

/**
 * The steps drivine4j's write function carries out, gathered as they are decided: its plan, a JSON array of steps, each
 * saying its kind under `op`. A node a step saves or finds is known to later steps by the number it is given here. The
 * names a step's fields are read by are drivine4j's `WritePlan`'s, which the function reads.
 */
export class WritePlan {
    /** The parameter the plan is bound as. */
    static readonly PLAN = '_plan';
    /** The parameter that carries the stamp the steps take a new relationship token from. */
    static readonly MARK = '_mark';

    /** The stamp the plan's steps take the relationship token from. */
    readonly mark: string = Stamps.fresh();

    /** The steps in the order they were added, which is the order they are carried out in. */
    private readonly steps: Record<string, any>[] = [];
    /** The shapes the steps name, by number, in the order they were first named. */
    private readonly shapes: NodeShape[] = [];
    /** How many nodes the steps have saved or found, which is the number the next is given. */
    private nodes = 0;

    /** The steps, as they are bound. */
    get plan(): Record<string, any>[] {
        return this.steps;
    }

    /** The shapes the steps name, as they are bound: each `{labels, key}`, in the order the plan numbers them. */
    get shapesBound(): NodeShape[] {
        return this.shapes;
    }

    /** The number of the shape a node of the labels, found by the property `key`, has: one number for one shape. */
    shape(labels: string[], key: string): number {
        const found = this.shapes.findIndex(
            (it) => it.key === key && it.labels.length === labels.length && it.labels.every((l, i) => l === labels[i])
        );
        if (found >= 0) {
            return found;
        }
        this.shapes.push({ labels: [...labels], key });
        return this.shapes.length - 1;
    }

    /**
     * The step that saves the node of `shape` whose id is `id`, stored under `key` as the text `storedId`: found and
     * locked, or made with `labels`. Gives the number later steps know the node by.
     *
     * @param index the index the node's stamp is returned under, when it is
     * @param root what the step says about the save's root; undefined for any other node
     */
    node(
        shape: number,
        key: string,
        id: unknown,
        storedId: string,
        labels: string[],
        writes: NodeWrites,
        index?: string,
        root?: RootStep
    ): number {
        const node = this.nodes++;
        this.add('node', {
            r: node,
            s: shape,
            k: storedId,
            key,
            id,
            labels: [...labels].sort(),
            fresh: Stamps.fresh(),
            set: nonEmpty(writes.set),
            unset: nonEmpty(writes.unset),
            add: nonEmpty(writes.add),
            drop: nonEmpty(writes.drop),
            owned: writes.owned
                ? writes.owned.clear
                    ? { prop: writes.owned.property, clear: true, base: writes.owned.base }
                    : { prop: writes.owned.property }
                : undefined,
            i: index,
            root: root ? true : undefined,
            carried: root?.carried,
            expect: root?.expect,
            whole: root?.whole ? true : undefined,
            create: root?.mode === 'FOUND' ? false : undefined,
            absent: root?.mode === 'ABSENT' ? true : undefined
        });
        return node;
    }

    /** The step that finds the node of `shape` whose stored id is `storedId`, which must be there. */
    ref(shape: number, storedId: string): number {
        const node = this.nodes++;
        this.add('ref', { r: node, s: shape, k: storedId });
        return node;
    }

    /**
     * The step that joins `from` to `to` with a relationship of `type` in `direction`, as it says and once, unless
     * `always` makes one more. `clear` names the properties the relationship must not have.
     */
    link(
        from: number,
        to: number,
        type: string,
        direction: Direction,
        properties: Record<string, any>,
        clear: string[] = [],
        always: boolean = false
    ): void {
        this.add('link', {
            from,
            to,
            type,
            dir: code(direction),
            props: nonEmpty(properties),
            clear: nonEmpty(clear),
            always: always ? true : undefined
        });
    }

    /**
     * The step that removes the relationships of `type` in `direction` from `from` to the nodes of `shape` whose stored
     * ids are `ids`, or with `keep` to every one but those. With `remove`, a node left with no relationship on the
     * field's side goes too, unless its id is among `held`.
     */
    unlink(
        from: number,
        type: string,
        direction: Direction,
        shape: number,
        ids: string[],
        keep: boolean,
        remove: boolean,
        held: string[]
    ): void {
        this.add('unlink', {
            from,
            type,
            dir: code(direction),
            s: shape,
            ids,
            keep: keep ? true : undefined,
            delete: remove ? true : undefined,
            held: nonEmpty(held)
        });
    }

    /** The step that removes the relationships of `type` in `direction` from `from` to `to`, or with none to every node. */
    cut(from: number, to: number | undefined, type: string, direction: Direction): void {
        this.add('cut', { from, to, type, dir: code(direction) });
    }

    /**
     * The step that writes `set` to the node of `shape` whose stored id is `storedId`, and removes `unset` from it, if
     * the node is there. It makes no node. The node is returned under `index`, with whether the step changed it.
     */
    patch(shape: number, storedId: string, index: string, set: Record<string, any>, unset: string[]): void {
        this.add('patch', {
            s: shape,
            k: storedId,
            i: index,
            fresh: Stamps.fresh(),
            set: nonEmpty(set),
            unset: nonEmpty(unset)
        });
    }

    /** Adds a step of the kind with its fields, leaving out a field that is undefined: the function reads it as null. */
    private add(op: string, fields: Record<string, any>): void {
        this.steps.push({
            op,
            ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
        });
    }
}

/** The direction as a step writes it. */
export function code(direction: Direction): string {
    return direction === Direction.INCOMING ? 'IN' : direction === Direction.UNDIRECTED ? 'BOTH' : 'OUT';
}

/** The value, or undefined where it is empty: a step leaves out what it has nothing of. */
function nonEmpty<T extends object>(value: T | undefined): T | undefined {
    if (value === undefined) {
        return undefined;
    }
    return (Array.isArray(value) ? value.length : Object.keys(value).length) ? value : undefined;
}
