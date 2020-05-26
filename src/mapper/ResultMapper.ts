import { QuerySpecification } from '@/query/QuerySpecification';

export interface ResultMapper {
    mapQueryResults<T>(results: any[], spec: QuerySpecification<T>): T[];
}
