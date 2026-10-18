import { Direction } from '@/annotation/Metadata';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { SaveStatement } from '@/backend/SaveStatement';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { RemovedTargets, SaveOptions } from '@/manager/SaveOptions';
import { Stamps } from '@/model/Stamps';
import { changes, EXPECTED, LOCK, MADE, relink, restamp, STAMP } from '@/backend/CypherStamps';


/** A stamped fragment among the related nodes a save writes, and its place in the statement. */
interface StampedNodes {
    index: number;
    model: FragmentModel;
}

/** One FOREACH of the statement: the relationship it writes, and the FOREACHes nested in it for a related view. */
interface WritePart {
    key: string;
    rel: RelationshipModel;
    children: WritePart[];
}

/**
 * Writes a save as one statement, so that it is applied whole or not at all, with or without a transaction.
 *
 * The root is merged on its id and given the object's properties that are not null. A view's relationships are then
 * written with a FOREACH each, over a parameter holding a row per related node, so the statement's text does not grow
 * with a list. A related view nests its own FOREACHes, as far as the view's maxDepth. Relationships named in
 * `replace` are first trimmed to what the object holds.
 *
 * Every node written is stamped (see Stamps): its data token is replaced when its properties change, and the links
 * token of each end when a relationship is made, removed, or has its properties changed. A root whose object carries a
 * stamp is checked: its data token, and its links token when relationships are replaced, must be as the object's.
 */
export class SaveStatementBuilder {
    private count = 0;
    private readonly bindings: Record<string, any> = {};
    /** The stamped related fragments, each read before and after the writes: see readStamps. */
    private readonly stamped: StampedNodes[] = [];

    /** What every WITH after the root carries: the root, the stamp it was found with, and related stamps read. */
    private get carry(): string {
        return ['n', '_found', ...this.stamped.map((it) => `before${it.index}`)].join(', ');
    }

    constructor(private readonly grammar: CypherGrammar) {}

    build(target: TargetModel, object: any, options: SaveOptions<any> = {}): SaveStatement {
        this.bindings._stamp = Stamps.fresh();
        if (target.kind === 'NODE_FRAGMENT') {
            if (options.replace === 'all' || options.replace?.length) {
                throw new DrivineError(`replace names relationship fields of a view. ${target.model.type.name} is a @NodeFragment.`);
            }
            const head = this.root(target.model, object, false);
            return this.statement([head, `RETURN {found: _found, now: n.${STAMP}} AS result`], target.model, object);
        }
        const view = target.model;
        const root = object[view.rootField];
        if (root == null) {
            throw new DrivineError(`${view.type.name}.${view.rootField}, the root, is ${root}. A view is saved from its root.`);
        }
        const replace = this.replacedFields(view, object, options);
        const parts = [this.root(view.root, root, replace.length > 0)];
        const writes = this.writeParts(view, []);
        for (const part of writes) {
            this.bindings[part.key] = this.rows(part, object[part.rel.field]);
        }
        parts.push(...this.readStamps('before'));
        parts.push(...this.removals(view, object, replace, options.removedTargets));
        parts.push(`WITH ${this.carry}`);
        for (const part of writes) {
            parts.push(this.forEach(part, 'n', `$${part.key}`, 'NODES_AND_EDGES'));
        }
        // Relationship properties are set in a second pass, after a WITH. FalkorDB can't bind a relationship merged
        // earlier in the same clause (FalkorDB/FalkorDB#3388), as a nested view that leads back along its parent's
        // relationship does.
        const withProperties = writes.filter(leadsToRelationshipFragment);
        if (withProperties.length) {
            parts.push(`WITH ${this.carry}`);
            parts.push(...withProperties.map((part) => this.forEach(part, 'n', `$${part.key}`, 'EDGE_PROPERTIES')));
        }
        parts.push(...this.readStamps('after'));
        const related = this.stamped.map((it) => `{before: before${it.index}, after: after${it.index}}`);
        parts.push(`RETURN {found: _found, now: n.${STAMP}, related: [${related.join(', ')}]} AS result`);
        return this.statement(parts, view.root, root);
    }

