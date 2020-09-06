import { QuerySpecification } from '@/query';
import { ResultPostProcessor } from '@/mapper/ResultPostProcessor';

export abstract class ResultMapper {

    mapQueryResults<T>(records: any[], spec: QuerySpecification<T>): T[] {
        // TODO: The default mapper(s) can be a result post processor too - then users can specify own, if desired.
        let results = this.mapToNative(records);
        spec.postProcessors.forEach((processor: ResultPostProcessor) => {
            results = processor.apply(results);
        });
        return results;
    }

    private mapToNative(records: any[]): any[] {
        const data = new Array(records.length);
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const keys = this.keys(record);
            let item;
            if (keys.length === 1) {
                item = this.toNative(this.itemAtIndex(record,0));
            } else {
                item = new Array(records.keys.length);
                for (let j = 0; j < record.keys.length; j++) {
                    item[j] = this.toNative(this.itemAtIndex(record, j));
                }
            }
            data[i] = item;
        }
        return data;
    }

    abstract keys(record: any): string[];

    abstract itemAtIndex(record: any, index: number): any;

    abstract toNative(val: any): any;

}

