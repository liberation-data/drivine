import { ResultMapper } from '@/mapper/ResultMapper';
import { QuerySpecification } from '@/query';
import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';

export class PostgresResultMapper implements ResultMapper {

    mapQueryResults<T>(results: any[], spec: QuerySpecification<T>): T[] {
        spec.postProcessors.forEach((processor: ResultPostProcessor) => {
            results = processor.apply(results);
        });
        return results;
    }

}
