import { jsonValue, path, SqliteGraph } from '@/backend/sqlite/SqliteGraph';
import { SqliteQueryRenderer } from '@/backend/sqlite/SqliteQueryRenderer';
import { SqliteViews } from '@/backend/sqlite/SqliteViews';
import { SqlGroups } from '@/backend/sql/SqlGroups';

/**
 * A grouped read on SQLite (see SqlGroups): a property key held as its JSON text, and ordered as the value it is, so a
 * number orders as a number and before any text, as `jsonb` orders on Postgres.
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

    protected keyOrder(column: string): string {
        return `(${column} ->> '$')`;
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
