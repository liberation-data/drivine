import { QuerySpecification } from '@/query';
import { ResultSet } from '@/resultset/ResultSet';

export interface ResultMapper {
    mapQueryResults<T>(results: ResultSet, spec: QuerySpecification<T>): T[];
}
