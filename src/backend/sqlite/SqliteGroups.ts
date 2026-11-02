import { jsonValue, path, SqliteGraph } from '@/backend/sqlite/SqliteGraph';
import { SqliteQueryRenderer } from '@/backend/sqlite/SqliteQueryRenderer';
import { SqliteViews } from '@/backend/sqlite/SqliteViews';
import { SqlGroups } from '@/backend/sql/SqlGroups';

/**
 * A grouped read on SQLite (see SqlGroups): a property key held as its JSON text, and ordered as `jsonb` orders on
 * Postgres: a text before a number, each as the value it is, and a node with no value last ascending.
 */
export class SqliteGroups extends SqlGroups {
    protected views(): SqliteViews {
        return new SqliteViews(this.graph as SqliteGraph);
    }

    protected renderer(views: SqliteViews): SqliteQueryRenderer {
        return new SqliteQueryRenderer(views);
    }

    protected keyColumn(property: string): string {
        return jsonValue('n', property);
    }

    protected keyValue(column: string): string {
        return column;
    }

    /**
     * A key orders by the kind of its JSON first, as `jsonb` orders on Postgres: a text before a number, a number
     * before a boolean. Then by its value, as the SQL value it is.
     */
    protected keyOrder(column: string): string[] {
        return [
            `CASE json_type(${column}) WHEN 'null' THEN 0 WHEN 'text' THEN 1 WHEN 'integer' THEN 2 WHEN 'real' THEN 2 ` +
                `WHEN 'false' THEN 3 WHEN 'true' THEN 3 WHEN 'array' THEN 4 WHEN 'object' THEN 5 END`,
            `(${column} ->> '$')`
        ];
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
