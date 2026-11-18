import { GraphStatement } from '@/backend/GraphStatement';
import { writeLayout } from '@/cypher/ValueLayout';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * A node's id as an Oracle statement binds it to find the node by: the JSON text Oracle's layout holds it as (see
 * writeLayout), and a null id as it is, which finds no node. Written, a null would be the JSON text 'null', which a
 * statement reads as JSON's null and finds a node whose id is held as null (#772).
 */
export function oracleId(id: unknown): unknown {
    return id != null ? writeLayout(id, 'oracle') : id;
}

/**
 * A statement that finds a node by `$id`, read `JSON($id EXTENDED)`, binding the id as the JSON text Oracle's layout
 * holds it as (see writeLayout), as a save writes it and finds the node: a float is extended JSON's double, as the node
 * holds a binary double, which a NUMBER bound as it is (`1e-7`) is not always equal to. drivine4j's NodeIds keys an id so.
 * A null id is bound as it is, and finds no node.
 */
export class IdKeyedStatement extends GraphStatement {
    static of(statement: GraphStatement): IdKeyedStatement {
        return new IdKeyedStatement(statement.text, statement.bindings);
    }

    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        return super.spec<T>(more.id != null ? { ...more, id: oracleId(more.id) } : more);
    }
}
