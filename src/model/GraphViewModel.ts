import { ClassType } from '@/query/QuerySpecification';
import { Direction } from '@/annotation/Metadata';
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
    /** Fields computed in the query from the nodes a relationship type leads to. Read-only. */
    aggregates: AggregateModel[];
}

export interface AggregateModel {
    field: string;
    function: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
    type: string;
    property?: string;
    direction: Direction;
}
