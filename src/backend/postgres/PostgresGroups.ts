import { jsonValue, numberOf, PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { PostgresViews } from '@/backend/postgres/PostgresViews';
import { FragmentGroups } from '@/backend/sql/FragmentGroups';
import { heldKey } from '@/cypher/ValueLayout';

/**
 * A grouped read on Postgres (see FragmentGroups; drivine4j's `PostgresSelect.groups`): a property key held as the
 * `jsonb` value the module gives; a sum or a mean adds a property where a number is stored, read by the name the layout
 * holds it by. A least or greatest value is the group's column itself, the first of the group's values in Cypher's
 * order, and the node that has it is joined back only where the groups are ordered or filtered by it.
 */
export class PostgresGroups extends FragmentGroups {
    protected readonly store = 'postgres' as const;

    protected readonly givesValue = true;

    protected views(): PostgresViews {
        return new PostgresViews(this.graph as PostgresGraph);
    }

    /** The property where a number is stored, null otherwise, by the name the layout holds it by (`$$score`). */
    protected aggregated(_views: PostgresViews, property: string): string {
        return numberOf(this.row, heldKey(property));
    }

    protected first(of: string, order: string, kept: string): string {
        return `(array_agg(${of} ORDER BY ${order}) FILTER (WHERE ${kept}))[1]`;
    }

    protected keyValue(column: string): string {
        return column;
    }

    protected idValue(property: string): string {
        return jsonValue('p', heldKey(property));
    }

    /**
     * A number, whatever the aggregate: Postgres takes a value bound without a type as the type of what it is compared
     * with, and a count is a whole number, so `0.5` compared with one would be refused.
     */
    protected havingValue(parameter: string): string {
        return `CAST(${parameter} AS numeric)`;
    }
}
