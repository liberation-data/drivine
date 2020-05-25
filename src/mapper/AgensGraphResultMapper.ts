import { ResultMapper } from '@/mapper/ResultMapper';
import { QuerySpecification } from '@/query/QuerySpecification';
import { plainToClass } from 'class-transformer';

export class AgensGraphResultMapper implements ResultMapper {
    mapQueryResults<T>(results: any[], spec: QuerySpecification<T>): T[] {
        if (spec.transformType) {
            return plainToClass(spec.transformType, results);
        } else if (spec.mapper) {
            return results.map((it) => spec.mapper!(it));
        }
        return results;
    }
}
