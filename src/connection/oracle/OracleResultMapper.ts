import { ResultMapper } from '@/mapper/ResultMapper';
import { QuerySpecification } from '@/query';
import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';

/** Rows as Oracle gives them, one object per row keyed by column name, through the specification's post-processors. */
export class OracleResultMapper implements ResultMapper {
    mapQueryResults<T>(results: any[], spec: QuerySpecification<T>): T[] {
        spec.postProcessors.forEach((processor: ResultPostProcessor) => {
            results = processor.apply(results);
        });
        return results;
    }
}
