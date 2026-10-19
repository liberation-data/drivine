import { GraphResultMapper } from '@/mapper/GraphResultMapper';

/**
 * Maps rows from the falkordb client, which are plain objects keyed by column. A node or relationship is returned as
 * its properties, as on Neo4j.
 */
export class FalkorDbResultMapper extends GraphResultMapper {
    keys(record: any): string[] {
        return Object.keys(record);
    }

    itemAtIndex(record: any, index: number): any {
        return record[this.keys(record)[index]];
    }

    toNative(val: any): any {
        if (val == undefined) {
            return val;
        }
        if (Array.isArray(val)) {
            return val.map((it) => this.toNative(it));
        }
        if (typeof val !== 'object') {
            return val;
        }
        switch (Object.prototype.toString.call(val)) {
            case '[object Temporal.PlainDateTime]':
                // FalkorDB holds a datetime as seconds since the epoch, in UTC.
                return new Date(`${val.toString()}Z`);
            case '[object Temporal.PlainDate]':
                return new Date(`${val.toString()}T00:00:00Z`);
            case '[object Temporal.PlainTime]':
            case '[object Temporal.Duration]':
                return val.toString();
            default:
                break;
        }
        if (isNode(val) || isRelationship(val)) {
            return this.toNative(val.properties);
        }
        const out: Record<string, any> = {};
        Object.keys(val).forEach((key) => {
            out[key] = this.toNative(val[key]);
        });
        return out;
    }
}

function hasExactly(val: object, keys: string[]): boolean {
    const own = Object.keys(val);
    return own.length === keys.length && keys.every((it) => own.includes(it));
}

function isNode(val: object): val is { properties: object } {
    return hasExactly(val, ['id', 'labels', 'properties']);
}

function isRelationship(val: object): val is { properties: object } {
    return hasExactly(val, ['id', 'sourceId', 'destinationId', 'properties', 'relationshipType']);
}
