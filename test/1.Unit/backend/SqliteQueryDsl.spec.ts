import {
    count,
    key,
    max,
    min,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    PostgresBackend,
    SqliteBackend,
    sum,
    TargetModel
} from '@liberation-data/drivine';
import { QueryRenderer } from '@/dsl/QueryRenderer';
import { GroupOperations } from '@/manager/GroupOperations';

@NodeFragment({ labels: ['Scored'] })
class Scored {
    @NodeId() id: string;
    name?: string;
    $score?: number;
}

const registry = new ModelRegistry();
const scored: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Scored) };
const backend = new SqliteBackend();

/** The grouped read `spec` asks of Scored on `on`, as the statement it is written as. */
async function grouped(spec: (q: any) => any, on: SqliteBackend | PostgresBackend = backend): Promise<any> {
    const statements: any[] = [];
    const groups = new GroupOperations(
        registry,
        async (statement) => {
            statements.push(statement);
            return Promise.resolve([]);
        },
        undefined as any,
        on
    );
    await groups.load(Scored, spec);
    return statements[0];
}

/**
 * The query DSL on SQLite as the shared module's fragments (drivine-cypher-spec#235, step 2): the Cypher the DSL writes
 * for Neo4j, its filter and its seek each compiled whole over the row `n_`, and each order, group key and aggregate the
 * library writes a fragment named apart.
 */
