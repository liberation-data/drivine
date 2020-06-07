import { QuerySpecification } from '@/query';

export interface ResultMapper {
    mapQueryResults<T>(results: any[], spec: QuerySpecification<T>): T[];
}
