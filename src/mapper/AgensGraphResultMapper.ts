import { GraphResultMapper } from '@/mapper/GraphResultMapper';

export class AgensGraphResultMapper extends GraphResultMapper {

    toNative(val: any): any {
        if (val == undefined) {
            return val;
        }
        else if (val.constructor && val.constructor.name === 'Vertex' || val.constructor.name === 'Edge') {
            return val.props;
        }
        return val;
    }

}

