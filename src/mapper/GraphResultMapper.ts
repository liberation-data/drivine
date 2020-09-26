import { QuerySpecification } from '@/query';
import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';
import { ResultMapper } from '@/mapper/ResultMapper';
import { ResultSet } from '@/resultset/ResultSet';

export type MultiColumnStyle = 'named' | 'indexed';

/**
 * Maps graph results to native format, according the the idea that the most common use-cases should be simplest.
 * Other cases should be possible. Therefore:
 *
 * If the result set contains a single column useful for this {@link https://bit.ly/2S1g9qs} kind of query, then a
 * single object is returned.
 *
 * Otherwise results returned according to the multiColumnStyle
 *
 * @property {MultiColumnStyle} multiColumnStyle. If 'named' (default, since 2.5) the column name is an object key.
 * If 'indexed', results are returned as an array of arrays.
 *
 */
export abstract class GraphResultMapper implements ResultMapper {

    constructor(readonly multiColumnStyle: MultiColumnStyle = 'named') {
    }

    mapQueryResults<T>(resultSet: ResultSet, spec: QuerySpecification<T>): T[] {
        // TODO: The default mapper(s) can be a result post processor too - then users can specify own, if desired.
        let results = this.mapToNative(resultSet);
        spec.postProcessors.forEach((processor: ResultPostProcessor) => {
            results = processor.apply(results);
        });
        return results;
    }

    private mapToNative(resultSet: ResultSet): any[] {
        const length = resultSet.length();
        const data = new Array(length);
        for (let i = 0; i < length; i++) {
            const record = resultSet.recordAtRow(i);
            const keys = resultSet.columnNames();
            let item;
            if (keys.length === 1) {
                item = this.toNative(resultSet.itemAtColumnIndex(record, 0));
            } else {
                if (this.multiColumnStyle == 'indexed') {
                    item = this.mapIndexed(resultSet, record);
                } else {
                    item = this.mapKeyed(resultSet, record);
                }
            }
            data[i] = item;
        }
        return data;
    }

    private mapIndexed(resultSet: ResultSet, record: any): any {
        const length = resultSet.columnNames().length;
        const item = new Array(length);
        for (let j = 0; j < length; j++) {
            item[j] = this.toNative(resultSet.itemAtColumnIndex(record, j));
        }
        return item;
    }

    private mapKeyed(resultSet: ResultSet, record: any): any {
        const item = {};
        resultSet.columnNames().forEach(key => {
            item[key] = this.toNative(resultSet.itemWithColumnName(record, key));
        })
        return item;
    }

    abstract toNative(val: any): any;

}

