import {
    Direction,
    GraphBackend,
    GraphPath,
    GraphView,
    hop,
    ModelRegistry,
    NodeFragment,
    NodeId,
    OracleBackend,
    OracleGraph,
    PostgresBackend,
    PostgresGraph,
    Root,
    SqliteBackend,
    SqliteGraph,
    TargetModel
} from '@liberation-data/drivine';
import { SqlFragments } from '@/cypher/SqlFragments';
import { SharedStore } from '@/cypher/SharedCypherCompiler';

@NodeFragment({ labels: ['PathOrderActor'] })
class Actor {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['PathOrderDirector'] })
class Director {
    @NodeId() id: string;
}

@GraphView()
class DirectorsByRelease {
    @Root() actor: Actor;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'released'), hop('DIRECTED_BY')], {
        target: () => Director
    })
    directors: Director[];
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'released', false), hop('DIRECTED_BY')], {
        target: () => Director
    })
    latest?: Director;
}

const STORES: [SharedStore, () => GraphBackend][] = [
    ['sqlite', () => new SqliteBackend(new SqliteGraph())],
    ['postgres', () => new PostgresBackend(new PostgresGraph())],
    ['oracle', () => new OracleBackend(new OracleGraph())]
];

/** The module's order of a hop node `ROW_` by `released`, as a path reads it: descending where `descending`, no value last. */
function moduleOrder(store: SharedStore, descending: boolean): string {
    return new SqlFragments(store, { name: 'drivine' })
        .ordered({ n: { node: 'ROW_', labels: [] } }, 'n.`released`', descending, 'LAST')
        .join(', ');
}

/**
 * A view's path ordered by a hop's property is ordered by the shared module's order fragments over the hop's node, as
 * drivine4j's `pathOrder` orders it (#788), and not by the library's own SQL of kind, then number, then text, which
 * sorted a date by its tag's text and kinds out of Cypher's order.
 */
describe.each(STORES)("A view's path ordered by a hop on %s", (store, backendOf) => {
    const model = new ModelRegistry().view(DirectorsByRelease);
    const statement = backendOf().loadView(model);
    // Each row the module's terms read, a hop node joined back or a way, as `ROW_`.
    const text = statement.text.replace(/\b[kswr]\d+_\./g, 'ROW_.');

    it("orders the nodes reached by the module's terms over the hop node each keeps, then by id", () => {
        expect(text).toContain(`ORDER BY ${moduleOrder(store, false)}, x`);
        expect(text).toContain(`ORDER BY ${moduleOrder(store, true)}, x`);
    });

    it("keeps for each node reached its first hop node in the module's order", () => {
        const first =
            store === 'sqlite'
                ? `json_group_array(ROW_.nid ORDER BY ${moduleOrder(store, false)}) ->> '$[0]' AS hop`
                : store === 'postgres'
                ? `(array_agg(ROW_.nid ORDER BY ${moduleOrder(store, false)}))[1] AS hop`
                : `FIRST_VALUE(ROW_.hop) OVER (PARTITION BY ROW_.nid ORDER BY ${moduleOrder(store, false)}) AS hop`;
        expect(text).toContain(first);
    });

    it("reads the property neither as a number and a text of the library's own, nor by its kind", () => {
        expect(statement.text).not.toMatch(/order_kind|order_number|order_text/);
    });

    it("orders a view's path the same way in a search whose root is the view", () => {
        const target: TargetModel = { kind: 'GRAPH_VIEW', model };
        const search = { label: 'PathOrderActor', property: 'embedding', similarity: 'COSINE' as const, k: 5 };
        const found = backendOf().nearest(target, search);
        const searched = found.text.replace(/\b[kswr]\d+_\./g, 'ROW_.');
        expect(searched).toContain(`ORDER BY ${moduleOrder(store, false)}, x`);
        expect(searched).toContain(`ORDER BY ${moduleOrder(store, true)}, x`);
        if (store === 'oracle') {
            expect(found.text).toMatch(/^SELECT \/\*\+ NO_JSON_TABLE_TRANSFORM \*\/ JSON_OBJECT\('value'/);
        }
    });

    if (store === 'oracle') {
        it("carries a filter's hints and calls beside the view's, once each, on its outermost SELECT", () => {
            const where = '/*drivine:hint NO_JSON_TABLE_TRANSFORM*//*drivine:hint OTHER*//*drivine:calls era*/1 = 1';
            const filtered = backendOf().loadAllViews(model, where);
            expect(filtered.text).toMatch(/^SELECT \/\*\+ NO_JSON_TABLE_TRANSFORM OTHER \*\/ JSON_OBJECT/);
            expect(filtered.text).not.toContain('/*drivine:');
            expect(filtered.calls).toEqual(expect.objectContaining({ era: true }));
        });

        it('carries the hints the fragments ask for on its outermost SELECT, and joins the hop node back by its keys', () => {
            expect(statement.text).toMatch(/^SELECT \/\*\+ NO_JSON_TABLE_TRANSFORM \*\/ JSON_OBJECT/);
            expect(statement.text).toMatch(
                /JOIN drivine_node (k\d+_) ON \(\1\.nid = (o\d+)\.hop \+ 0 AND \2\.hop = \1\.nid \+ 0\)/
            );
        });
    }
});
