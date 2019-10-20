import { QuerySpecification } from '@/query/QuerySpecification';
import { Cursor } from "@/cursor/Cursor";

export interface PersistenceManager {

    query<T>(spec: QuerySpecification<T>): Promise<T[]>;

    openCursor<T>(spec: QuerySpecification<T>): Promise<Cursor<T>>;

}
