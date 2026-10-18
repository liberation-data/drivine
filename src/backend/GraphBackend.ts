import { FragmentModel } from '@/model/FragmentModel';
import { GraphViewModel } from '@/model/GraphViewModel';
import { TargetModel } from '@/model/RelationshipModel';
import { CascadeType } from '@/manager/CascadeType';
import { SaveOptions } from '@/manager/SaveOptions';
import { SaveStatement } from '@/backend/SaveStatement';
import { ModelRegistry } from '@/model/ModelRegistry';
import { GraphStatement } from '@/backend/GraphStatement';
import { RenderedQuery } from '@/dsl/QueryRenderer';
import { QueryFn, WhereFn } from '@/dsl/Refs';
import { FragmentGroup } from '@/backend/FragmentBatchStatement';
import { GroupQuery } from '@/manager/Groups';
import { MatchedNode } from '@/backend/EdgeStatements';
import { Direction } from '@/annotation/Metadata';
import { RelateMode } from '@/manager/NodeRef';

/**
 * Generates the statements the object manager runs. One backend per engine family: Cypher now, SQL/PGQ later.
 *
 * A load returns one row per object, each a single map: `{ props, labels }` for a fragment, and
 * `{ root, rels }` for a view (see ViewProjector).
 */
export interface NearestSearch {
    /** The label whose vector index is searched: the fragment's first, or a partition's. */
    label: string;
    property: string;
    similarity: 'COSINE' | 'EUCLIDEAN';
    where?: string;
    threshold?: boolean;
    /** How many the index is asked for. Written into the statement: an engine takes only an integer, and a JS number is sent as a float. */
    k: number;
    /** How many are kept after the filter, if any are trimmed. */
    limit?: number;
    depth?: Record<string, number>;
    /** The table an index made for the search is over, where the store keeps one (see `searchIndexTable`). */
    table?: string;
}

/** How a load's roots are ordered (an order written over the root), and how many are skipped and returned. */
export interface Page {
    orderBy?: string;
    skip?: number;
    limit?: number;
}

export interface MatchingSearch {
    label: string;
    properties: string[];
    /** The query text, also bound as `$_text`, for a backend that writes its terms into the statement. */
    text?: string;
    /** The table an index made for the search is over, where the store keeps one (see `searchIndexTable`). */
    table?: string;
    where?: string;
    threshold?: boolean;
    limit: number;
    depth?: Record<string, number>;
}

/**
 * What the object manager asks of a store: each statement it runs, ready to bind. Cypher engines have one backend, SQL
 * stores another. A `where` given as a string is a predicate in the store's own language; a query over references is
 * written by the backend.
 */
export interface GraphBackend {
    /** A query over a class's references, written for the store: its predicate, order and paging, and its values. */
    renderQuery<T>(fn: QueryFn<T>, target: TargetModel): RenderedQuery;

    /** A condition over a class's references, written for the store, with its values. */
    renderWhere<T>(fn: WhereFn<T>, target: TargetModel): { where: string; bindings: Record<string, any> };

    /** Writes `$set` (and `$vectors`) to the node with id `$id` if it meets `where`. Returns `{found, applied, changed}`. */
    patchOne(model: FragmentModel, where?: string): GraphStatement;

    /** Writes each row of `$rows`, `{id, props, vectors}`, to its node. Returns `{id, found, changed}` per row. */
    patchMany(model: FragmentModel): GraphStatement;

    /** Saves fragments of several classes in one statement; returns the stamps before and after per class. */
    fragmentBatch(groups: FragmentGroup[], options: SaveOptions<any>): GraphStatement;

    /** A grouped read. The query may hold references and conditions, which the backend writes. */
    groups(model: FragmentModel, query: GroupQuery<any, any>, pathTargets: Map<string, FragmentModel>): GraphStatement;

    /** The nodes joined to a node by a relationship type in a direction, each once. */
    related(from: MatchedNode, type: string, direction: Direction, target: FragmentModel): GraphStatement;

