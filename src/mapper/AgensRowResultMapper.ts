import { ResultMapper } from '@/mapper/ResultMapper';
import { QuerySpecification } from '@/query';
import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';
import { ResultSet } from '@/resultset/ResultSet';

export class AgensRowResultMapper implements ResultMapper {

    mapQueryResults<T>(resultSet: ResultSet, spec: QuerySpecification<T>): T[] {
        let results = resultSet.records;
        spec.postProcessors.forEach((processor: ResultPostProcessor) => {
            results = processor.apply(results);
        });
        return results;
    }

}
