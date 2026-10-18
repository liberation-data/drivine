import {
    ClassKind,
    classChain,
    ClassThunk,
    Direction,
    ownClassMetadata,
    PropertyMetadata,
    propertyMetadata
} from '@/annotation/Metadata';
import { DrivineError } from '@/DrivineError';
import { ClassType } from '@/query/QuerySpecification';
import { FragmentModel } from '@/model/FragmentModel';
import { AggregateModel, GraphViewModel } from '@/model/GraphViewModel';
import { RelatedModel, RelationshipModel } from '@/model/RelationshipModel';
import { RelationshipFragmentModel } from '@/model/RelationshipFragmentModel';

/**
 * Builds the model of a decorated class from its decorators, once, and checks it. Models are built when first
 * asked for, by which time every class a decorator refers to has been declared.
 */
export class ModelRegistry {
    private readonly fragments = new Map<Function, FragmentModel>();
    private readonly relationshipFragments = new Map<Function, RelationshipFragmentModel>();
    private readonly views = new Map<Function, GraphViewModel>();

    kindOf(type: Function): ClassKind | undefined {
        for (const it of classChain(type)) {
            const metadata = ownClassMetadata(it);
            if (metadata) {
                return metadata.kind;
            }
        }
        return undefined;
    }

    fragment(type: ClassType): FragmentModel {
        let model = this.fragments.get(type);
        if (!model) {
            model = this.buildFragment(type);
            this.fragments.set(type, model);
        }
        return model;
    }

    relationshipFragment(type: ClassType): RelationshipFragmentModel {
        let model = this.relationshipFragments.get(type);
        if (!model) {
            model = this.buildRelationshipFragment(type);
            this.relationshipFragments.set(type, model);
        }
        return model;
    }

    view(type: ClassType): GraphViewModel {
        let model = this.views.get(type);
        if (!model) {
            // Cached before its relationships are resolved, so a view that refers to itself finds itself.
            model = this.buildView(type);
            this.views.set(type, model);
            try {
                this.checkRelationships(model);
            } catch (e) {
                this.views.delete(type);
                throw e;
            }
        }
        return model;
    }

    private buildFragment(type: ClassType): FragmentModel {
        this.assertKind(type, ClassKind.NODE_FRAGMENT, '@NodeFragment');
        const labels = new Set<string>();
        for (const it of classChain(type)) {
            ownClassMetadata(it)?.labels?.forEach((label) => labels.add(label));
        }
        if (labels.size === 0) {
            throw new DrivineError(
                `@NodeFragment ${type.name} has no labels. Give it at least one: @NodeFragment({ labels: ['${type.name}'] }).`
            );
        }

        const properties = propertyMetadata(type);
        this.assertOnly(type, properties, ['nodeId', 'nodeStamp', 'graphProperty', 'transient'], 'a @NodeFragment');
        const ids = [...properties].filter(([, it]) => it.nodeId).map(([field]) => field);
        if (ids.length > 1) {
            throw new DrivineError(
                `${type.name} has ${ids.length} @NodeId properties (${ids.join(', ')}). A node has one id.`
            );
        }
        const stamps = [...properties].filter(([, it]) => it.nodeStamp).map(([field]) => field);
        if (stamps.length > 1) {
            throw new DrivineError(
                `${type.name} has ${stamps.length} @NodeStamp properties (${stamps.join(', ')}). A node has one stamp.`
            );
        }
        const stampField = stamps[0];
        if (
            stampField &&
            (properties.get(stampField)!.graphProperty ||
                properties.get(stampField)!.transient ||
                stampField === ids[0])
        ) {
            throw new DrivineError(`@NodeStamp ${type.name}.${stampField} can't carry another mapping decorator.`);
        }
        const graphProperties = this.graphProperties(properties);
        const nodeIdField = ids[0];
        return {
            type,
            labels: [...labels],
            nodeIdField,
            nodeIdProperty: nodeIdField ? graphProperties.get(nodeIdField) ?? nodeIdField : undefined,
            stampField,
            graphProperties,
            transientFields: this.transientFields(properties)
        };
    }

