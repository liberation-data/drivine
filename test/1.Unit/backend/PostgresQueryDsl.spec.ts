import {
    count,
    key,
    max,
    min,
    ModelRegistry,
    NodeFragment,
    NodeId,
    pathKey,
    PostgresBackend,
    sum,
    TargetModel
} from '@liberation-data/drivine';
import { GroupOperations } from '@/manager/GroupOperations';

@NodeFragment({ labels: ['Scored'] })
class Scored {
    @NodeId() id: string;
    name?: string;
    $score?: number;
}

@NodeFragment({ labels: ['Judge'] })
class Judge {
    @NodeId() code: string;
}

const registry = new ModelRegistry();
const scored: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Scored) };
const backend = new PostgresBackend();

/** The grouped read `spec` asks of Scored on Postgres, as the statement it is written as. */
async function grouped(spec: (q: any) => any): Promise<any> {
    const statements: any[] = [];
    const groups = new GroupOperations(
        registry,
        async (statement) => {
            statements.push(statement);
            return Promise.resolve([]);
        },
        undefined as any,
        backend
    );
    await groups.load(Scored, spec);
    return statements[0];
}

/**
 * The query DSL on Postgres as the shared module's fragments (drivine-cypher-spec#235, step 3), as on SQLite: the
 * Cypher the DSL writes for Neo4j, its filter and its seek each compiled whole over the row `n_`, and each order, group
 * key and aggregate the library writes a fragment named apart. A grouped read's least or greatest value is the group's
 * column, as drivine4j's PostgresSelect gives it. Pinned here as SQL; PostgresGroupsRun.spec runs them.
 */
