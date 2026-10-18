import { ClassType } from '@/query/QuerySpecification';

/**
 * A node fragment: a class whose properties are a node's properties.
 */
export interface FragmentModel {
    type: ClassType;
    /** The class's own labels first, then those it inherits. */
    labels: string[];
    /** The property that identifies the node, if any. */
    nodeIdField?: string;
    /** The name the node id is stored under: the field, unless it has a @GraphProperty. */
    nodeIdProperty?: string;
    /** The property holding the node's stamp, if any. See Stamps. */
    stampField?: string;
    /** Fields stored under another name, field → graph property. Fields not listed are stored under their own. */
    graphProperties: Map<string, string>;
    /** Fields that are neither loaded nor saved. */
    transientFields: Set<string>;
}