    private buildRelationshipFragment(type: ClassType): RelationshipFragmentModel {
        this.assertKind(type, ClassKind.RELATIONSHIP_FRAGMENT, '@RelationshipFragment');
        const properties = propertyMetadata(type);
        this.assertOnly(type, properties, ['targetNode', 'graphProperty', 'transient'], 'a @RelationshipFragment');
        const targets = [...properties].filter(([, it]) => it.targetNode);
        if (targets.length !== 1) {
            throw new DrivineError(
                `@RelationshipFragment ${type.name} needs exactly one @TargetNode property, the node the relationship ` +
                    `leads to. It has ${targets.length}.`
            );
        }
        const [targetField, metadata] = targets[0];
        const targetType = this.resolve(type, targetField, metadata.targetNode!.target, metadata);
        const target = this.related(targetType, `${type.name}.${targetField}`);
        if (target.kind === 'RELATIONSHIP_FRAGMENT') {
            throw new DrivineError(
                `${type.name}.${targetField} must hold a node fragment or a view, not a relationship fragment.`
            );
        }
        return {
            type,
            targetField,
            target,
            graphProperties: this.graphProperties(properties),
            transientFields: this.transientFields(properties)
        };
    }

    private buildView(type: ClassType): GraphViewModel {
        this.assertKind(type, ClassKind.GRAPH_VIEW, '@GraphView');
        const properties = propertyMetadata(type);
        this.assertOnly(
            type,
            properties,
            ['root', 'relationship', 'transient', 'readOnly', 'aggregate'],
            'a @GraphView'
        );
        properties.forEach((metadata, field) => {
            if (metadata.readOnly && !metadata.relationship && !metadata.aggregate) {
                throw new DrivineError(`@ReadOnly ${type.name}.${field} marks a relationship field; it has none.`);
            }
            if (metadata.aggregate && metadata.relationship) {
                throw new DrivineError(`${type.name}.${field} can't be both a relationship and an aggregate.`);
            }
        });
        const roots = [...properties].filter(([, it]) => it.root);
        if (roots.length !== 1) {
            throw new DrivineError(`@GraphView ${type.name} needs exactly one @Root property. It has ${roots.length}.`);
        }
        const [rootField, rootMetadata] = roots[0];
        const rootType = this.resolve(type, rootField, rootMetadata.root!.target, rootMetadata);
        if (this.kindOf(rootType) !== ClassKind.NODE_FRAGMENT) {
            throw new DrivineError(
                `The @Root of ${type.name}, ${rootField}, must be a @NodeFragment. ${rootType.name} is not.`
            );
        }

        const relationships = [...properties]
            .filter(([, it]) => it.relationship)
            .map(([field, metadata]) => this.relationship(type, field, metadata));
        const aggregates = [...properties]
            .filter(([, it]) => it.aggregate)
            .map(([field, it]) => {
                const options = it.aggregate!;
                if (!options.type) {
                    throw new DrivineError(`The aggregate ${type.name}.${field} needs a relationship type.`);
                }
                if (options.function !== 'COUNT' && !options.property) {
                    throw new DrivineError(
                        `The ${options.function} ${type.name}.${field} needs the property it aggregates.`
                    );
                }
                return {
                    field,
                    function: options.function as AggregateModel['function'],
                    type: options.type,
                    property: options.property,
                    direction: options.direction ?? Direction.OUTGOING
                };
            });
        return { type, rootField, root: this.fragment(rootType), relationships, aggregates };
    }

