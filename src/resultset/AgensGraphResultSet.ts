import { ResultSet } from '@/resultset/ResultSet';
import { Cacheable } from 'typescript-cacheable';

export class AgensGraphResultSet implements ResultSet {

    constructor(readonly records: any) {
    }

    @Cacheable()
    columnNames(): string[] {
        return this.records.length ? Object.keys(this.records[0]) : [];
    }

    itemAtColumnIndex(record: any, index: number): any {
        return record[this.columnNames()[index]];
    }

    itemWithColumnName(record: any, name: string): any {
        return record[name];
    }

    length(): number {
        return this.records.length;
    }

    recordAtRow(index: number): any {
        return this.records[index];
    }

}