describe("The query DSL on SQLite, as the module's fragments", () => {
    it('writes the parts of a query as the Cypher it writes for Neo4j, each with the values it binds', () => {
        const parts = QueryRenderer.parts(
            (q: any) => ({
                where: [q.name.eq('Ada'), q.$score.gt(1)],
                orderBy: [q.$score.desc(), q.id.asc()],
                seek: [q.$score.after(5), q.id.after('s1')]
            }),
            scored,
            NEO4J_GRAMMAR,
            'n'
        );
        expect(parts.filter).toEqual({
            cypher: 'n.name = $_q0 AND n.`$score` > $_q1',
            bindings: { _q0: 'Ada', _q1: 1 }
        });
        expect(parts.keyset).toEqual({
            cypher:
                'n.`$score` IS NOT NULL AND n.id IS NOT NULL AND n.`$score` <= $_q2 AND ' +
                '(n.`$score` < $_q2 OR (n.`$score` = $_q2 AND n.id > $_q3))',
            bindings: { _q2: 5, _q3: 's1' }
        });
        expect(parts.orders.map((it) => it.cypher)).toEqual(['n.`$score`', 'n.id']);
        // Rendered whole for a graph engine, as before.
        expect(
            QueryRenderer.render((q: any) => ({ where: q.name.eq('Ada') }), scored, NEO4J_GRAMMAR, 'n').where
        ).toEqual('n.name = $_q0');
    });

    it('compiles the filter and the seek whole over n_, and reads a property whose name begins with $ as $$', () => {
        const query = backend.renderQuery(
            (q: any) => ({
                where: q.$score.gt(1),
                orderBy: [q.$score.desc(), q.id.asc()],
                seek: [q.$score.after(5), q.id.after('s1')]
            }),
            scored
        );
        expect(query.where).toContain(`n_.props -> '$."$$score"'`);
        expect(query.where).not.toContain(`'$."$score"'`);
        expect(query.orderBy).toContain(`n_.props -> '$."$$score"'`);
        expect(Object.keys(query.bindings)).toEqual(['_cy__q0', '_cy__q1', '_cy__q2']);
        expect(query.labelsTested).toEqual([]);
        const statement = backend.loadAllFragments(scored.model as any, query.where, { orderBy: query.orderBy });
        expect(statement.text).toContain('FROM drivine_node n_\nWHERE ');
    });

    it("places an order's nulls by a term of whether it is null before it, its parameters named apart in each", () => {
        const query = backend.renderQuery((q: any) => ({ orderBy: [q.name.asc().nullsFirst(), q.id.desc()] }), scored);
        const terms = query.orderBy!;
        // The null term first, descending for nulls first, then the property's terms.
        expect(terms.startsWith(`(COALESCE(json_type((n_.props -> '$."name"')), 'null') = 'null') DESC`)).toBe(true);
        expect(query.bindings).toEqual({});
    });

    it('keys and adds a property whose name begins with $ as the layout holds it, $$', async () => {
        const statement = await grouped(() => ({
            keys: { score: key('$score') },
            aggregates: { total: sum('$score'), all: count() }
        }));
        expect(statement.text).toContain(`(n_.props -> '$."$$score"') AS k0`);
        expect(statement.text).toContain(
            `SUM((CASE WHEN json_type((n_.props -> '$."$$score"')) IN ('integer', 'real') THEN (n_.props -> '$."$$score"') ->> '$' END))`
        );
        expect(statement.text).not.toContain(`'$."$score"'`);
    });

    it('reads a least or greatest value through the node of the group that has it, and compares it there', async () => {
        const statement = await grouped((q: any) => ({
            where: q.name.eq('Ada'),
            keys: { name: key(q.name) },
            aggregates: { low: min(q.$score), high: max(q.$score, q.$score.lt(100)), all: count() },
            having: [
                ['high', 'gte', 3],
                ['all', 'gte', 1]
            ],
            orderBy: [['high', 'desc']]
        }));
        const text: string = statement.text;
        // Each is the nid of the group's first node in Cypher's order, of those that have the value and meet the filter.
        expect(text).toMatch(
            /\(json_group_array\(n_\.nid ORDER BY .* NULLS FIRST\) FILTER \(WHERE .*\)\) ->> '\$\[0\]' AS a1/
        );
        expect(text).toContain('LEFT JOIN drivine_node a0_ ON a0_.nid = g.a0');
        expect(text).toContain('LEFT JOIN drivine_node a1_ ON a1_.nid = g.a1');
        expect(text).toContain(`'a1', json((a1_.props -> '$."$$score"'))`);
        // The having of a held value is the module's condition over its node; a count's stays the group's.
        expect(text).toMatch(/\nWHERE .*a1_\.props.*\$_cy_f\d+_value/);
        expect(text).toContain('HAVING COUNT(*) >= $_having1');
        expect(text).toMatch(/\nORDER BY .*a1_\.props/);
        // The where and the aggregate's filter keep the renderer's names; the library's own fragments are named apart,
        // in the order they are written: the key (f1), each held value's presence and order (f2 to f5), the having (f6).
        expect(Object.keys(statement.bindings).sort()).toEqual(['_cy__q0', '_cy__q1', '_cy_f6_value', '_having1']);
        expect(statement.bindings._cy_f6_value).toEqual('3');
    });

    it("leaves Postgres's grouped read as it was: a least value as a number, no node joined back", async () => {
        const statement = await grouped(
            (q: any) => ({ keys: { name: key(q.name) }, aggregates: { high: max(q.$score) } }),
            new PostgresBackend()
        );
        expect(statement.text).not.toContain('LEFT JOIN');
        expect(statement.text).toContain('MAX(');
    });

    it("writes a patch's condition over n_, a value in the path of a property whose name begins with $ left as it is", () => {
        const where = backend.renderWhere((q: any) => q.$score.eq(2), scored);
        const patch = backend.patchOne(scored.model as any, where.where);
        const parameters = patch.spec({ id: 's1', set: { name: 'x' }, vectors: {}, ...where.bindings, score: 9 })
            .parameters as any;
        expect(parameters._patchedIf).toContain('FROM drivine_node n_ WHERE n_.nid = $1 AND (');
        expect(parameters._patchedIf).toContain(`'$."$$score"'`);
        expect(parameters._patchedIf).not.toContain('$_cy__q0');
    });

    it("reads a raw where over n as the row n_ a read of the DSL calls its root, in a grouped read's too", async () => {
        const statement = await grouped(() => ({
            where: "n.name = 'Ada'",
            keys: { name: key('name') },
            aggregates: { named: count('n.props IS NOT NULL') }
        }));
        expect(statement.text).toContain(`AND ((CASE json_type(n_.props, '$."name"')`);
        expect(statement.text).toContain('SUM(CASE WHEN n_.props IS NOT NULL THEN 1 ELSE 0 END)');
    });
});
