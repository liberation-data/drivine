export interface ResultSet {

    records: any[];

    length(): number;

    recordAtRow(index: number): any;

    columnNames(): string[];

    itemAtColumnIndex(record: any, index: number): any;

    itemWithColumnName(record: any, name: string): any;

}
