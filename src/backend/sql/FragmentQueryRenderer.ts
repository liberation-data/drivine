import { NEO4J_GRAMMAR } from '@/backend/CypherGrammar';
import { ConditionWriter } from '@/backend/GroupStatement';
import { FragmentVariable } from '@/cypher/SharedCypherCompiler';
import { SqlFragments } from '@/cypher/SqlFragments';
import { Scope, scopeOf } from '@/dsl/ModelScope';
import { rootRefs } from '@/dsl/QueryRefs';
import { QueryRenderer, RenderedQuery } from '@/dsl/QueryRenderer';
import { allOfOne, Condition, QueryFn, WhereFn } from '@/dsl/Refs';
import { TargetModel } from '@/model/RelationshipModel';

/** What the query DSL's Cypher calls the root: the variable its fragments name the root's row by. */
const ROOT = 'n';

/**
 * What a read of the query DSL calls its root's row: a load, a count, a delete, a patch's condition, a grouped read and a
 * search. It ends with `_`, as the shared module asks of a row its fragments read.
 */
export const DSL_ROW = 'n_';

/**
 * Writes a query of the DSL on a SQL store as the shared module compiles it (drivine-cypher-spec#235, its fragments;
 * drivine4j's `SqlitePredicates`, `PostgresPredicates` and `OraclePredicates`): the Cypher the DSL writes for Neo4j
 * (QueryRenderer), its filter and its seek each compiled whole as
 * one condition over the root's row, their parameters by the renderer's names (`$_q0`, bound as `_cy__q0`), and each of
 * its orders as the terms the module sorts it by, named apart (`$f1__q0`), a null placed by a term of its own before it.
 * So a value is compared and ordered as Cypher compares and orders it, whatever its kind, a date included (#771), and a
 * property whose name begins with `$` is read as the layout holds it. The root's row ends with `_`, as the module asks of
 * a row of the library's own SQL.
 */
export class FragmentQueryRenderer implements ConditionWriter {
    /** The Cypher of the conditions written so far, as the DSL writes them for Neo4j, its values numbered on. */
    private readonly cypher = new QueryRenderer(NEO4J_GRAMMAR);

    /**
     * The query `fn` makes of the model's references, over the root's row `row`, as the statement's `fragments` compile
     * it, which hold what it binds, and on Oracle the hints and the stored functions it asks for. Its `labelsTested` are
     * the root's labels the module says its filter implies (`impliedLabels`, drivine-cypher-spec#373), which the
     * statement then doesn't test again.
     */
    static render<T>(fragments: SqlFragments, fn: QueryFn<T>, model: TargetModel, row: string): RenderedQuery {
        const root = rootRow(row, model);
        const variables = { [ROOT]: root };
        const parts = QueryRenderer.parts(fn, model, NEO4J_GRAMMAR, ROOT);
        const where = [parts.filter, parts.keyset]
            .filter((it) => it !== undefined)
            .map((it) => fragments.wholeImplying(variables, it!.cypher, it!.bindings));
        const orders = parts.orders.flatMap((it) =>
            fragments.ordered(variables, it.cypher, it.term.direction === 'DESC', it.term.nulls, it.bindings)
        );
        // The conditions are joined by AND, so a label any of them implies, every row the query keeps carries.
        const implied = new Set(where.flatMap((it) => it.impliedLabels[ROOT] ?? []));
        return {
            ...parts.rendered,
            where: where.map((it) => it.term).join(' AND ') || undefined,
            orderBy: orders.length ? orders.join(', ') : undefined,
            bindings: fragments.parameters,
            labelsTested: root.labels.filter((it) => implied.has(it))
        };
    }

    /** The condition `fn` makes of the model's references, over the root's row `row`, as the statement's `fragments` compile it. */
    static renderWhere<T>(
        fragments: SqlFragments,
        fn: WhereFn<T>,
        model: TargetModel,
        row: string
    ): { where: string; bindings: Record<string, any> } {
        const renderer = new FragmentQueryRenderer(fragments, row, rootRow(row, model).labels);
        const scope = scopeOf(model);
        const where = renderer.where(allOfOne(fn(rootRefs<T>(scope))), scope);
        return { where, bindings: renderer.boundValues };
    }

    /**
     * @param fragments the statement's fragments, which name apart the parameters of those the library writes itself
     * @param row the root's row in the statement
     * @param labels the root's labels, which the statement tests, so an equality of its property is answered by its index
     */
    constructor(
        readonly fragments: SqlFragments,
        private readonly row: string,
        private readonly labels: string[]
    ) {}

    /** What the conditions and the fragments written so far bind, by the names the module gives them. */
    get boundValues(): Record<string, any> {
        return { ...this.fragments.parameters };
    }

    /**
     * The condition, made in `scope`, over the root's row: its Cypher compiled whole, its parameters by the renderer's
     * names, numbered on from the conditions written before.
     */
    where(condition: Condition, scope: Scope): string {
        const written = this.cypher.bound(() => this.cypher.where(condition, scope, ROOT));
        return this.fragments.whole(
            { [ROOT]: { node: this.row, labels: this.labels } },
            written.cypher,
            written.bindings
        );
    }
}

/** The root's row, as a variable of a fragment, with the labels the statement tests it for. */
function rootRow(row: string, model: TargetModel): FragmentVariable & { node: string; labels: string[] } {
    const root = model.kind === 'GRAPH_VIEW' ? model.model.root : model.model;
    return { node: row, labels: [...root.labels] };
}
