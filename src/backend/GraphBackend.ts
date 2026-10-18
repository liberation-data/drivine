import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { GraphStatement } from '@/backend/GraphStatement';

/**
 * Generates the statements the object manager runs. One backend per engine family: Cypher now, SQL/PGQ later.
 *
 * A load returns one row per object, each a single map: `{ props, labels }` for a fragment, and
 * `{ root, rels }` for a view (see ViewProjector).
 */
export interface GraphBackend {
    /** Loads every node of the fragment, optionally filtered by a predicate over `n`. */
    loadAllFragments(model: FragmentModel, where?: string): GraphStatement;

    /** Loads the node of the fragment whose id is the parameter `id`. */
    loadFragment(model: FragmentModel): GraphStatement;

    /** Counts the nodes of the fragment, optionally filtered by a predicate over `n`. Returns one number. */
    countFragments(model: FragmentModel, where?: string): GraphStatement;

    /** Loads every view whose root meets the view's requirements and, optionally, a predicate over `n`. */
    loadAllViews(model: GraphViewModel, where?: string): GraphStatement;

    /** Loads the view whose root's id is the parameter `id`. */
    loadView(model: GraphViewModel): GraphStatement;

    /** Counts the views {@link loadAllViews} would load. Returns one number. */
    countViews(model: GraphViewModel, where?: string): GraphStatement;
}
