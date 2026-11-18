import { path, SqliteGraph } from '@/backend/sqlite/SqliteGraph';
import { DSL_ROW, SqliteQueryRenderer } from '@/backend/sqlite/SqliteQueryRenderer';
import { SqliteViews } from '@/backend/sqlite/SqliteViews';
import { COMPARISONS, HeldAggregate, SqlGroups } from '@/backend/sql/SqlGroups';
import { quoteName } from '@/backend/Cypher';
import { FragmentVariable } from '@/cypher/SharedCypherCompiler';
import { SqlFragments } from '@/cypher/SqlFragments';
import { GroupAggregate, GroupQuery } from '@/manager/Groups';
import { FragmentModel } from '@/model/FragmentModel';
import { GraphStatement } from '@/backend/GraphStatement';

/**
 * A grouped read on SQLite (see SqlGroups), its values the shared module's (drivine-cypher-spec#235, its fragments;
 * drivine4j's `SqliteSelect.groups`): a filter is the module's SQL for the Cypher the DSL writes, over the row `n_`; a
 * property key is the property's value as the store holds it, so values Cypher tells apart are grouped apart; a sum or
 * a mean adds that value where it is a number. A least or greatest value is a node of the group that has it, the first
 * in Cypher's order of those that have one, joined back: the value is given, compared by a `having` and ordered there
 * as Cypher does, whatever its kind, a date included. A key is ordered as Cypher orders it, through a node of the group
 * that has its value, joined back so too.
 */
export class SqliteGroups extends SqlGroups {
    protected readonly row = DSL_ROW;

    /** The statement's fragments: one statement is built by one SqliteGroups. */
    private readonly fragments = new SqlFragments('sqlite', { name: (this.graph as SqliteGraph).name });

    /** The source's labels, which the statement tests its row for. */
    private labels: string[] = [];

    build(source: FragmentModel, given: GroupQuery<any, any>, pathTargets: Map<string, FragmentModel>): GraphStatement {
        this.labels = [...source.labels];
        const statement = super.build(source, given, pathTargets);
        return new GraphStatement(statement.text, { ...statement.bindings, ...this.fragments.parameters });
    }

    protected views(): SqliteViews {
        return new SqliteViews(this.graph as SqliteGraph);
    }

    protected renderer(): SqliteQueryRenderer {
        return new SqliteQueryRenderer(this.fragments, this.row, this.labels);
    }

    /** The property's value as the store holds it, as its JSON: the module's value of it. */
    protected keyColumn(property: string): string {
        return this.fragments.value(this.node(this.row), cypherOf(property));
    }

    /** The property's value as the store holds it (see keyColumn), where it is a number; null otherwise. */
    protected aggregated(_views: SqliteViews, property: string): string {
        const value = this.fragments.value(this.node(this.row), cypherOf(property));
        return `(CASE WHEN json_type(${value}) IN ('integer', 'real') THEN ${value} ->> '$' END)`;
    }

    /**
     * A least or greatest value, read through the group's first node in Cypher's order by the property, of those that
     * have it and meet the aggregate's filter, as drivine4j's SQLite reads one.
     */
    protected held(aggregate: GroupAggregate): HeldAggregate | undefined {
        if (aggregate.function !== 'MIN' && aggregate.function !== 'MAX') {
            return undefined;
        }
        const property = cypherOf(aggregate.property as string);
        const descending = aggregate.function === 'MAX';
        return {
            column: (filter) => {
                const present = this.fragments.condition(this.node(this.row), `${property} IS NOT NULL`);
                const order = this.fragments.order(this.node(this.row), property, descending).join(', ');
                const kept = [present, ...(filter ? [`(${filter})`] : [])].join(' AND ');
                return `(json_group_array(${this.row}.nid ORDER BY ${order}) FILTER (WHERE ${kept})) ->> '$[0]'`;
            },
            value: (holder) => this.fragments.value(this.node(holder), property),
            having: (holder, comparison, value) =>
                this.fragments.condition(
                    this.node(holder),
                    (name) => `${property} ${COMPARISONS[comparison as keyof typeof COMPARISONS]} ${name('value')}`,
                    { value }
                ),
            order: (holder, direction) => this.fragments.order(this.node(holder), property, direction === 'DESC')
        };
    }

    protected keyValue(column: string): string {
        return column;
    }

    /**
     * A key is ordered as Cypher orders it, whatever its kind, a date included: read through the group's node of least
     * `nid`, which has the key's value, as drivine4j's SQLite reads it.
     */
    protected heldKey(property: string): (holder: string, direction: 'ASC' | 'DESC') => string[] {
        return (holder, direction) =>
            this.fragments.ordered(this.node(holder), cypherOf(property), direction === 'DESC');
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

    /** The node row `row`, as the variable `n` of a fragment, of the source's labels. */
    private node(row: string): Record<string, FragmentVariable> {
        return { n: { node: row, labels: this.labels } };
    }
}

/** The property of `n`, as Cypher reads it by its stored name. */
function cypherOf(property: string): string {
    return `n.${quoteName(property)}`;
}
