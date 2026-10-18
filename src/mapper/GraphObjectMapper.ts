import { plainToInstance } from 'class-transformer';
import { Stamps } from '@/model/Stamps';
import { ModelRegistry } from '@/model/ModelRegistry';
import { FieldMapping } from '@/model/FieldMapping';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipFragmentModel } from '@/model/RelationshipFragmentModel';
import { RelationshipModel, TargetModel } from '@/model/RelationshipModel';

/** Property names beginning with this are Drivine's own, and are never mapped onto an object. */
export const RESERVED_PREFIX = '__drivine.';

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
        const instance: any = this.properties(model.type, model, row.props);
        if (model.stampField) {
            instance[model.stampField] = row.props?.[Stamps.PROPERTY] ?? undefined;
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

    private properties(type: Function, mapping: FieldMapping, props: Record<string, any>): any {
        const fields: Record<string, any> = {};
        const byGraphName = new Map([...mapping.graphProperties].map(([field, name]) => [name, field]));
        for (const [name, value] of Object.entries(props ?? {})) {
            if (name.startsWith(RESERVED_PREFIX)) {
                continue;
            }
            const field = byGraphName.get(name) ?? (mapping.graphProperties.has(name) ? undefined : name);
            if (
                field === undefined ||
                mapping.transientFields.has(field) ||
                (value == null && mapping.defaults.has(field))
            ) {
                continue;
            }
            fields[field] = mapping.jsonPacked.has(field) ? unpacked(value) : value;
        }
        const instance = plainToInstance(type as any, fields) as any;
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
