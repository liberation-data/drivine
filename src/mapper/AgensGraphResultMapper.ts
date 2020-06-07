import { ResultMapper } from '@/mapper/ResultMapper';
import { QuerySpecification } from '@/query/QuerySpecification';
import { plainToClass } from 'class-transformer';

export class AgensGraphResultMapper implements ResultMapper {

    mapQueryResults<T>(records: any[], spec: QuerySpecification<T>): T[] {
        const results = this.mapToNative(records);
        if (spec.transformType) {
            return plainToClass(spec.transformType, results);
        } else if (spec.mapper) {
            return results.map((it) => spec.mapper!(it));
        }
        return results;
    }

    private mapToNative(records: any[]): any[] {
        const data = new Array(records.length);
        for (let i = 0; i < records.length; i++) {
            const record = records[i];

            let item;
            const keys = Object.keys(record);
            if (keys.length === 1) {
                item = toNative(record[keys[0]])
            }
            else {
                item = new Array(keys.length);
                for (let j = 0; j < keys.length; j++) {
                    const key = keys[j];
                    item[j] = toNative(record[key])
                }
            }
            data[i] = item
        }
        return data
    }

}

const toNative = (val: any): any => {
    if (val == undefined) {
        return val;
    }
    if (val.constructor && val.constructor.name === 'Vertex') {
        return val.props;
    }
    return val;
};
