import { GraphResultMapper } from '@/mapper/GraphResultMapper';

export class RedisGraphResultMapper extends GraphResultMapper {

    toNative(val: any[]): any {
        if (val == undefined) {
            return val;
        }
        const result = {};
        const properties = val[2];
        properties[1].forEach((pair: any[]) => {
            result[pair[0]] = pair[1];
        });

        return result;
    }
}
