import { GraphStatement } from '@/backend/GraphStatement';
import { writeLayout } from '@/cypher/ValueLayout';
import { QuerySpecification } from '@/query/QuerySpecification';

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
        return super.spec<T>(more.id != null ? { ...more, id: writeLayout(more.id, 'oracle') } : more);
    }
}
