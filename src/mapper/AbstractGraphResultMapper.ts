import { ResultMapper } from '@/mapper/ResultMapper';
import { QuerySpecification } from '@/query';
import { plainToClass } from 'class-transformer';

export abstract class AbstractGraphResultMapper implements ResultMapper {

    protected constructor() {
    }

    mapQueryResults<T>(records: any[], spec: QuerySpecification<T>): T[] {
        let results = this.mapToNative(records);
        if (spec.mapper) {
            results = results.map((it) => spec.mapper!(it));
        }
        if (spec.transformType) {
            results = plainToClass(spec.transformType, results);
        }
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

