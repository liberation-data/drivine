import { plainToInstance } from 'class-transformer';
import { Stamps } from '@/model/Stamps';
import { ModelRegistry } from '@/model/ModelRegistry';
import { FieldMapping } from '@/model/FieldMapping';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipFragmentModel } from '@/model/RelationshipFragmentModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';

/**
 * Keys a row's properties are never copied under: a property bag's entry or a field named `__proto__` would otherwise
 * give the object it is copied onto a prototype of the store's choosing.
 */
export const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Property names beginning with this are Drivine's own, and are never mapped onto an object. */
export const RESERVED_PREFIX = '__drivine.';

/**
 * The properties a flat bag doesn't take on load, as they are named on the node: those of the fields the class
 * decorates or initializes, and the id.
 */
export function knownProperties(type: Function, mapping: FieldMapping, fragment: FragmentModel): Set<string> {
    return new Set<string>([
        ...mapping.graphProperties.values(),
        ...mapping.transientFields,
        ...mapping.jsonPacked,
        ...mapping.defaults,
        ...mapping.emptyWhenAbsent.keys(),
        ...[fragment.nodeIdProperty, fragment.stampField].filter((it): it is string => !!it),
        ...Object.keys(plainToInstance(type as any, {}) as object)
    ]);
}

/**
 * A node as a fragment load returns it: its properties, and its labels apart from them.
 */
export interface FragmentRow {
    props: Record<string, any>;
    labels: string[];
}

/**
 * A view as a view load returns it: its root, and what each relationship field holds.
 */
export interface ViewRow {
    root: FragmentRow;
    rels: Record<string, any>;
}

/**
 * A relationship fragment as a view load returns it: the relationship's properties, and the node it leads to.
 */
export interface RelationshipRow {
    rel: Record<string, any>;
    target: FragmentRow | ViewRow;
}

/**
 * Turns the rows the object manager's statements return into instances of the mapped classes.
 */
export class GraphObjectMapper {
    /**
     * @param registry when given, a node is loaded as the most specific subtype of the expected class whose labels it
     * carries.
     */
    constructor(private readonly registry?: ModelRegistry) {}

    fragment<T>(expected: FragmentModel, row: FragmentRow): T {
        const model = this.registry && row.labels ? this.registry.fragmentFor(expected, row.labels) : expected;
        const instance: any = this.properties(model.type, model, row.props, model);
        if (model.stampField) {
            instance[model.stampField] = row.props?.[Stamps.PROPERTY] ?? undefined;
        }
        if (model.nodeLabels) {
            const field = model.nodeLabels;
            const labels = (row.labels ?? []).filter((it) =>
                field.members ? field.members.includes(it) : !model.labels.includes(it)
            );
            instance[field.field] = field.isSet ? new Set(labels) : labels;
        }
        return instance as T;
    }

    view<T>(model: GraphViewModel, row: ViewRow): T {
        const instance: any = plainToInstance(model.type, {});
        instance[model.rootField] = this.fragment(model.root, row.root);
        for (const rel of model.relationships) {
            const value = row.rels?.[rel.field];
            instance[rel.field] = rel.isCollection
                ? sorted(
                      (value ?? []).map((it: any) => this.related(rel, it)),
                      rel.sortedBy
                  )
                : value == null
                ? undefined
                : this.related(rel, value);
        }
        for (const path of model.paths) {
            const value = row.rels?.[path.field];
            instance[path.field] = path.isCollection
                ? (value ?? []).map((it: FragmentRow) => this.fragment(path.target, it))
                : value == null
                ? undefined
                : this.fragment(path.target, value);
        }
        for (const aggregate of model.aggregates) {
            instance[aggregate.field] = row.rels?.[aggregate.field] ?? undefined;
        }
        return instance as T;
    }

