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
        return records.map((record) => {
            const item = {};
            Object.keys(record).forEach(key => {
                item[key] = toNative(record[key]);
            });
            return item;
        });
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
