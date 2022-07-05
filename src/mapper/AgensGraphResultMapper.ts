import { GraphResultMapper } from '@/mapper/GraphResultMapper';

export class AgensGraphResultMapper extends GraphResultMapper {
    keys(record: any): string[] {
        return Object.keys(record);
    }

    itemAtIndex(record: any, index: number): any {
        return record[this.keys(record)[index]];
    }

    toNative(val: any): any {
        if (val == undefined) {
            return val;
        } else if ((val.constructor && val.constructor.name === 'Vertex') || val.constructor.name === 'Edge') {
            return val.props;
        }
        return val;
    }
}
