import { ClassType } from '@/query/QuerySpecification';
import { FragmentModel } from '@/model/FragmentModel';
import { RelationshipModel } from '@/model/RelationshipModel';

/**
 * A view: a root fragment and the relationships that lead from it.
 */
export interface GraphViewModel {
    type: ClassType;
    rootField: string;
    root: FragmentModel;
    relationships: RelationshipModel[];
}