    /**
     * Splits a node's properties between its property bags and its other fields. A prefixed bag takes the properties
     * in its namespace; a flat bag takes every property no other bag takes and no known field is stored under: a
     * decorated field, or one the class initializes.
     */
    private takeBags(
        type: Function,
        mapping: FieldMapping,
        source: Record<string, any>,
        fragment?: FragmentModel
    ): { props: Record<string, any>; bags: Record<string, Record<string, any>> } {
        if (!fragment?.propertyBags.length) {
            return { props: source, bags: {} };
        }
        const props: Record<string, any> = {};
        const bags: Record<string, Record<string, any>> = {};
        fragment.propertyBags.forEach((bag) => (bags[bag.field] = {}));
        const flat = fragment.propertyBags.find((it) => it.flat);
        const known = flat ? knownProperties(type, mapping, fragment) : new Set<string>();
        for (const [name, value] of Object.entries(source)) {
            const bag = fragment.propertyBags.find((it) => !it.flat && name.startsWith(it.namespace));
            if (FORBIDDEN_KEYS.has(bag ? name.slice(bag.namespace.length) : name)) {
                continue;
            }
            if (bag) {
                bags[bag.field][name.slice(bag.namespace.length)] = value;
            } else if (flat && !name.startsWith(RESERVED_PREFIX) && !known.has(name)) {
                bags[flat.field][name] = value;
            } else {
                props[name] = value;
            }
        }
        return { props, bags };
    }

    private related(rel: RelationshipModel, value: any): any {
        const related = rel.related;
        return related.kind === 'RELATIONSHIP_FRAGMENT'
            ? this.relationshipFragment(related.model, value)
            : this.target(related, value);
    }

    private relationshipFragment(model: RelationshipFragmentModel, row: RelationshipRow): any {
        const instance: any = this.properties(model.type, model, row.rel);
        instance[model.targetField] = this.target(model.target, row.target);
        return instance;
    }

    private target(into: TargetModel, row: any): any {
        return into.kind === 'GRAPH_VIEW' ? this.view(into.model, row) : this.fragment(into.model, row);
    }

    private properties(
        type: Function,
        mapping: FieldMapping,
        source: Record<string, any>,
        fragment?: FragmentModel
    ): any {
        const fields: Record<string, any> = {};
        const { props, bags }: { props: Record<string, any>; bags: Record<string, any> } = this.takeBags(
            type,
            mapping,
            source ?? {},
            fragment
        );
        Object.assign(fields, bags);
        const byGraphName = new Map([...mapping.graphProperties].map(([field, name]) => [name, field]));
        for (const [name, value] of Object.entries(props)) {
            if (name.startsWith(RESERVED_PREFIX)) {
                continue;
            }
            const field = byGraphName.get(name) ?? (mapping.graphProperties.has(name) ? undefined : name);
            if (
                field === undefined ||
                FORBIDDEN_KEYS.has(field) ||
                mapping.transientFields.has(field) ||
                (value == null && mapping.defaults.has(field))
            ) {
                continue;
            }
            fields[field] = mapping.jsonPacked.has(field) ? unpacked(value) : value;
        }
        const instance = plainToInstance(type as any, fields) as any;
        fragment?.propertyBags.forEach((bag) => (instance[bag.field] = instance[bag.field] ?? {}));
        mapping.emptyWhenAbsent.forEach((kind, field) => {
            if (instance[field] == null) {
                instance[field] = kind === 'array' ? [] : {};
            }
        });
        return instance;
    }
}

/** A packed JSON value, unpacked; a value that isn't JSON text is left as it is. */
function unpacked(value: any): any {
    if (typeof value !== 'string') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

/** The items sorted by a property path, nulls last; as they are without one. */
function sorted(items: any[], by?: { property: string; ascending: boolean }): any[] {
    if (!by) {
        return items;
    }
    const path = by.property.split('.');
    const valueOf = (item: any): any => path.reduce((it, key) => it?.[key], item);
    const direction = by.ascending ? 1 : -1;
    return items.sort((a, b) => {
        const [x, y] = [valueOf(a), valueOf(b)];
        if (x == null || y == null) {
            return x == null ? (y == null ? 0 : 1) : -1;
        }
        return (x < y ? -1 : x > y ? 1 : 0) * direction;
    });
}
