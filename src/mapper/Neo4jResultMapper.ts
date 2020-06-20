import { Integer } from 'neo4j-driver';
import { ResultMapper } from '@/mapper/ResultMapper';

const neo4j = require('neo4j-driver');

export class Neo4jResultMapper extends ResultMapper {

    keys(record: any): string[] {
        return record.keys;
    }

    itemAtIndex(record: any, index: number): any {
        return record.get(index);
    }

    toNative(val: any): any {
        if (val == undefined) {
            return val;
        }
        if (val instanceof neo4j.types.Node) {
            return this.toNative(val.properties);
        }
        if (val instanceof neo4j.types.Relationship) {
            return this.toNative(val.properties);
        }
        if (val instanceof neo4j.types.Point) {
            return val;
        }
        if (neo4j.isInt(val)) {
            return this.toNumberOrThrow(<Integer>val);
        }
        if (Array.isArray(val)) {
            return val.map((a) => this.toNative(a));
        }
        if (this.isRecord(val)) {
            return this.toNative(this.recordToNative(val));
        }
        if (typeof val === 'object') {
            return this.mapObj(this.toNative.bind(this), val);
        }
        return val;
    }

    private recordToNative(rec: any): any {
        const out = {};
        rec.keys.forEach((key: string, index: number) => {
            out[key] = rec._fields[index];
        });
        return out;
    }

    private isRecord(obj: any): boolean {
        return typeof obj._fields !== 'undefined' && typeof obj.keys !== 'undefined';
    }

    private mapObj(fn: Function, obj: any): any {
        const out = {};
        Object.keys(obj).forEach((key) => {
            out[key] = fn(obj[key]);
        });
        return out;
    }

    private toNumberOrThrow(val: Integer): number {
        if (val.inSafeRange()) {
            return val.toNumber();
        }
        throw new Error(`${val} is not in safe range to convert to number`);
    }

}

