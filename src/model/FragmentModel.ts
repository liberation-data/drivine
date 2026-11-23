import { ClassType } from '@/query/QuerySpecification';

/**
 * A node fragment: a class whose properties are a node's properties.
 */
import { FieldMapping } from '@/model/FieldMapping';

export interface NodeLabelsModel {
    field: string;
    /** The labels a closed field owns; undefined for an open one, which owns the labels it recorded writing. */
    members?: string[];
    /** Whether the field holds a Set, rather than an array. */
    isSet: boolean;
    /** Where an open field records the labels it wrote. */
    recordProperty: string;
}

export interface PropertyBagModel {
    field: string;
    /** What every entry's property name starts with: `<prefix><delimiter>`, or '' for a flat bag. */
    namespace: string;
    flat: boolean;
}

export interface FragmentModel extends FieldMapping {
    type: ClassType;
    /** The class's own labels first, then those it inherits. */
    labels: string[];
    /** The property that identifies the node, if any. */
    nodeIdField?: string;
    /** The name the node id is stored under: the field, unless it has a @GraphProperty. */
    nodeIdProperty?: string;
    /**
     * The `@NodeId` field's declared type, as TypeScript records it (`design:type`), where it records one: an id given as
     * text is read as it on every store (see NodeIds).
     */
    nodeIdType?: Function;
    /** The field holding the node's labels beyond the fragment's own, if any. */
    nodeLabels?: NodeLabelsModel;
    /** The full-text indexes the fragment declares with @FullTextIndex, each by its graph properties. */
    fullTextIndexes: string[][];
    /** Fields declared @VectorIndex: field → its graph property and similarity. */
    vectorFields: Map<string, { property: string; similarity: 'COSINE' | 'EUCLIDEAN' }>;
    /** Object fields stored as one node property per entry. */
    propertyBags: PropertyBagModel[];
    /** The property holding the node's stamp, if any. See Stamps. */
    stampField?: string;
    /** Fields stored under another name, field → graph property. Fields not listed are stored under their own. */
    graphProperties: Map<string, string>;
    /** Fields that are neither loaded nor saved. */
    transientFields: Set<string>;
    /**
     * The stored names of the `@CaseInsensitive` fields, in the order of their fields' names, each of which a save gives
     * a lowercased copy: see LowerCopies.
     */
    lowerCopied: string[];
}

/** A fragment with a `@NodeId`: what a grouped read's path key ends at, as its groups are ordered by the node's id. */
export type IdentifiedFragment = FragmentModel & { nodeIdProperty: string };

/** Whether `model` has a `@NodeId`. */
export function isIdentified(model: FragmentModel): model is IdentifiedFragment {
    return !!model.nodeIdProperty;
}
