import { GraphStatement } from '@/backend/GraphStatement';
import { carriesLabels } from '@/backend/oracle/OracleGraph';
import { hasId } from '@/backend/sql/NodeIds';
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
 * The one row `i.v` of the id bound as `sql`, the JSON text Oracle's layout holds it as (see oracleId), read `EXTENDED`
 * so a float is the binary double the node holds. The module's comparison reads the id more than once, and a dynamic
 * statement's binds are by position, so the id is bound once, here, and the comparison reads the row's `v`.
 */
export function boundIdRow(sql: string): string {
    return `(SELECT JSON(${sql} EXTENDED) v FROM dual)`;
}

/**
 * A row `i.v` for each id of the JSON array bound as `sql`, each the JSON Oracle's layout holds it as, read `EXTENDED`
 * as {@link boundIdRow} reads one. Not the module's `hasIdIn`: that reads each id's JSON text without `EXTENDED`, so a
 * float, held as a binary double, would be no id of the list.
 */
export function boundIdRows(sql: string): string {
    return `JSON_TABLE(JSON(${sql} EXTENDED), '$[*]' COLUMNS (v JSON PATH '$'))`;
}

/**
 * The hint each query that compares a node's id carries: a comparison reads several JSON values of the node's properties,
 * which Oracle 23's JSON table transformation reads by one `JSON_TABLE`, and so rewritten, a node's table beside another
 * table, or beside a subquery of one, lost the tests of its labels and properties (drivine-cypher-spec#415). The shared
 * module's statements carry it on Oracle for the same reason.
 */
export const NO_JSON_TABLE_TRANSFORM = '/*+ NO_JSON_TABLE_TRANSFORM */';

/**
 * Whether the node row `alias` is a node of `labels` whose id, the property `property`, is one of the ids `rows` holds
 * ({@link boundIdRow}, {@link boundIdRows}): each id finds its node `f` through the index over the id, compared as the
 * shared module writes the comparison (see NodeIds' hasId), and `alias` is the node found, by its `nid`. The `nid` is
 * handed back as `f.nid + 0`, the shared module's form of a node equality: Oracle 23.26 eliminates a join of the node
 * table to a view of it on a bare `nid`, the filter on the view with it, and then ends the server process as it parses a
 * statement given a bound value, or gives every row for a literal one (drivine-cypher-spec#160). The labels are told by
 * their text ({@link carriesLabels}), so Oracle reads the index over the id, and not every node of the first label.
 */
export function foundByIds(nodes: string, alias: string, property: string, labels: string[], rows: string): string {
    const tests = [hasId('oracle', 'f', property, 'i.v'), carriesLabels('f', labels)].filter((it) => it);
    return (
        `${alias}.nid IN (SELECT ${NO_JSON_TABLE_TRANSFORM} f.nid + 0 FROM ${rows} i CROSS JOIN ${nodes} f ` +
        `WHERE ${tests.join(' AND ')})`
    );
}

/**
 * Whether the id, the property `property`, of the node row `alias`, found some other way, is one of the ids `rows`
 * holds ({@link boundIdRows}), compared as the shared module writes the comparison (see NodeIds' hasId). The subquery
 * carries {@link NO_JSON_TABLE_TRANSFORM}, and so does the query that finds the node, beside which it reads the node's
 * properties.
 */
export function holdsIdAmong(alias: string, property: string, rows: string): string {
    return `EXISTS (SELECT ${NO_JSON_TABLE_TRANSFORM} 1 FROM ${rows} i WHERE ${hasId(
        'oracle',
        alias,
        property,
        'i.v'
    )})`;
}

/**
 * The match `find_node` and `write_node` run, `SELECT nid FROM nodes n WHERE <match>`, for the node of `labels` whose id,
 * the property `property`, is the dynamic statement's one bind, `:1`: the id bound once, in a row of its own
 * ({@link boundIdRow}), since the shared module's comparison reads it more than once (see foundByIds).
 */
export function idMatch(nodes: string, property: string, labels: string[]): string {
    return foundByIds(nodes, 'n', property, labels, boundIdRow(':1'));
}

/**
 * A statement that finds a node by `$id`, read `JSON($id EXTENDED)`, binding the id as the JSON text Oracle's layout
 * holds it as (see writeLayout), as a save writes it and finds the node: a float is extended JSON's double, as the node
 * holds a binary double, which a NUMBER bound as it is (`1e-7`) is not always equal to. drivine4j's NodeIds keys an id so.
 * A null id is bound as it is, and finds no node.
 */
export class IdKeyedStatement extends GraphStatement {
    static of(statement: GraphStatement): IdKeyedStatement {
        return new IdKeyedStatement(statement.text, statement.bindings, statement.calls);
    }

    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        return super.spec<T>(more.id != null ? { ...more, id: oracleId(more.id) } : more);
    }
}
