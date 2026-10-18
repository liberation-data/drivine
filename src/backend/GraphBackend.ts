import { FragmentModel } from '@/model/FragmentModel';
import { GraphStatement } from '@/backend/GraphStatement';

/**
 * Generates the statements the object manager runs. One backend per engine family: Cypher now, SQL/PGQ later.
 *
 * A load returns one row per object, each a single map: `{ props, labels }` for a fragment.
 */
export interface GraphBackend {
    /** Loads every node of the fragment, optionally filtered by a predicate over `n`. */
    loadAllFragments(model: FragmentModel, where?: string): GraphStatement;

    /** Loads the node of the fragment whose id is the parameter `id`. */
    loadFragment(model: FragmentModel): GraphStatement;

    /** Counts the nodes of the fragment, optionally filtered by a predicate over `n`. Returns one number. */
    countFragments(model: FragmentModel, where?: string): GraphStatement;
}
