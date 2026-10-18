import { plainToInstance } from 'class-transformer';
import { Stamps } from '@/model/Stamps';
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
    fragment<T>(model: FragmentModel, row: FragmentRow): T {
        const instance: any = this.properties(model.type, model.graphProperties, model.transientFields, row.props);
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
                ? (value ?? []).map((it: any) => this.related(rel, it))
                : value == null
                  ? undefined
                  : this.related(rel, value);
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
        const instance: any = this.properties(model.type, model.graphProperties, model.transientFields, row.rel);
        instance[model.targetField] = this.target(model.target, row.target);
        return instance;
    }

    private target(into: TargetModel, row: any): any {
        return into.kind === 'GRAPH_VIEW' ? this.view(into.model, row) : this.fragment(into.model, row);
    }

    private properties(
        type: Function,
        graphProperties: Map<string, string>,
        transientFields: Set<string>,
        props: Record<string, any>
    ): any {
        const fields: Record<string, any> = {};
        const byGraphName = new Map([...graphProperties].map(([field, name]) => [name, field]));
        for (const [name, value] of Object.entries(props ?? {})) {
            if (name.startsWith(RESERVED_PREFIX)) {
                continue;
            }
            const field = byGraphName.get(name) ?? (graphProperties.has(name) ? undefined : name);
            if (field !== undefined && !transientFields.has(field)) {
                fields[field] = value;
            }
        }
        return plainToInstance(type as any, fields);
    }
}
