import { quoteName } from '@/backend/Cypher';
import { GraphStatement } from '@/backend/GraphStatement';
import { DSL_ROW, FragmentQueryRenderer } from '@/backend/sql/FragmentQueryRenderer';
import { COMPARISONS, HeldAggregate, SqlGroups } from '@/backend/sql/SqlGroups';
import { FragmentVariable, SharedStore } from '@/cypher/SharedCypherCompiler';
import { SqlFragments } from '@/cypher/SqlFragments';
import { GroupAggregate, GroupQuery } from '@/manager/Groups';
import { FragmentModel } from '@/model/FragmentModel';

/**
 * A grouped read whose values are the shared module's (drivine-cypher-spec#235, its fragments; drivine4j's
 * `SqliteSelect.groups` and `PostgresSelect.groups`), on SQLite and Postgres: a filter is the module's SQL for the
 * Cypher the DSL writes, over the row `n_`; a property key is the property's value as the store holds it, so values
 * Cypher tells apart are grouped apart. A least or greatest value is the first of the group's nodes in Cypher's order of
 * those that have one, joined back to be compared by a `having` and ordered there as Cypher does, whatever its kind, a
 * date included. A key is ordered as Cypher orders it, through a node of the group that has its value, joined back so
 * too. What is each store's own is how it takes the first of a group's values in an order, and adds a number.
 */
export abstract class FragmentGroups extends SqlGroups {
    protected readonly row = DSL_ROW;

    /**
     * Whether a least or greatest value is the group's column itself, as drivine4j's Postgres gives it, its node joined
     * back only where the groups are ordered or filtered by it; or read on its node, as drivine4j's SQLite reads it.
     */
    protected readonly givesValue: boolean = false;

    /** The statement's fragments, made afresh for each statement built. */
    protected fragments!: SqlFragments;

    /** The source's labels, which the statement tests its row for. */
    private labels: string[] = [];

    /** The store whose module's fragments the statement's values are. */
    protected abstract readonly store: SharedStore;

    build(source: FragmentModel, given: GroupQuery<any, any>, pathTargets: Map<string, FragmentModel>): GraphStatement {
        this.fragments = new SqlFragments(this.store, { name: this.graph.name });
        this.labels = [...source.labels];
        const statement = super.build(source, given, pathTargets);
        return new GraphStatement(statement.text, { ...statement.bindings, ...this.fragments.parameters });
    }

    protected renderer(): FragmentQueryRenderer {
        return new FragmentQueryRenderer(this.fragments, this.row, this.labels);
    }

    /** The property's value as the store holds it, as its JSON: the module's value of it. */
    protected keyColumn(property: string): string {
        return this.fragments.value(this.node(this.row), cypherOf(property));
    }

    /**
     * A least or greatest value, of the group's first node in Cypher's order by the property, of those that have it and
     * meet the aggregate's filter, as drivine4j reads one: compared and ordered on that node, joined back.
     */
    protected held(aggregate: GroupAggregate): HeldAggregate | undefined {
        if (aggregate.function !== 'MIN' && aggregate.function !== 'MAX') {
            return undefined;
        }
        const property = cypherOf(aggregate.property as string);
        const descending = aggregate.function === 'MAX';
        // The order and the condition the first is taken by, compiled once for the node's `nid` and its value.
        let taken: { order: string; kept: string } | undefined;
        const first = (filter?: string): { order: string; kept: string } => {
            if (!taken) {
                const present = this.fragments.condition(this.node(this.row), `${property} IS NOT NULL`);
                const order = this.fragments.order(this.node(this.row), property, descending).join(', ');
                taken = { order, kept: [present, ...(filter ? [`(${filter})`] : [])].join(' AND ') };
            }
            return taken;
        };
        const given = (filter?: string): string => {
            const { order, kept }: { order: string; kept: string } = first(filter);
            return this.first(this.fragments.value(this.node(this.row), property), order, kept);
        };
        return {
            column: (filter) => {
                const { order, kept }: { order: string; kept: string } = first(filter);
                return this.first(`${this.row}.nid`, order, kept);
            },
            ...(this.givesValue ? { given } : {}),
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

    /**
     * A key is ordered as Cypher orders it, whatever its kind, a date included: read through the group's node of least
     * `nid`, which has the key's value, as drivine4j reads it.
     */
    protected heldKey(property: string): (holder: string, direction: 'ASC' | 'DESC') => string[] {
        return (holder, direction) =>
            this.fragments.ordered(this.node(holder), cypherOf(property), direction === 'DESC');
    }

    /**
     * A path key is ordered as Cypher orders its node's id, whatever its kind, a date included: read on the node, joined
     * back, as drivine4j reads it.
     */
    protected heldPath(target: FragmentModel): (holder: string, direction: 'ASC' | 'DESC') => string[] {
        return (holder, direction) =>
            this.fragments.ordered(
                { n: { node: holder, labels: [...target.labels] } },
                cypherOf(target.nodeIdProperty!),
                direction === 'DESC'
            );
    }

    /** The node row `row`, as the variable `n` of a fragment, of the source's labels. */
    protected node(row: string): Record<string, FragmentVariable> {
        return { n: { node: row, labels: this.labels } };
    }

    /** The first of the group's `of`, in the order `order`, of the rows that meet `kept`: null for none. */
    protected abstract first(of: string, order: string, kept: string): string;
}

/** The property of `n`, as Cypher reads it by its stored name. */
export function cypherOf(property: string): string {
    return `n.${quoteName(property)}`;
}
