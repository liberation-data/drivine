import { ResultSet } from '@/resultset/ResultSet';

export class RedisGraphResultSet implements ResultSet {

    constructor(readonly cols: string[], readonly records: any[], readonly summaries: string[]) {
    }

    columnNames(): string[] {
        return this.cols;
    }

    itemAtColumnIndex(record: any, index: number): any {
        return record[index];
    }

    itemWithColumnName(record: any, name: string): any {
        return record[this.cols.indexOf(name)];
    }

    length(): number {
        return this.records.length;
    }

    recordAtRow(index: number): any {
        return this.records[index];
    }

}
