import { GraphStatement } from '@/backend/GraphStatement';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * A statement of the Postgres backend. Postgres gives a row as a record of its columns, which the plain SQL a
 * Postgres persistence manager runs reads as it is; the object manager reads a row of one column as that column's value,
 * as a record of one column is on the graph engines and on Oracle. So this statement's rows are read so.
 */
export class PostgresStatement extends GraphStatement {
    /** The statement, its rows read as a Postgres backend's are. */
    static of(statement: GraphStatement): PostgresStatement {
        return new PostgresStatement(statement.text, statement.bindings);
    }

    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        return super.spec<T>(more).map(columnValue);
    }
}

/**
 * A row of one column as that column's value, as the graph engines and Oracle give a record of one column: Postgres
 * gives a row as a record of its columns.
 */
export function columnValue(row: any): any {
    const keys = row !== null && typeof row === 'object' ? Object.keys(row) : [];
    return keys.length === 1 ? row[keys[0]] : row;
}
