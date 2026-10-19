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
    /** Fields holding the nodes at the far end of a fixed list of hops. Read-only. */
    paths: PathModel[];
}

/** A hop of a path: its relationship type and direction, the label the node it reaches carries, and its order. */
export interface PathHop {
    type: string;
    direction: Direction;
    label?: string;
    /** A property of the node this hop reaches that the path is read in the order of. */
    orderBy?: string;
    ascending: boolean;
}

export interface PathModel {
    field: string;
    hops: PathHop[];
    isCollection: boolean;
    required: boolean;
    /** The final node's fragment. Resolved on first use. */
    readonly target: FragmentModel;
}

export interface AggregateModel {
    field: string;
    function: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
    type: string;
    property?: string;
    direction: Direction;
}
