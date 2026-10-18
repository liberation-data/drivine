import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { TargetModel } from '@/model/RelationshipModel';
import { CascadeType } from '@/manager/CascadeType';
import { SaveOptions } from '@/manager/SaveOptions';
import { SaveStatement } from '@/backend/SaveStatement';
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

    /**
     * Deletes the root whose id is the parameter `id`, if it meets the optional predicate (and, for a view, the view's
     * requirements), with its relationships. A cascade, for a view only, deletes nodes the view reaches too. Returns
     * the number of roots deleted.
     */
    delete(target: TargetModel, where?: string, cascade?: CascadeType): GraphStatement;

    /** Deletes every root a load would find, with its relationships. Returns the number deleted. */
    deleteAll(target: TargetModel, where?: string): GraphStatement;

    /** Writes the object as one statement: see SaveStatementBuilder. */
    save(target: TargetModel, object: any, options?: SaveOptions<any>, createOnly?: boolean): SaveStatement;

    /** The stamp the node with id `$id` carries ('-' for none); no row when there is no such node. */
    foundStamp(model: FragmentModel): GraphStatement;

    /** Whether a cause of the failure is the engine turning a statement away for contention. */
    contended(failure: unknown): boolean;
}