    private relationship(view: ClassType, field: string, metadata: PropertyMetadata): RelationshipModel {
        const options = metadata.relationship!;
        if (!options.type) {
            throw new DrivineError(`@GraphRelationship on ${view.name}.${field} needs a type.`);
        }
        const isCollection = metadata.designType === Array;
        if (isCollection && !options.target) {
            throw new DrivineError(
                `${view.name}.${field} is a list, and TypeScript does not keep the type of a list's items. Name it: ` +
                    `@GraphRelationship({ type: '${options.type}', target: () => Item }).`
            );
        }
        const maxDepth = options.maxDepth ?? 1;
        if (!Number.isInteger(maxDepth) || maxDepth < 1) {
            throw new DrivineError(`maxDepth on ${view.name}.${field} must be a whole number of at least 1.`);
        }
        const resolveRelated = (): RelatedModel => {
            const resolved = this.related(this.resolve(view, field, options.target, metadata), `${view.name}.${field}`);
            if (resolved.kind === 'RELATIONSHIP_FRAGMENT' && maxDepth > 1) {
                throw new DrivineError(
                    `${view.name}.${field} holds relationship fragments, which are one relationship each: maxDepth can't be above 1.`
                );
            }
            return resolved;
        };
        let related: RelatedModel | undefined;
        return {
            field,
            type: options.type,
            direction: options.direction ?? Direction.OUTGOING,
            maxDepth,
            required: options.required ?? false,
            isCollection,
            get related(): RelatedModel {
                return related ?? (related = resolveRelated());
            },
            get readOnly(): boolean {
                return !!metadata.readOnly || (this.related.kind === 'NODE_FRAGMENT' && maxDepth > 1);
            }
        };
    }

    private checkRelationships(view: GraphViewModel): void {
        view.relationships.forEach((it) => it.related);
    }

    private related(type: ClassType, where: string): RelatedModel {
        switch (this.kindOf(type)) {
            case ClassKind.NODE_FRAGMENT:
                return { kind: 'NODE_FRAGMENT', model: this.fragment(type) };
            case ClassKind.GRAPH_VIEW:
                return { kind: 'GRAPH_VIEW', model: this.view(type) };
            case ClassKind.RELATIONSHIP_FRAGMENT:
                return { kind: 'RELATIONSHIP_FRAGMENT', model: this.relationshipFragment(type) };
            default:
                throw new DrivineError(
                    `${where} holds ${type.name}, which is not a @NodeFragment, @RelationshipFragment or @GraphView.`
                );
        }
    }

    private resolve(
        owner: Function,
        field: string,
        thunk: ClassThunk | undefined,
        metadata: PropertyMetadata
    ): ClassType {
        const type = thunk ? thunk() : metadata.designType;
        if (typeof type !== 'function' || type === Object || type === Array) {
            throw new DrivineError(
                `Can't tell what ${owner.name}.${field} holds. Name its class in the decorator, e.g. () => Item.`
            );
        }
        return type as ClassType;
    }

    private assertKind(type: Function, kind: ClassKind, decorator: string): void {
        if (this.kindOf(type) !== kind) {
            throw new DrivineError(`${type.name} is not a ${decorator}.`);
        }
    }

    private assertOnly(
        type: Function,
        properties: Map<string, PropertyMetadata>,
        allowed: (keyof PropertyMetadata)[],
        what: string
    ): void {
        const mapping: (keyof PropertyMetadata)[] = [
            'root',
            'nodeId',
            'nodeStamp',
            'relationship',
            'graphProperty',
            'transient',
            'targetNode',
            'readOnly',
            'aggregate'
        ];
        properties.forEach((metadata, field) => {
            const misplaced = mapping.filter((key) => metadata[key] && !allowed.includes(key));
            if (misplaced.length) {
                throw new DrivineError(
                    `${type.name}.${field}: ${misplaced.map(decoratorName).join(', ')} can't be used on ${what}.`
                );
            }
        });
    }

    private graphProperties(properties: Map<string, PropertyMetadata>): Map<string, string> {
        const result = new Map<string, string>();
        properties.forEach((metadata, field) => metadata.graphProperty && result.set(field, metadata.graphProperty));
        return result;
    }

    private transientFields(properties: Map<string, PropertyMetadata>): Set<string> {
        return new Set([...properties].filter(([, it]) => it.transient).map(([field]) => field));
    }
}

function decoratorName(key: keyof PropertyMetadata): string {
    return {
        root: '@Root',
        nodeId: '@NodeId',
        nodeStamp: '@NodeStamp',
        relationship: '@GraphRelationship',
        graphProperty: '@GraphProperty',
        transient: '@GraphTransient',
        targetNode: '@TargetNode',
        readOnly: '@ReadOnly',
        aggregate: '@Count or @Aggregate',
        designType: ''
    }[key];
}
