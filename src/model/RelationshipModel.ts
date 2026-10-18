import { Direction } from '@/annotation/Metadata';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { RelationshipFragmentModel } from '@/model/RelationshipFragmentModel';

export type TargetModel =
    | { kind: 'NODE_FRAGMENT'; model: FragmentModel }
    | { kind: 'GRAPH_VIEW'; model: GraphViewModel };

export type RelatedModel = TargetModel | { kind: 'RELATIONSHIP_FRAGMENT'; model: RelationshipFragmentModel };

/**
 * A relationship field of a view.
 */
export interface RelationshipModel {
    field: string;
    type: string;
    direction: Direction;
    maxDepth: number;
    required: boolean;
    isCollection: boolean;
    /** What the field holds. Resolved on first use, so a view may refer to itself. */
    readonly related: RelatedModel;
    /**
     * Loaded and never written: marked @ReadOnly, or a list of fragments read over several hops, which names no single
     * relationship a save could write.
     */
    readonly readOnly: boolean;
}
