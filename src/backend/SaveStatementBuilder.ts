import { Direction } from '@/annotation/Metadata';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { GraphStatement } from '@/backend/GraphStatement';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { RemovedTargets, SaveOptions } from '@/manager/SaveOptions';

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
 */
export class SaveStatementBuilder {
    private count = 0;
    private readonly bindings: Record<string, any> = {};

    constructor(private readonly grammar: CypherGrammar) {}

    build(target: TargetModel, object: any, options: SaveOptions<any> = {}): GraphStatement {
        if (target.kind === 'NODE_FRAGMENT') {
            if (options.replace?.length) {
                throw new DrivineError(`replace names relationship fields of a view. ${target.model.type.name} is a @NodeFragment.`);
            }
            return new GraphStatement(`${this.mergeRoot(target.model, object, [])}\nRETURN count(*) AS saved`, this.bindings);
        }
        const view = target.model;
        const root = object[view.rootField];
        if (root == null) {
            throw new DrivineError(`${view.type.name}.${view.rootField}, the root, is ${root}. A view is saved from its root.`);
        }
        const parts = [this.mergeRoot(view.root, root, [])];
        parts.push(...this.removals(view, object, options));
        const writes = this.writeParts(view, []);
        parts.push('WITH n');
        for (const part of writes) {
            this.bindings[part.key] = this.rows(part, object[part.rel.field]);
            parts.push(this.forEach(part, 'n', `$${part.key}`, 'NODES_AND_EDGES'));
        }
        // Relationship properties are set in a second pass, after a WITH. FalkorDB can't bind a relationship merged
        // earlier in the same clause (FalkorDB/FalkorDB#3388), as a nested view that leads back along its parent's
        // relationship does.
        const withProperties = writes.filter(leadsToRelationshipFragment);
        if (withProperties.length) {
            parts.push('WITH n');
            parts.push(...withProperties.map((part) => this.forEach(part, 'n', `$${part.key}`, 'EDGE_PROPERTIES')));
        }
        parts.push('RETURN count(*) AS saved');
        return new GraphStatement(parts.join('\n'), this.bindings);
    }

    private mergeRoot(model: FragmentModel, object: any, excluded: string[]): string {
        this.bindings.root = { id: idOf(model, object), props: propsOf(model, object, excluded) };
        return `MERGE (n${labelExpression(model.labels)} {${quoteName(idProperty(model))}: $root.id}) SET n += $root.props`;
    }

    private removals(view: GraphViewModel, object: any, options: SaveOptions<any>): string[] {
        const parts: string[] = [];
        const held = this.heldIds(view, object);
        for (const field of options.replace ?? []) {
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
                'WITH n',
                `OPTIONAL MATCH ${pattern(rel, 'n', `d${k}`, `x${k}${labelExpression(rootOf(into).labels)}`)} ` +
                    `WHERE NOT x${k}.${idProp} IN $keep${k}`,
                `WITH n, collect(d${k}) AS drop${k}, collect(x${k}) AS removed${k}`,
                `FOREACH (r IN drop${k} | DELETE r)`
            );
            if (options.removedTargets === RemovedTargets.DELETE_UNREFERENCED) {
                this.bindings.held = held;
                const y = `y${k}`;
                parts.push(
                    `WITH n, removed${k}`,
                    `OPTIONAL MATCH (${y}${labelExpression(rootOf(into).labels)}) WHERE ${y} IN removed${k} AND ${y} <> n ` +
                        `AND NOT ${y}.${idProp} IN $held AND NOT ${this.grammar.existenceCheck(referencedAs(rel, y))}`,
                    `WITH n, collect(${y}) AS unreferenced${k}`,
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
        const steps =
            pass === 'NODES_AND_EDGES'
                ? [`${merge} SET ${t} += ${row}.props`, `MERGE ${pattern(part.rel, parent, '', t)}`]
                : [merge, ...(isFragment ? [`MERGE ${pattern(part.rel, parent, r, t)} SET ${r} += ${row}.rel`] : [])];
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
            const row: Record<string, any> = { id: idOf(root, nodeObject), props: propsOf(root, nodeObject, []) };
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
