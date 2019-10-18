import { QuerySpecification } from '@/query/QuerySpecification';

export interface PersistenceManager {
    query<T>(spec: QuerySpecification<T>): Promise<T[]>;
}
