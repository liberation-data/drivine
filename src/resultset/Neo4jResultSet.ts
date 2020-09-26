import { ResultSet } from './ResultSet';
import { Cacheable } from 'typescript-cacheable';

export class Neo4jResultSet implements ResultSet {

    constructor(readonly records: any) {
    }

    @Cacheable()
    columnNames(): string[] {
        return this.records.length ? this.records[0].keys : [];
    }

    itemAtColumnIndex(record: any, index: number): any {
        return record.get(index);
    }

    itemWithColumnName(record: any, name: string): any {
        return record.get(record.keys.indexOf(name));
    }

    length(): number {
        return this.records.length;
    }

    recordAtRow(index: number): any {
        return this.records[index];
    }

}


