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

    /**
     * A number, whatever the aggregate: Postgres takes a value bound without a type as the type of what it is compared
     * with, and a count is a whole number, so `0.5` compared with one would be refused.
     */
    protected havingValue(parameter: string): string {
        return `CAST(${parameter} AS numeric)`;
    }
}
