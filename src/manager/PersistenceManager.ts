import { QuerySpecification } from '@/query/QuerySpecification';
import { Cursor } from "@/cursor/Cursor";

export interface PersistenceManager {

    /**
     * Queries for a set of results according to the supplied specification.
     * @param spec
     */
    query<T>(spec: QuerySpecification<T>): Promise<T[]>;

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
    openCursor<T>(spec: QuerySpecification<T>): Promise<Cursor<T>>;

}
