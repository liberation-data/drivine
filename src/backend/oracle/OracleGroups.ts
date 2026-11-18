import { GraphStatement } from '@/backend/GraphStatement';
import { jsonKey, OracleGraph, sameKey } from '@/backend/oracle/OracleGraph';
import { called, hinted } from '@/backend/oracle/OracleFragments';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { FragmentGroups } from '@/backend/sql/FragmentGroups';
import { heldKey } from '@/cypher/ValueLayout';

/**
 * A grouped read on Oracle (see FragmentGroups; drivine4j's `OracleSelect.groups`): a property key is the JSON value the
 * module gives; a sum or a mean adds a property where a number is stored, read by the name the layout holds it by. A
 * least or greatest value is read on the group's node that has it, joined back, its column that node's `nid`: the first
 * of the group by a window over each node's row before they are grouped, `FIRST_VALUE` and not `KEEP (DENSE_RANK FIRST
 * …)`, which ends Oracle's (23.26) server process ordered by a value of JSON (`ORA-03113`). Each node is joined back by
 * the keys Oracle keeps ({@link sameKey}), and the statement carries the hints its fragments ask for after its first
 * `SELECT`.
 */
export class OracleGroups extends FragmentGroups {
    protected readonly store = 'oracle' as const;

    protected views(): OracleViews {
        return new OracleViews(this.graph as OracleGraph);
    }

    /** The property where a number is stored, null otherwise, by the name the layout holds it by (`$$score`). */
    protected aggregated(views: OracleViews, property: string): string {
        return views.number(this.row, heldKey(property));
    }

    /**
     * The first of the group's `of` in the order `order`, of the rows that meet `kept`, by a window over the rows before
     * they are grouped: those that meet `kept` first, so the group's first is one of them where it has any, and null
     * where it has none.
     */
    protected first(of: string, order: string, kept: string): string {
        const first = this.window(
            `FIRST_VALUE(${of}) OVER (PARTITION BY ${this.grouping} ORDER BY CASE WHEN ${kept} THEN 0 ELSE 1 END, ${order})`
        );
        return `CASE WHEN COUNT(CASE WHEN ${kept} THEN 1 END) > 0 THEN MIN(${first}) END`;
    }

    /** A key is the module's JSON value of the property, given back as it is. */
    protected keyValue(column: string): string {
        return column;
    }

    protected idValue(property: string): string {
        return `JSON_QUERY(p.props, '$${jsonKey(heldKey(property))}' RETURNING JSON)`;
    }

    protected sameNode(a: string, b: string): string {
        return sameKey(a, b);
    }

    /** With the hints the statement's fragments ask for, and the stored functions they call (see OracleFragments). */
    protected made(text: string, bindings: Record<string, any>): GraphStatement {
        const made = called(hinted(text, this.fragments.hints), this.graph.name, this.fragments);
        return new GraphStatement(made.text, bindings, made.calls);
    }
}
