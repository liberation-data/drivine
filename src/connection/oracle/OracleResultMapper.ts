import { ResultMapper } from '@/mapper/ResultMapper';
import { QuerySpecification } from '@/query';
import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';

/**
 * Rows as Oracle gives them, keyed by column name, through the specification's post-processors. A row of one column
 * is that column's value, as a record of one column is on the graph engines.
 */
export class OracleResultMapper implements ResultMapper {
    mapQueryResults<T>(rows: any[], spec: QuerySpecification<T>): T[] {
        let results = rows.map((row) => {
            const keys = row !== null && typeof row === 'object' ? Object.keys(row) : [];
            return keys.length === 1 ? row[keys[0]] : row;
        });
        spec.postProcessors.forEach((processor: ResultPostProcessor) => {
            results = processor.apply(results);
        });
        return results;
    }
}
