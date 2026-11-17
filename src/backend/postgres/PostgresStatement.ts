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

    /** @param idKey what the id given as `$id` is bound as: see keyingId. Unset, it is bound as it is given. */
    constructor(
        text: string,
        bindings: Record<string, any> = {},
        private readonly idKey?: (id: unknown) => string
    ) {
        super(text, bindings);
    }

    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        const given = this.idKey && more.id != null ? { ...more, id: this.idKey(more.id) } : more;
        return super.spec<T>(given).map(columnValue);
    }

    /**
     * This statement, which finds a node by the id bound as `$id`, binding the id it is given as `key` writes it: the text
     * the store reads the node's id back as (see storedKey), so a float id is found by the text it is held as, not by the
     * text the driver writes the number as (`1e-7`). A null id is bound as it is, and finds no node.
     */
    keyingId(key: (id: unknown) => string): PostgresStatement {
        return new PostgresStatement(this.text, this.bindings, key);
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