    /**
     * The relationship fields to trim: those named, or every one of the view's for 'all', which needs an object that
     * carries a stamp, since the lists of an object built from scratch are its defaults and not what the store holds.
     */
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
        return view.relationships.map((it) => it.field);
    }

    /**
     * Reads the stamp of each stamped related node the save writes, as `{id, stamp}` maps: `before` the writes, into
     * `before<i>`, carried to the end, and `after`, into `after<i>`. A node missing from `before` is one the save made.
     */
    private readStamps(when: 'before' | 'after'): string[] {
        return this.stamped.flatMap((it) => {
            const a = `s${when[0]}${it.index}`;
            // Before, only the reads made so far are there to carry.
            const carried =
                when === 'before'
                    ? ['n', '_found', ...this.stamped.slice(0, it.index).map((done) => `before${done.index}`)].join(', ')
                    : this.carry;
            return [
                `WITH ${carried}`,
                `OPTIONAL MATCH (${a}${labelExpression(it.model.labels)}) WHERE ${a}.${quoteName(idProperty(it.model))} IN $stampIds${it.index}`,
                `WITH ${carried}, collect(CASE WHEN ${a} IS NOT NULL THEN {id: ${a}.${quoteName(idProperty(it.model))}, ` +
                    `stamp: coalesce(${a}.${STAMP}, '${Stamps.NEVER_STAMPED}')} END) AS ${when}${it.index}`
            ];
        });
    }

    private statement(parts: string[], root: FragmentModel, rootObject: any): SaveStatement {
        return new SaveStatement(
            parts.join('\n'),
            this.bindings,
            root,
            rootObject,
            this.bindings._expected,
            this.stamped.map((it) => it.model)
        );
    }

    /**
     * Writes the root, and binds `_found` to the stamp it carried: '' when the save made it, '-' when it had none.
     * An object that carries a stamp is checked: the root must be there with the object's data token, and with its
     * links token too when `replacing`. Otherwise the statement goes no further, having written nothing.
     */
    private root(model: FragmentModel, object: any, replacing: boolean): string {
        this.bindings.root = { id: idOf(model, object), props: propsOf(model, object, stampExcluded(model)) };
        const labels = labelExpression(model.labels);
        const id = `{${quoteName(idProperty(model))}: $root.id}`;
        const write = [`SET ${restamp('n', changes('n', '$root.props'))}`, 'SET n += $root.props'];
        const expected = model.stampField ? object[model.stampField] : undefined;
        if (expected == null) {
            return [
                `MERGE (n${labels} ${id}) ON CREATE SET n.${MADE} = true`,
                // The lock is taken unchecked too, so that what the save says it changed is true while another writer
                // is changing the same node.
                `SET n.${LOCK} = true REMOVE n.${LOCK}`,
                `WITH n, CASE WHEN n.${MADE} IS NOT NULL THEN '' ELSE coalesce(n.${STAMP}, '${Stamps.NEVER_STAMPED}') END AS _found`,
                ...write,
                `REMOVE n.${MADE}`
            ].join('\n');
        }
        this.bindings._expected = expected;
        const T = Stamps.TOKEN;
        const ok = [`left(n.${STAMP}, ${T}) = left(${EXPECTED}, ${T})`];
        if (replacing) {
            ok.push(`size(${EXPECTED}) = ${2 * T + 1} AND right(n.${STAMP}, ${T}) = right(${EXPECTED}, ${T})`);
        }
        return [
            `MATCH (n${labels} ${id})`,
            `SET n.${LOCK} = true`,
            `WITH n, coalesce(${ok.join(' AND ')}, false) AS _ok`,
            `REMOVE n.${LOCK}`,
            'WITH n, _ok WHERE _ok',
            `WITH n, coalesce(n.${STAMP}, '${Stamps.NEVER_STAMPED}') AS _found`,
            ...write
        ].join('\n');
    }

    private removals(
        view: GraphViewModel,
        object: any,
        replace: string[],
        removedTargets: RemovedTargets | undefined
    ): string[] {
        const parts: string[] = [];
        const held = this.heldIds(view, object);
        for (const field of replace) {
            const rel = view.relationships.find((it) => it.field === field);
            if (!rel) {
                throw new DrivineError(`replace names ${field}, which is not a relationship field of ${view.type.name}.`);
            }
            const value = object[field];
            if (rel.isCollection && value == null) {
                throw new DrivineError(
                    `${view.type.name}.${field} is ${value}, so it can't say which relationships to keep. Give an empty ` +
                        `list to remove them all.`
                );
            }
            const k = ++this.count;
            const into = target(rel);
            const idProp = quoteName(idProperty(rootOf(into)));
            const keep = view.relationships
                .filter((it) => it.type === rel.type && it.direction === rel.direction)
                .flatMap((it) => items(it, object[it.field]).map((item) => idOf(rootOf(target(it)), nodeOf(it, item))));
            this.bindings[`keep${k}`] = keep;
            parts.push(
                `WITH ${this.carry}`,
                `OPTIONAL MATCH ${pattern(rel, 'n', `d${k}`, `x${k}${labelExpression(rootOf(into).labels)}`)} ` +
                    `WHERE NOT x${k}.${idProp} IN $keep${k}`,
                `WITH ${this.carry}, collect(d${k}) AS drop${k}, collect(x${k}) AS removed${k}`,
                `FOREACH (r IN drop${k} | DELETE r)`,
                `FOREACH (x IN removed${k} | SET ${relink('x')})`,
                `SET ${relink('n', `size(drop${k}) > 0`)}`
            );
            if (removedTargets === RemovedTargets.DELETE_UNREFERENCED) {
                this.bindings.held = held;
                const y = `y${k}`;
                parts.push(
                    `WITH ${this.carry}, removed${k}`,
                    `OPTIONAL MATCH (${y}${labelExpression(rootOf(into).labels)}) WHERE ${y} IN removed${k} AND ${y} <> n ` +
                        `AND NOT ${y}.${idProp} IN $held AND NOT ${this.grammar.existenceCheck(referencedAs(rel, y))}`,
                    `WITH ${this.carry}, collect(${y}) AS unreferenced${k}`,
                    `FOREACH (x IN unreferenced${k} | DETACH DELETE x)`
                );
            }
        }
        return parts;
    }

    private writeParts(view: GraphViewModel, path: RelationshipModel[]): WritePart[] {
        return view.relationships
            .filter((rel) => path.filter((it) => it === rel).length < rel.maxDepth)
            .map((rel) => {
                const into = target(rel);
                return {
                    key: `rows${++this.count}`,
                    rel,
                    children: into.kind === 'GRAPH_VIEW' ? this.writeParts(into.model, [...path, rel]) : []
                };
            });
    }

    private forEach(part: WritePart, parent: string, rows: string, pass: 'NODES_AND_EDGES' | 'EDGE_PROPERTIES'): string {
        const k = part.key.slice('rows'.length);
        const row = `row${k}`;
        const t = `t${k}`;
        const r = `r${k}`;
        const into = target(part.rel);
        const root = rootOf(into);
        const merge = `MERGE (${t}${labelExpression(root.labels)} {${quoteName(idProperty(root))}: ${row}.id})`;
        const isFragment = part.rel.related.kind === 'RELATIONSHIP_FRAGMENT';
        const relChanged = changes(r, `${row}.rel`);
        const steps =
            pass === 'NODES_AND_EDGES'
                ? [
                      `${merge} SET ${restamp(t, changes(t, `${row}.props`))} SET ${t} += ${row}.props`,
                      `MERGE ${pattern(part.rel, parent, '', t)} ON CREATE SET ${relink(parent)}, ${relink(t)}`
                  ]
                : [
                      merge,
                      ...(isFragment
                          ? [
                                `MERGE ${pattern(part.rel, parent, r, t)} ` +
                                    `SET ${relink(parent, relChanged)}, ${relink(t, relChanged)} SET ${r} += ${row}.rel`
                            ]
                          : [])
                  ];
        const children = pass === 'NODES_AND_EDGES' ? part.children : part.children.filter(leadsToRelationshipFragment);
        steps.push(...children.map((child) => this.forEach(child, t, `coalesce(${row}.${child.key}, [])`, pass)));
        return `FOREACH (${row} IN ${rows} | ${steps.join(' ')})`;
    }

    private rows(part: WritePart, value: any): any[] {
        const rel = part.rel;
        const into = target(rel);
        return items(rel, value).map((item) => {
            const node = nodeOf(rel, item);
            if (node == null) {
                throw new DrivineError(`A ${rel.related.model.type.name} in ${rel.field} has no target node.`);
            }
            const nodeObject = into.kind === 'GRAPH_VIEW' ? node[into.model.rootField] : node;
            const root = rootOf(into);
            this.stampedIds(root, idOf(root, nodeObject));
            const row: Record<string, any> = {
                id: idOf(root, nodeObject),
                props: propsOf(root, nodeObject, stampExcluded(root))
            };
            if (rel.related.kind === 'RELATIONSHIP_FRAGMENT') {
                const model = rel.related.model;
                row.rel = propsOf(model, item, [model.targetField]);
            }
            for (const child of part.children) {
                row[child.key] = this.rows(child, node[child.rel.field]);
            }
            return row;
        });
    }

    private stampedIds(model: FragmentModel, id: any): void {
        if (!model.stampField) {
            return;
        }
        let stamped = this.stamped.find((it) => it.model === model);
        if (!stamped) {
            stamped = { index: this.stamped.length, model };
            this.stamped.push(stamped);
            this.bindings[`stampIds${stamped.index}`] = [];
        }
        const ids: any[] = this.bindings[`stampIds${stamped.index}`];
        if (!ids.includes(id)) {
            ids.push(id);
        }
    }

    /** The ids of every node the object holds, at any depth. */
    private heldIds(view: GraphViewModel, object: any, seen: Set<any> = new Set<any>()): any[] {
        if (object == null || seen.has(object)) {
            return [];
        }
        seen.add(object);
        const ids = [object[view.rootField]?.[view.root.nodeIdField!]];
        for (const rel of view.relationships) {
            const into = target(rel);
            for (const item of items(rel, object[rel.field])) {
                const node = nodeOf(rel, item);
                ids.push(
                    ...(into.kind === 'GRAPH_VIEW'
                        ? this.heldIds(into.model, node, seen)
                        : [node?.[into.model.nodeIdField!]])
                );
            }
        }
        return ids.filter((it) => it != null);
    }
}