describe("The query DSL on Postgres, as the module's fragments", () => {
    it('compiles the filter and the seek whole over n_, and reads a property whose name begins with $ as $$', () => {
        const query = backend.renderQuery(
            (q: any) => ({
                where: q.$score.gt(1),
                orderBy: [q.$score.desc(), q.id.asc()],
                seek: [q.$score.after(5), q.id.after('s1')]
            }),
            scored
        );
        expect(query.where).toContain(`(n_.props -> '$$score')`);
        expect(query.where).not.toContain(`'$score'`);
        expect(query.orderBy).toContain(`(n_.props -> '$$score')`);
        expect(Object.keys(query.bindings)).toEqual(['_cy__q0', '_cy__q1', '_cy__q2']);
        expect(query.labelsTested).toEqual([]);
        const statement = backend.loadAllFragments(scored.model as any, query.where, { orderBy: query.orderBy });
        expect(statement.text).toContain('FROM drivine_node n_\nWHERE ');
    });

    it("compares a property's equality over its JSON, the expression a range index is made over", () => {
        const query = backend.renderQuery((q: any) => ({ where: q.name.eq('Ada') }), scored);
        expect(query.where).toEqual(`(n_.props -> 'name') = CAST($_cy__q0 AS jsonb)`);
        expect(query.bindings).toEqual({ _cy__q0: '"Ada"' });
    });

    it("places an order's nulls by a term of whether it is null before it, its parameters named apart in each", () => {
        const query = backend.renderQuery((q: any) => ({ orderBy: [q.name.asc().nullsFirst(), q.id.desc()] }), scored);
        // The null term first, descending for nulls first, then the property's terms.
        expect(query.orderBy!.startsWith(`(COALESCE(jsonb_typeof((n_.props -> 'name')), 'null') = 'null') DESC`)).toBe(
            true
        );
        expect(query.bindings).toEqual({});
    });

    it('counts and deletes over n_, and reads a raw where over n as n_', () => {
        const where = backend.written("n.name = 'Ada'");
        expect(where).toEqual(`(n_.props ->> 'name') = 'Ada'`);
        expect(backend.countFragments(scored.model as any, where).text).toContain('FROM drivine_node n_\nWHERE ');
        expect(backend.deleteAll(scored, where).text).toContain('DELETE FROM drivine_node n_\nWHERE ');
        // A write's own reads keep the row `n`.
        expect(backend.heldProperties(scored.model as any).text).toContain('FROM drivine_node n\nWHERE ');
    });

    it("writes a patch's condition over n_, a value in the text of a quoted name left as it is", () => {
        const where = backend.renderWhere((q: any) => q.$score.eq(2), scored);
        const patch = backend.patchOne(scored.model as any, where.where);
        const parameters = patch.spec({ id: 's1', set: { name: 'x' }, vectors: {}, ...where.bindings, score: 9 })
            .parameters as any;
        const patchedIf: string = parameters._patchedIf;
        expect(patchedIf).toContain('FROM drivine_node n_ WHERE n_.nid = $1 AND (');
        expect(patchedIf).toContain(`'$$score'`);
        expect(patchedIf).not.toContain('$_cy__q0');
    });

    it('keys and adds a property whose name begins with $ as the layout holds it, $$', async () => {
        const statement = await grouped(() => ({
            keys: { score: key('$score') },
            aggregates: { total: sum('$score'), all: count() }
        }));
        expect(statement.text).toContain(`(n_.props -> '$$score') AS k0`);
        expect(statement.text).toContain(
            `SUM(CASE WHEN jsonb_typeof((n_.props -> '$$score')) = 'number' THEN (n_.props ->> '$$score')::numeric END)`
        );
        expect(statement.text).not.toContain(`'$score'`);
        // A property key is ordered through the group's node of least nid, joined back.
        expect(statement.text).toContain('MIN(n_.nid) AS k0r');
        expect(statement.text).toContain('LEFT JOIN drivine_node k0_ ON k0_.nid = g.k0r');
    });

    it("gives a least or greatest value as the group's column, its node joined back only to compare or order it", async () => {
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
        // The first of the group's values in Cypher's order, of those that have one and meet the filter.
        expect(text).toMatch(
            /\(array_agg\(\(n_\.props -> '\$\$score'\) ORDER BY .*\) FILTER \(WHERE .*\)\)\[1\] AS a0, /
        );
        expect(text).toMatch(
            /\(array_agg\(\(n_\.props -> '\$\$score'\) ORDER BY .* DESC\) FILTER \(WHERE .*\)\)\[1\] AS a1/
        );
        // The node that has the greatest, which the groups are filtered and ordered by, beside it; none for the least.
        expect(text).toMatch(/\(array_agg\(n_\.nid ORDER BY .* DESC\) FILTER \(WHERE .*\)\)\[1\] AS a1r/);
        expect(text).not.toContain('AS a0r');
        expect(text).not.toContain('a0_');
        expect(text).toContain('LEFT JOIN drivine_node a1_ ON a1_.nid = g.a1r');
        expect(text).toContain(`'a0', g.a0, 'a1', g.a1`);
        // The having of a held value is the module's condition over its node; a count's stays the group's.
        expect(text).toMatch(/\nWHERE .*a1_\.props.*\$_cy_f\d+_value/);
        expect(text).toContain('HAVING COUNT(*) >= CAST($_having1 AS numeric)');
        expect(text).toMatch(/\nORDER BY .*a1_\.props/);
        // The where and the aggregate's filter keep the renderer's names; the library's own fragments are named apart,
        // in the order they are written: the key (f1), each held value's presence, order and value (f2 to f7), the
        // having (f8).
        expect(Object.keys(statement.bindings).sort()).toEqual(['_cy__q0', '_cy__q1', '_cy_f8_value', '_having1']);
        expect(statement.bindings._cy_f8_value).toEqual('3');
    });

    it("orders a path key through its node, joined back, by the node's id as Cypher orders it", async () => {
        const statement = await grouped(() => ({
            keys: { judge: pathKey(Judge, [{ type: 'JUDGED_BY' }]) },
            aggregates: { all: count() }
        }));
        expect(statement.text).toContain('LEFT JOIN drivine_node k0_ ON k0_.nid = g.k0');
        expect(statement.text).toMatch(/\nORDER BY .*\(k0_\.props -> 'code'\)/);
    });

    it("reads a raw where over n as the row n_ a read of the DSL calls its root, in a grouped read's too", async () => {
        const statement = await grouped(() => ({
            where: "n.name = 'Ada'",
            keys: { name: key('name') },
            aggregates: { named: count('n.props IS NOT NULL') }
        }));
        expect(statement.text).toContain(`AND ((n_.props ->> 'name') = 'Ada'))`);
        expect(statement.text).toContain('SUM(CASE WHEN n_.props IS NOT NULL THEN 1 ELSE 0 END)');
    });
});
