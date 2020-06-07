import { QuerySpecification } from '@/query';
import { Cursor } from '@/cursor/Cursor';
import { CursorSpecification } from '@/cursor';

export interface PersistenceManager {
    /**
     * Queries for a set of results according to the supplied specification.
     * @param spec
     */
    query<T>(spec: QuerySpecification<T>): Promise<T[]>;

    /**
     * Execute a statement, and disregard any results that are returned.
     * @param spec
     */
    execute(spec: QuerySpecification<void>): Promise<void>;

    /**
     * Queries for a single result according to the supplied specification. Expects exactly one result or throws.
     * @param spec
     * @throws DrivineError.
     */
    getOne<T>(spec: QuerySpecification<T>): Promise<T>;

    /**
     * Queries for a single result according to the supplied specification. Expects zero or one result, otherwise
     * throws.
     * @param spec
     * @throws DrivineError.
     */
    maybeGetOne<T>(spec: QuerySpecification<T>): Promise<T | undefined>;

    /**
     * Returns an object that streams results either as an `AsyncIterable` or a `Readable` stream.
     * @param spec
     */
    openCursor<T>(spec: CursorSpecification<T>): Promise<Cursor<T>>;
}
