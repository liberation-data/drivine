import { ResultMapper } from '@/mapper/ResultMapper';
import { QuerySpecification } from '@/query/QuerySpecification';
import { Integer } from 'neo4j-driver';
import { plainToClass } from 'class-transformer';

const neo4j = require('neo4j-driver');

export class Neo4jResultMapper implements ResultMapper {
    mapQueryResults<T>(records: any[], spec: QuerySpecification<T>): T[] {
        const results = this.mapToNative(records);
        if (spec.transformType) {
            return plainToClass(spec.transformType, results);
        } else if (spec.mapper) {
            return results.map(it => spec.mapper!(it));
        }
        return results;
    }

    mapToNative(records: any[]): any[] {
        const data = new Array(records.length);
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const item = {};
            for (let j = 0; j < record.keys.length; j++) {
                const key = record.keys[j];
                item[key] = toNative(record.get(j));
            }
            data[i] = item;
        }
        return data;
    }
}

const toNative = (val: any): any => {
    if (val == undefined) {
        return val;
    }
    if (val instanceof neo4j.types.Node) {
        return toNative(val.properties);
    }
    if (val instanceof neo4j.types.Relationship) {
        return toNative(val.properties);
    }
    if (val instanceof neo4j.types.Point) {
        return val;
    }
    if (neo4j.isInt(val)) {
        return toNumberOrThrow(<Integer>val);
    }
    if (Array.isArray(val)) {
        return val.map(a => toNative(a));
    }
    if (isRecord(val)) {
        return toNative(recordToNative(val));
    }
    if (typeof val === 'object') {
        return mapObj(toNative, val);
    }
    return val;
};

const recordToNative = (rec: any): any => {
    const out = {};
    rec.keys.forEach((key: string, index: number) => {
        out[key] = rec._fields[index];
    });
    return out;
};

const isRecord = (obj: any): boolean => typeof obj._fields !== 'undefined' && typeof obj.keys !== 'undefined';

const mapObj = (fn: Function, obj: any): any => {
    const out = {};
    Object.keys(obj).forEach(key => {
        out[key] = fn(obj[key]);
    });
    return out;
};

const toNumberOrThrow = (val: Integer): number => {
    if (val.inSafeRange()) {
        return val.toNumber();
    }
    throw new Error(`${val} is not in safe range to convert to number`);
};
