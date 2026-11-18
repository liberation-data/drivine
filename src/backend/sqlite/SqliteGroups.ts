import { path, SqliteGraph } from '@/backend/sqlite/SqliteGraph';
import { SqliteViews } from '@/backend/sqlite/SqliteViews';
import { cypherOf, FragmentGroups } from '@/backend/sql/FragmentGroups';

/**
 * A grouped read on SQLite (see FragmentGroups; drivine4j's `SqliteSelect.groups`): a sum or a mean adds a property's
 * value as the store holds it where it is a number. A least or greatest value is read on the group's node that has it,
 * joined back: its column is that node's `nid`.
 */
export class SqliteGroups extends FragmentGroups {
    protected readonly store = 'sqlite' as const;

    protected views(): SqliteViews {
        return new SqliteViews(this.graph as SqliteGraph);
    }

    /** The property's value as the store holds it (see keyColumn), where it is a number; null otherwise. */
    protected aggregated(_views: SqliteViews, property: string): string {
        const value = this.fragments.value(this.node(this.row), cypherOf(property));
        return `(CASE WHEN json_type(${value}) IN ('integer', 'real') THEN ${value} ->> '$' END)`;
    }

    protected first(of: string, order: string, kept: string): string {
        return `(json_group_array(${of} ORDER BY ${order}) FILTER (WHERE ${kept})) ->> '$[0]'`;
    }

    protected keyValue(column: string): string {
        return column;
    }

    /** A null last ascending and first descending, as Postgres places it: SQLite would place it first ascending. */
    protected orderTerm(expression: string, direction: 'ASC' | 'DESC'): string {
        return `${expression} ${direction} NULLS ${direction === 'ASC' ? 'LAST' : 'FIRST'}`;
    }

    protected idValue(property: string): string {
        return `(p.props ->> ${path(property)})`;
    }

    protected paging(skip?: number, limit?: number): string[] {
        return skip !== undefined || limit !== undefined
            ? [`LIMIT ${limit ?? -1}${skip !== undefined ? ` OFFSET ${skip}` : ''}`]
            : [];
    }
}
