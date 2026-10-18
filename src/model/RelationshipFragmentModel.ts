import { ClassType } from '@/query/QuerySpecification';
import { TargetModel } from '@/model/RelationshipModel';

/**
 * A relationship fragment: a class holding a relationship's properties and the node it leads to.
 */
export interface RelationshipFragmentModel {
    type: ClassType;
    /** The field holding the node the relationship leads to. */
    targetField: string;
    /** What that field holds. */
    target: TargetModel;
    graphProperties: Map<string, string>;
    transientFields: Set<string>;
}
