import { Direction } from '@/annotation/Metadata';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { SaveStatement } from '@/backend/SaveStatement';
import { DrivineError } from '@/DrivineError';
import { FragmentModel, PropertyBagModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';
import { RemovedTargets, SaveOptions } from '@/manager/SaveOptions';
import { NullPolicy } from '@/manager/NullPolicy';
import { Stamps } from '@/model/Stamps';
import { FORBIDDEN_KEYS, knownProperties, RESERVED_PREFIX } from '@/mapper/GraphObjectMapper';
import { ObjectUtils } from '@/utils/ObjectUtils';
import { plainToInstance } from 'class-transformer';
import { splitVectors, vectorClauses } from '@/backend/VectorWrites';
import { ModelRegistry } from '@/model/ModelRegistry';
import { ClassKind } from '@/annotation/Metadata';
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
    /** Related nodes with property bags, each written by a part of the statement of its own after the FOREACHes. */
    private readonly bagged: { model: FragmentModel; id: any; object: any }[] = [];
    /** For each target fragment of the save, the subclasses of it the object holds, in the order rows name them. */
    private readonly subtypes = new Map<FragmentModel, FragmentModel[]>();
    private options: SaveOptions<any> = {};
    private createOnly = false;

    /** What every WITH after the root carries: the root, the stamp it was found with, and related stamps read. */
    private get carry(): string {
        return ['n', '_found', ...this.stamped.map((it) => `before${it.index}`)].join(', ');
    }

    constructor(
        private readonly grammar: CypherGrammar,
        private readonly registry?: ModelRegistry
    ) {}

    /**
     * @param createOnly write only if the root is not there: a root that is, or that another writer makes at the same
     * moment, stops the statement before it writes anything, and it returns no row.
     */
    build(
        target: TargetModel,
        object: any,
        options: SaveOptions<any> = {},
        createOnly: boolean = false
    ): SaveStatement {
        this.bindings._stamp = Stamps.fresh();
        this.options = options;
        this.createOnly = createOnly;
        if (target.kind === 'NODE_FRAGMENT') {
            if (options.replace === 'all' || options.replace?.length) {
                throw new DrivineError(
                    `replace names relationship fields of a view. ${target.model.type.name} is a @NodeFragment.`
                );
            }
            const head = this.root(target.model, object, false);
            return this.statement([head, `RETURN {found: _found, now: n.${STAMP}} AS result`], target.model, object);
        }
        const view = target.model;
        const root = object[view.rootField];
        if (root == null) {
            throw new DrivineError(
                `${view.type.name}.${view.rootField}, the root, is ${root}. A view is saved from its root.`
            );
        }
        const replace = this.replacedFields(view, object, options);
        // A root of a subclass of the view's root type is written with its own labels.
        const parts = [this.root(this.concreteModel(view.root, root), root, replace.length > 0)];
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
        parts.push(...this.baggedParts());
        parts.push(...this.readStamps('after'));
        const related = this.stamped.map((it) => `{before: before${it.index}, after: after${it.index}}`);
        parts.push(`RETURN {found: _found, now: n.${STAMP}, related: [${related.join(', ')}]} AS result`);
        return this.statement(parts, this.concreteModel(view.root, root), root);
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
        return view.relationships.filter((it) => !it.readOnly).map((it) => it.field);
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
                    ? ['n', '_found', ...this.stamped.slice(0, it.index).map((done) => `before${done.index}`)].join(
                          ', '
                      )
                    : this.carry;
            return [
                `WITH ${carried}`,
                `OPTIONAL MATCH (${a}${labelExpression(it.model.labels)}) WHERE ${a}.${quoteName(
                    idProperty(it.model)
                )} IN $stampIds${it.index}`,
                `WITH ${carried}, collect(CASE WHEN ${a} IS NOT NULL THEN {id: ${a}.${quoteName(
                    idProperty(it.model)
                )}, ` + `stamp: coalesce(${a}.${STAMP}, '${Stamps.NEVER_STAMPED}')} END) AS ${when}${it.index}`
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
        const split = splitVectors(model, objectProps(model, object, this.options));
        this.bindings.root = { id: idOf(model, object), props: split.props, vectors: split.vectors };
        const cleared = Object.entries(split.vectors)
            .filter(([, value]) => value === null)
            .map(([name]) => name);
        const vectors = vectorClauses(model, this.grammar, 'n', '$root.vectors', cleared);
        const labels = labelExpression(model.labels);
        const id = `{${quoteName(idProperty(model))}: $root.id}`;
        const { only, except }: SaveOptions<any> = this.options;
        const keep = (field: string): boolean => (only ? only.includes(field) : !except?.includes(field));
        const clear = this.options.nullPolicy === NullPolicy.CLEAR;
        const held = this.options.heldProperties ?? {};
        const entries = bagEntries(model, object, Object.keys(held), clear, keep);
        const bag = this.bagSets('n', 'rootBag', entries);
        const labelled =
            model.nodeLabels && keep(model.nodeLabels.field)
                ? this.labelClauses(model, object, 'n', clear, held)
                : { sets: [], changes: [] };
        const changed = [changes('n', '$root.props'), ...vectors.changes, ...bag.changes, ...labelled.changes].join(
            ' OR '
        );
        const write = [
            `SET ${restamp('n', changed)}`,
            'SET n += $root.props',
            ...vectors.sets,
            ...bag.sets,
            ...labelled.sets
        ];
        const expected = model.stampField ? object[model.stampField] : undefined;
        if (this.createOnly) {
            if (expected != null) {
                throw new DrivineError(
                    `A ${model.type.name} that carries a stamp was loaded, and create makes a node that is not there. Save it, or update it.`
                );
            }
            return [
                `MERGE (n${labels} ${id}) ON CREATE SET n.${MADE} = true`,
                // Found rather than made: there already, or made by another writer at the same moment.
                `WITH n WHERE n.${MADE} IS NOT NULL`,
                `WITH n, '' AS _found`,
                ...write,
                `REMOVE n.${MADE}`
            ].join('\n');
        }
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
        // The fields as loaded are compared only where a load may have been handed a stamp newer than its data.
        if (this.options.loaded != null && this.grammar.readsWithoutSnapshot) {
            ok.push(...this.stillAsLoaded(model, this.options.loaded));
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

    /**
     * What the checked save of `loaded`, the root as `update` loaded it, requires of the node besides the stamp. A load
     * that ran while another writer committed can hold that writer's stamp with the data from before its write. Each
     * field is compared as it was loaded too, under the lock, so the save of such an object is refused, as a stale one
     * is: a field its value, a bag the keys it owns and their values, the labels field the labels it reads. A
     * comparison that can't tell (a list holding a null) is not a difference: the stamp still speaks for the field.
     */
    private stillAsLoaded(model: FragmentModel, loaded: any): string[] {
        const bind = (name: string, value: any): string => {
            this.bindings[name] = value;
            return `$${name}`;
        };
        // What a load gives a field of a node that holds no property for it: the class's initializer, or an empty
        // collection.
        const initial: any = plainToInstance(model.type as any, {});
        const absent = (field: string): any =>
            initial[field] ??
            (model.emptyWhenAbsent.get(field) === 'array' ? [] : model.emptyWhenAbsent.has(field) ? {} : undefined);
        const fields = [...new Set([...Object.keys(initial), ...model.graphProperties.keys(), ...Object.keys(loaded)])]
            .filter(
                (it) =>
                    it !== model.nodeIdField &&
                    typeof loaded[it] !== 'function' &&
                    !skipped(model, it, stampExcluded(model))
            )
            .map((field) => ({ field, property: model.graphProperties.get(field) ?? field }))
            .sort((a, b) => (a.property < b.property ? -1 : a.property > b.property ? 1 : 0));
        const declared = fields.map(({ field, property }: { field: string; property: string }, i) => {
            const stored = `n.${quoteName(property)}`;
            const value = loaded[field];
            if (value == null) {
                return `${stored} IS NULL`;
            }
            const param = bind(`_loaded${i}`, model.jsonPacked.has(field) ? JSON.stringify(value) : asCompared(value));
            const expression = model.vectorFields.has(field) ? this.grammar.vectorValue(param) : param;
            const same = `NOT coalesce(${stored} <> ${expression}, false)`;
            // A value a load gives a node that holds none may have been loaded from none.
            return ObjectUtils.deepEqual(value, absent(field)) ? same : `${stored} IS NOT NULL AND ${same}`;
        });
        const known = [...knownProperties(model.type, model, model), ...FORBIDDEN_KEYS];
        const namespaces = model.propertyBags.filter((it) => !it.flat).map((it) => it.namespace);
        // A bag holds the keys it owns, each with its value: none added, none removed, none changed. What a bag owns
        // is what a load hands it: a prefixed bag the keys under its prefix, a flat one what no field or other bag takes.
        const bags = model.propertyBags.map((bag, i) => {
            const entries = Object.entries(loaded[bag.field] ?? {})
                .filter(([, value]) => value != null)
                .map(([key, value]) => [`${bag.namespace}${key}`, asCompared(value)]);
            const held = bind(`_loadedBag${i}`, Object.fromEntries(entries));
            const owned = bag.flat
                ? `NOT k IN ${bind(`_loadedBag${i}Reserved`, known)} AND ` +
                  `none(p IN ${bind(`_loadedBag${i}ReservedPrefixes`, [
                      RESERVED_PREFIX,
                      ...namespaces
                  ])} WHERE k STARTS WITH p)`
                : `k STARTS WITH ${bind(`_loadedBag${i}Prefix`, bag.namespace)}`;
            return (
                `size([k IN keys(n) WHERE ${owned}]) = size(keys(${held})) AND ` +
                `all(k IN keys(${held}) WHERE n[k] IS NOT NULL AND NOT coalesce(n[k] <> ${held}[k], false))`
            );
        });
        // The labels field reads the node's labels: a closed one its members, an open one those not the fragment's own.
        const field = model.nodeLabels;
        if (!field) {
            return [...declared, ...bags];
        }
        const held = bind('_loadedLabels', [...new Set<string>(loaded[field.field] ?? [])]);
        const read = field.members
            ? `[l IN labels(n) WHERE l IN ${bind('_loadedLabelsClosed', field.members)}]`
            : `[l IN labels(n) WHERE NOT l IN ${bind('_loadedLabelsOwn', model.labels)}]`;
        return [...declared, ...bags, `size(${read}) = size(${held}) AND all(l IN ${held} WHERE l IN labels(n))`];
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
            const k = ++this.count;
            const into = target(rel);
            const idProp = quoteName(idProperty(rootOf(into)));
            const keep = view.relationships
                .filter((it) => it.type === rel.type && it.direction === rel.direction)
                .flatMap((it) =>
                    items(it, object[it.field]).map((item) => idOf(rootOf(target(it)), fragmentOf(it, item)))
                );
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
                    `OPTIONAL MATCH (${y}${labelExpression(
                        rootOf(into).labels
                    )}) WHERE ${y} IN removed${k} AND ${y} <> n ` +
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
            .filter((rel) => !rel.readOnly && path.filter((it) => it === rel).length < rel.maxDepth)
            .map((rel) => {
                const into = target(rel);
                return {
                    key: `rows${++this.count}`,
                    rel,
                    children: into.kind === 'GRAPH_VIEW' ? this.writeParts(into.model, [...path, rel]) : []
                };
            });
    }

    private forEach(
        part: WritePart,
        parent: string,
        rows: string,
        pass: 'NODES_AND_EDGES' | 'EDGE_PROPERTIES'
    ): string {
        const k = part.key.slice('rows'.length);
        const row = `row${k}`;
        const t = `t${k}`;
        const r = `r${k}`;
        const into = target(part.rel);
        const root = rootOf(into);
        const merge = `MERGE (${t}${labelExpression(root.labels)} {${quoteName(idProperty(root))}: ${row}.id})`;
        const rowVectors = vectorClauses(root, this.grammar, t, `${row}.vectors`);
        const isFragment = part.rel.related.kind === 'RELATIONSHIP_FRAGMENT';
        const relChanged = changes(r, `${row}.rel`);
        // A related node of a subclass of the field's target carries its own labels too: a MERGE takes no labels
        // from a parameter, so each subtype the object holds sets its own, when the row is of it.
        const subtypeLabels = (this.subtypes.get(root) ?? []).map(
            (sub, i) =>
                `FOREACH (_ IN CASE WHEN ${row}.subtype = ${i} THEN [1] ELSE [] END | SET ${t}${labelExpression(
                    sub.labels
                )})`
        );
        const steps =
            pass === 'NODES_AND_EDGES'
                ? [
                      `${merge} SET ${restamp(
                          t,
                          [changes(t, `${row}.props`), ...rowVectors.changes].join(' OR ')
                      )} SET ${t} += ${row}.props`,
                      ...rowVectors.sets,
                      ...subtypeLabels,
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
            const concrete = this.concreteModel(root, nodeObject);
            const row: Record<string, any> = {
                id: idOf(root, nodeObject),
                ...vectorRow(root, propsOf(concrete, nodeObject, stampExcluded(concrete)))
            };
            if (concrete !== root) {
                row.subtype = this.subtypeIndex(root, concrete);
            }
            if (concrete.propertyBags.length || concrete.nodeLabels) {
                this.bagged.push({ model: concrete, id: row.id, object: nodeObject });
            }
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

    /** A related node with property bags or node labels, written as under IGNORE, by a part of its own. */
    private baggedParts(): string[] {
        return this.bagged.flatMap((it, i) => {
            const alias = `b${i}`;
            const bag = this.bagSets(alias, `bag${i}_`, bagEntries(it.model, it.object));
            const labelled = it.model.nodeLabels
                ? this.labelClauses(it.model, it.object, alias, false)
                : { sets: [], changes: [] };
            const changed = [...bag.changes, ...labelled.changes];
            if (!changed.length && !labelled.sets.length) {
                return [];
            }
            this.bindings[`bagId${i}`] = it.id;
            return [
                `WITH ${this.carry}`,
                `MATCH (${alias}${labelExpression(it.model.labels)} {${quoteName(idProperty(it.model))}: $bagId${i}})`,
                ...(changed.length ? [`SET ${restamp(alias, changed.join(' OR '))}`] : []),
                ...bag.sets,
                ...labelled.sets
            ];
        });
    }

    /**
     * Clauses that give a node the labels its @NodeLabels field holds, and under `clear` remove those it owns and no
     * longer holds: for a closed field, its other members; for an open one, the labels it recorded writing (from
     * `held`, the node's properties read first). An open field records what it wrote.
     */
    private labelClauses(
        model: FragmentModel,
        object: any,
        alias: string,
        clear: boolean,
        held: Record<string, any> = {}
    ): { sets: string[]; changes: string[] } {
        const field = model.nodeLabels!;
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
        const removed = clear ? owned.filter((it) => !labels.includes(it) && !model.labels.includes(it)) : [];
        const sets = [
            ...labels.map((it) => `SET ${alias}:${quoteName(it)}`),
            ...removed.map((it) => `REMOVE ${alias}:${quoteName(it)}`)
        ];
        const changed = [
            ...labels.map((it) => `NOT ${alias}:${quoteName(it)}`),
            ...removed.map((it) => `${alias}:${quoteName(it)}`)
        ];
        if (!field.members) {
            const name = `labels${this.count}_${alias}`;
            this.bindings[name] = labels;
            const record = `${alias}.${quoteName(field.recordProperty)}`;
            sets.push(
                clear
                    ? `SET ${record} = $${name}`
                    : `SET ${record} = [x IN coalesce(${record}, []) WHERE NOT x IN $${name}] + $${name}`
            );
        }
        return { sets, changes: changed };
    }

    /**
     * SET clauses for property-bag entries, each with a parameter of its own (a parameter map can't hold a dotted key on
     * every engine), and the conditions that say an entry changes the node.
     */
    private bagSets(
        alias: string,
        parameter: string,
        entries: Map<string, any>
    ): { sets: string[]; changes: string[] } {
        const sets: string[] = [];
        const changed: string[] = [];
        [...entries].forEach(([property, value], i) => {
            const name = `${parameter}${this.count}_${i}`;
            this.bindings[name] = value;
            const target = `${alias}.${quoteName(property)}`;
            sets.push(`SET ${target} = $${name}`);
            changed.push(value === null ? `${target} IS NOT NULL` : `(${target} IS NULL OR ${target} <> $${name})`);
        });
        return { sets, changes: changed };
    }

    /** The model of the object's own class, where it is a subclass of the field's target. */
    private concreteModel(target: FragmentModel, object: any): FragmentModel {
        const type = object?.constructor;
        if (!this.registry || !type || type === target.type || this.registry.kindOf(type) !== ClassKind.NODE_FRAGMENT) {
            return target;
        }
        return this.registry.fragment(type);
    }

    private subtypeIndex(target: FragmentModel, concrete: FragmentModel): number {
        const known = this.subtypes.get(target) ?? [];
        let index = known.indexOf(concrete);
        if (index < 0) {
            index = known.push(concrete) - 1;
            this.subtypes.set(target, known);
        }
        return index;
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

/** The fragment an item of a relationship field leads to: for a view, its root. */
export function fragmentOf(rel: RelationshipModel, item: any): any {
    const into = target(rel);
    const node = nodeOf(rel, item);
    return into.kind === 'GRAPH_VIEW' ? node?.[into.model.rootField] : node;
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
        throw new DrivineError(
            `${model.type.name} has no @NodeId property, so it can't be saved: a save merges on the id.`
        );
    }
    return model.nodeIdProperty;
}

export function idOf(model: FragmentModel, object: any): any {
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
/** The properties a save writes of an object (of a view, its root), as the options' null policy, `only` and `except` say. */
export function objectProps(model: FragmentModel, object: any, options: SaveOptions<any>): Record<string, any> {
    const { only, except, nullPolicy }: SaveOptions<any> = options;
    if (only && except) {
        throw new DrivineError('Give only or except, not both.');
    }
    const reserved = [model.nodeIdField, model.stampField].filter((it) => it && only?.includes(it));
    if (reserved.length) {
        throw new DrivineError(`only names ${reserved.join(' and ')}, which a save does not write from the object.`);
    }
    const props = propsOf(model, object, stampExcluded(model), nullPolicy === NullPolicy.CLEAR);
    const keep = (field: string): boolean => (only ? only.includes(field) : !except?.includes(field));
    const byGraphName = new Map([...model.graphProperties].map(([field, name]) => [name, field]));
    return Object.fromEntries(Object.entries(props).filter(([name]) => keep(byGraphName.get(name) ?? name)));
}

export function propsOf(
    model: {
        graphProperties: Map<string, string>;
        transientFields: Set<string>;
        jsonPacked?: Set<string>;
        propertyBags?: PropertyBagModel[];
        nodeLabels?: { field: string };
    },
    object: any,
    excluded: string[],
    clearNulls: boolean = false
): Record<string, any> {
    const props: Record<string, any> = {};
    for (const [field, value] of Object.entries(object ?? {})) {
        if (typeof value === 'function' || skipped(model, field, excluded)) {
            continue;
        }
        if (value != null || clearNulls) {
            props[model.graphProperties.get(field) ?? field] =
                value != null && model.jsonPacked?.has(field) ? JSON.stringify(value) : value ?? null;
        }
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

/**
 * The node properties a fragment's property bags write: each entry under its bag's namespace, and, given the keys the
 * node holds and `clear`, null for each held key of a bag that the bag no longer has. Only the bags whose fields `keep`
 * takes are written; a flat bag's entries are checked against the others all the same.
 */
export function bagEntries(
    model: FragmentModel,
    object: any,
    held: string[] = [],
    clear: boolean = false,
    keep: (field: string) => boolean = () => true
): Map<string, any> {
    const entries = new Map<string, any>();
    for (const bag of model.propertyBags.filter((it) => keep(it.field))) {
        const map = object?.[bag.field];
        if (map != null && (typeof map !== 'object' || Array.isArray(map))) {
            throw new DrivineError(`The @PropertyBag ${model.type.name}.${bag.field} must hold an object of entries.`);
        }
        const owns = bag.flat ? flatBagOwns(model, object) : undefined;
        for (const [key, value] of Object.entries(map ?? {})) {
            requireWritable(model, bag, key, value, owns);
            if (value != null) {
                entries.set(`${bag.namespace}${key}`, value);
            }
        }
        if (clear && !bag.flat) {
            held.filter((it) => it.startsWith(bag.namespace) && !entries.has(it)).forEach((it) =>
                entries.set(it, null)
            );
        }
    }
    return entries;
}

/** Refuses an entry of a bag that can't be stored, or that a flat bag doesn't own and so would write over another's. */
function requireWritable(
    model: FragmentModel,
    bag: PropertyBagModel,
    key: string,
    value: any,
    owns?: (key: string) => boolean
): void {
    if (!storable(value)) {
        throw new DrivineError(
            `The entry '${key}' of ${model.type.name}.${bag.field} can't be stored as a property: a bag holds ` +
                `strings, numbers, booleans, dates, or arrays of them.`
        );
    }
    if (value != null && owns && !owns(key)) {
        throw new DrivineError(
            `The flat @PropertyBag ${model.type.name}.${bag.field} has an entry '${key}', which is the property of a ` +
                `declared field or of another bag. Both would write the same node property; remove the entry or ` +
                `rename the field's property.`
        );
    }
}

/**
 * Whether a flat bag owns a node property: whether no field of the object writes it, no other bag's namespace holds it,
 * a load wouldn't hand it to a field (see knownProperties), and it isn't Drivine's own, such as the stamp.
 */
function flatBagOwns(model: FragmentModel, object: any): (key: string) => boolean {
    const known = knownProperties(model.type, model, model);
    Object.keys(propsOf(model, object, [], true)).forEach((it) => known.add(it));
    const namespaces = model.propertyBags.filter((it) => !it.flat).map((it) => it.namespace);
    return (key) => !known.has(key) && !key.startsWith(RESERVED_PREFIX) && !namespaces.some((it) => key.startsWith(it));
}

function skipped(
    model: { transientFields: Set<string>; propertyBags?: PropertyBagModel[]; nodeLabels?: { field: string } },
    field: string,
    excluded: string[]
): boolean {
    return (
        excluded.includes(field) ||
        model.transientFields.has(field) ||
        !!model.propertyBags?.some((it) => it.field === field) ||
        model.nodeLabels?.field === field
    );
}

/**
 * A loaded value as the check of `update`'s save binds it: as it is where the store can compare it with what the node
 * holds, and otherwise null, which no comparison refuses, so the stamp alone speaks for it. A load hands over a value
 * it can't be given back as: a temporal value as a Date, which the Neo4j driver sends as an empty map, unequal to any
 * property, so the save would be refused each time.
 */
function asCompared(value: any): any {
    const plain = (it: any): boolean => it == null || ['string', 'number', 'boolean', 'bigint'].includes(typeof it);
    return (Array.isArray(value) ? value.every(plain) : plain(value)) ? value : null;
}

function storable(value: any): boolean {
    const scalar = (it: any): boolean =>
        it == null || ['string', 'number', 'boolean', 'bigint'].includes(typeof it) || it instanceof Date;
    return Array.isArray(value) ? value.every((it) => it != null && scalar(it)) : scalar(value);
}

/** A row's props, with its vector properties apart under `vectors`. */
function vectorRow(
    model: FragmentModel,
    props: Record<string, any>
): { props: Record<string, any>; vectors: Record<string, any> } {
    return splitVectors(model, props);
}