function stampExcluded(model: FragmentModel): string[] {
    return model.stampField ? [model.stampField] : [];
}

function leadsToRelationshipFragment(part: WritePart): boolean {
    return part.rel.related.kind === 'RELATIONSHIP_FRAGMENT' || part.children.some(leadsToRelationshipFragment);
}

function target(rel: RelationshipModel): TargetModel {
    const related = rel.related;
    return related.kind === 'RELATIONSHIP_FRAGMENT' ? related.model.target : related;
}

function rootOf(into: TargetModel): FragmentModel {
    return into.kind === 'GRAPH_VIEW' ? into.model.root : into.model;
}

/** The node an item of a relationship field leads to: for a relationship fragment, its target. */
function nodeOf(rel: RelationshipModel, item: any): any {
    return rel.related.kind === 'RELATIONSHIP_FRAGMENT' ? item?.[rel.related.model.targetField] : item;
}

function items(rel: RelationshipModel, value: any): any[] {
    if (value == null) {
        return [];
    }
    if (rel.isCollection && !Array.isArray(value)) {
        throw new DrivineError(`${rel.field} is a list relationship, but holds a ${typeof value}.`);
    }
    return rel.isCollection ? value : [value];
}

function idProperty(model: FragmentModel): string {
    if (!model.nodeIdProperty) {
        throw new DrivineError(`${model.type.name} has no @NodeId property, so it can't be saved: a save merges on the id.`);
    }
    return model.nodeIdProperty;
}

function idOf(model: FragmentModel, object: any): any {
    const id = object?.[model.nodeIdField ?? idProperty(model)];
    if (id == null) {
        throw new DrivineError(`A ${model.type.name} to save has no ${model.nodeIdField}. A save merges on the id.`);
    }
    return id;
}

/**
 * The properties an object writes: its own fields that are not null, under their graph names, leaving out transient
 * ones and those named in `excluded`.
 */
export function propsOf(
    model: { graphProperties: Map<string, string>; transientFields: Set<string> },
    object: any,
    excluded: string[]
): Record<string, any> {
    const props: Record<string, any> = {};
    for (const [field, value] of Object.entries(object ?? {})) {
        if (value == null || typeof value === 'function' || excluded.includes(field) || model.transientFields.has(field)) {
            continue;
        }
        props[model.graphProperties.get(field) ?? field] = value;
    }
    return props;
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

/** A pattern that matches when a node is still referred to the way the field referred to it. */
function referencedAs(rel: RelationshipModel, node: string): string {
    switch (rel.direction) {
        case Direction.INCOMING:
            return `(${node})-->()`;
        case Direction.UNDIRECTED:
            return `(${node})--()`;
        default:
            return `(${node})<--()`;
    }
}