    relate(
        from: MatchedNode,
        to: MatchedNode,
        type: string,
        properties: Record<string, any>,
        mode: RelateMode
    ): GraphStatement;

    unrelate(from: MatchedNode, to: MatchedNode, type: string): GraphStatement;

    unrelateAll(from: MatchedNode, type: string, direction: Direction): GraphStatement;

    /** The store's identity stamps, `{id, assignedAt}`, oldest first. */
    storeStamps(): GraphStatement;

    /** Mints the identity stamp keyed `$key` unless it is there: `$storeId`, `$assignedAt`, `$engine`. */
    assignStoreStamp(): GraphStatement;

    /** The version recorded for the schema catalog `$name`, if any. */
    schemaVersion(): GraphStatement;

    /** Records `$version` for the schema catalog `$name`. */
    recordSchemaVersion(): GraphStatement;

    /** Loads every node of the fragment, optionally filtered by a predicate over `n`. */
    loadAllFragments(model: FragmentModel, where?: string, page?: Page): GraphStatement;

    /** Loads the node of the fragment whose id is the parameter `id`. */
    loadFragment(model: FragmentModel): GraphStatement;

    /** Counts the nodes of the fragment, optionally filtered by a predicate over `n`. Returns one number. */
    countFragments(model: FragmentModel, where?: string): GraphStatement;

    /** Loads every view whose root meets the view's requirements and, optionally, a predicate over `n`. */
    loadAllViews(model: GraphViewModel, where?: string, depth?: Record<string, number>, page?: Page): GraphStatement;

    /** Loads the view whose root's id is the parameter `id`. */
    loadView(model: GraphViewModel, depth?: Record<string, number>): GraphStatement;

    /** Counts the views {@link loadAllViews} would load. Returns one number. */
    countViews(model: GraphViewModel, where?: string, depth?: Record<string, number>): GraphStatement;

    /**
     * Deletes the root whose id is the parameter `id`, if it meets the optional predicate (and, for a view, the view's
     * requirements), with its relationships. A cascade, for a view only, deletes nodes the view reaches too. Returns
     * the number of roots deleted.
     */
    delete(target: TargetModel, where?: string, cascade?: CascadeType): GraphStatement;

    /** Deletes every root a load would find, with its relationships. Returns the number deleted. */
    deleteAll(target: TargetModel, where?: string): GraphStatement;

    /**
     * Loads the `$_k` nodes nearest `$_vector` by the vector index over a property, as fragments or views, each with its
     * score: `{value, score}`, nearest first. `threshold`, `where` and the view's requirements filter after the search;
     * `limit` trims after the filter.
     */
    nearest(target: TargetModel, search: NearestSearch): GraphStatement;

    /**
     * Loads the nodes matching `$_text` by the full-text index over properties, as fragments or views, each with its
     * relevance scaled so the best hit is 1, most relevant first. Filters apply after the search; `limit` trims.
     */
    matching(target: TargetModel, search: MatchingSearch): GraphStatement;

    /**
     * Where a store keeps a search index as a table of its own (Oracle): the statement giving that table's name for the
     * index over the label's properties, one row, or none when the index was not made. Undefined where the store
     * searches its own index by name.
     */
    searchIndexTable?(kind: 'VECTOR' | 'FULLTEXT', label: string, properties: string[]): GraphStatement;

    /** Writes the object as one statement: see SaveStatementBuilder. */
    save(
        target: TargetModel,
        object: any,
        options?: SaveOptions<any>,
        createOnly?: boolean,
        registry?: ModelRegistry
    ): SaveStatement;

    /** The properties of the node with id `$id`: one row, or none when there is no such node. */
    heldProperties(model: FragmentModel): GraphStatement;

    /** The stamp the node with id `$id` carries ('-' for none); no row when there is no such node. */
    foundStamp(model: FragmentModel): GraphStatement;

    /** Whether a cause of the failure is the engine turning a statement away for contention. */
    contended(failure: unknown): boolean;
}
