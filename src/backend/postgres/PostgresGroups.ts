import { jsonValue, PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { PostgresQueryRenderer } from '@/backend/postgres/PostgresQueryRenderer';
import { PostgresViews } from '@/backend/postgres/PostgresViews';
import { SqlGroups } from '@/backend/sql/SqlGroups';

/** A grouped read on Postgres (see SqlGroups): a property key held as its `jsonb` value. */
export class PostgresGroups extends SqlGroups {
    protected views(): PostgresViews {
        return new PostgresViews(this.graph as PostgresGraph);
    }

    protected renderer(views: PostgresViews): PostgresQueryRenderer {
        return new PostgresQueryRenderer(views);
    }

    protected keyColumn(property: string): string {
        return jsonValue('n', property);
    }

    protected keyValue(column: string): string {
        return column;
    }

    protected idValue(property: string): string {
        return jsonValue('p', property);
    }
}
