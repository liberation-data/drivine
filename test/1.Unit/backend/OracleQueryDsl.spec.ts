import {
    anyOf,
    CascadeType,
    count,
    GraphView,
    key,
    max,
    min,
    ModelRegistry,
    NodeFragment,
    NodeId,
    OracleBackend,
    OracleGraph,
    pathKey,
    Root,
    sum,
    TargetModel,
    times
} from '@liberation-data/drivine';
import { called, hinted, noted } from '@/backend/oracle/OracleFragments';
import { Account, LocationHierarchy } from '../golden/GoldenModels';
import { loweredQuery } from '@/dsl/LowerCopyLookups';
import { sameKey } from '@/backend/oracle/OracleGraph';
import { OracleSpecCompiler } from '@/connection/oracle/OracleSpecCompiler';
import { SqlFragments } from '@/cypher/SqlFragments';
import { GroupOperations } from '@/manager/GroupOperations';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ConstraintManager } from '@/schema/ConstraintManager';
import { IndexManager } from '@/schema/IndexManager';
import { rangeIndex, uniquenessConstraint } from '@/schema/SchemaSpecs';
import { planningOn } from '../schema/Planning';

@NodeFragment({ labels: ['Scored'] })
class Scored {
    @NodeId() id: string;
    name?: string;
    $score?: number;
    meta?: Record<string, any>;
}

@GraphView()
class ScoredView {
    @Root() scored: Scored;
}

@NodeFragment({ labels: ['Judge'] })
class Judge {
    @NodeId() code: string;
}

const registry = new ModelRegistry();
const scored: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Scored) };
const view: TargetModel = { kind: 'GRAPH_VIEW', model: registry.view(ScoredView) };
const hierarchy: TargetModel = { kind: 'GRAPH_VIEW', model: registry.view(LocationHierarchy) };
const backend = new OracleBackend(new OracleGraph());

/** The hint the module's fragments on Oracle ask the statement they are in to carry. */
const HINT = '/*+ NO_JSON_TABLE_TRANSFORM */';

/** The grouped read `spec` asks of Scored on Oracle, as the statement it is written as. */
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

/** Every `$name` a statement's text names as a parameter: not within a quoted text, as a JSON path's `'$.x'` is. */
const named = (text: string): string[] =>
    [...text.replace(/'(?:[^']|'')*'/g, "''").matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)].map((it) => it[1]);

/**
 * The query DSL on Oracle as the shared module's fragments (drivine-cypher-spec#235, step 4), as on SQLite and Postgres:
 * the Cypher the DSL writes for Neo4j, its filter and its seek each compiled whole over the row `n_`, each order, group key
 * and aggregate the library writes a fragment named apart; with what Oracle's fragments ask of the statement written in,
 * drivine4j's OracleSelect: their hints after its first SELECT or DELETE, a node joined back by the keys Oracle keeps, the
 * index-key binds beside the values', and the stored functions they call said. Pinned here as SQL; OracleGroupsRun.spec
 * and the manager's specs run them.
 */
describe("The query DSL on Oracle, as the module's fragments", () => {
    it('compiles the filter and the seek whole over n_, and reads a property whose name begins with $ as $$', () => {
        const query = backend.renderQuery(
            (q: any) => ({
                where: q.$score.gt(1),
                orderBy: [q.$score.desc(), q.id.asc()],
                seek: [q.$score.after(5), q.id.after('s1')]
            }),
            scored
        );
        expect(query.where).toContain(`n_.props, '$."$$score"`);
        expect(query.where).not.toContain(`'$."$score"`);
        expect(query.orderBy).toContain(`n_.props, '$."$$score"`);
        expect(query.labelsTested).toEqual([]);
        const statement = backend.loadAllFragments(scored.model as any, query.where, { orderBy: query.orderBy });
        expect(statement.text).toContain('FROM drivine_node n_\nWHERE ');
    });

    it("writes the fragments' hint once, after the load's first SELECT, and leaves no note of it in the text", () => {
        const query = backend.renderQuery(
            (q: any) => ({ where: [q.name.eq('Ada'), q.$score.gt(1)], orderBy: [q.name.asc()] }),
            scored
        );
        const statement = backend.loadAllFragments(scored.model as any, query.where, { orderBy: query.orderBy });
        expect(statement.text.startsWith(`SELECT ${HINT} JSON_OBJECT(`)).toBe(true);
        expect(statement.text.split(HINT)).toHaveLength(2);
        expect(statement.text).not.toContain('drivine:');
        expect(
            backend.countFragments(scored.model as any, query.where).text.startsWith(`SELECT ${HINT} COUNT(*)`)
        ).toBe(true);
        // A filter of a view's root, and a search's filter, are hinted in the statement too.
        const views = backend.renderQuery((q: any) => ({ where: q.scored.name.eq('Ada') }), view);
        expect(backend.loadAllViews(view.model as any, views.where).text.startsWith(`SELECT ${HINT} `)).toBe(true);
        const where = backend.renderWhere((q: any) => q.name.eq('Ada'), scored).where;
        const nearest = backend.nearest(scored, { label: 'Scored', property: 'e', similarity: 'COSINE', k: 3, where });
        expect(nearest.text.startsWith(`SELECT ${HINT} JSON_OBJECT('value'`)).toBe(true);
        expect(nearest.text).toContain('JOIN drivine_node n_ ON (n_.nid = s.nid + 0 AND s.nid = n_.nid + 0)');
    });

    it("writes the hint after a delete's DELETE, and in a block on the statement the filter is in", () => {
        const where = backend.renderWhere((q: any) => q.name.eq('Ada'), scored).where;
        const deleteAll = backend.deleteAll(scored, where).text;
        expect(deleteAll).toContain(`    DELETE ${HINT} FROM drivine_node n_\nWHERE `);
        expect(deleteAll).not.toContain(`SELECT ${HINT}`);
        expect(backend.delete(scored, where).text).toContain(`    DELETE ${HINT} FROM drivine_node n_\nWHERE `);
        // A patch's condition: its own SELECT in the block, over n_, and not the block's first.
        const patch = backend.patchOne(scored.model as any, where).text;
        expect(patch).toContain(
            `SELECT ${HINT} COUNT(*) INTO v_meets FROM drivine_node n_ WHERE n_.nid = v_root AND (`
        );
        expect(patch.split(HINT)).toHaveLength(2);
        expect(patch).not.toContain('drivine:');
        // A statement that holds no fragment carries no hint.
        expect(backend.deleteAll(scored, backend.written("n.name = 'Ada'")).text).not.toContain('/*+');
    });

    it("hints a cascade's roots and a depth check's on the statement of the block that reads the filter", () => {
        const where = backend.renderWhere((q: any) => q.location.name.eq('Ada'), hierarchy).where;
        const cascade = backend.delete(hierarchy, where, CascadeType.DELETE_ALL).text;
        expect(cascade).toContain(`    SELECT ${HINT} n_.nid BULK COLLECT INTO v_roots FROM drivine_node n_\nWHERE `);
        expect(cascade.split(HINT)).toHaveLength(2);
        expect(cascade).not.toContain('drivine:');
        const check = backend.cascadeDepthChecks(hierarchy, where)[0].statement.text;
        expect(check).toContain(`WITH cascade_roots AS (SELECT ${HINT} n_.nid FROM drivine_node n_\nWHERE `);
        expect(check.split(HINT)).toHaveLength(2);
        expect(check).not.toContain('drivine:');
    });

    it('takes each hint once, in the order first asked, after the first SELECT or DELETE alone', () => {
        const fragments = new SqlFragments('oracle', { name: 'drivine' });
        fragments.hints.add('A').add('B');
        const second = new SqlFragments('oracle', { name: 'drivine' });
        second.hints.add('B').add('C');
        const sql = `SELECT x FROM t WHERE ${noted('p', fragments)} AND ${noted(
            'q',
            second
        )} AND EXISTS (SELECT 1 FROM u)`;
        expect(hinted(sql)).toEqual('SELECT /*+ A B C */ x FROM t WHERE p AND q AND EXISTS (SELECT 1 FROM u)');
        expect(hinted(`DELETE FROM t WHERE ${noted('p', fragments)}`, ['Z', 'A'])).toEqual(
            'DELETE /*+ Z A B */ FROM t WHERE p'
        );
        expect(hinted('SELECT 1 FROM dual')).toEqual('SELECT 1 FROM dual');
        // What a fragment calls is left for the statement to say.
        fragments.callsStoredEra = true;
        const calls = called(hinted(`SELECT 1 FROM t WHERE ${noted('p', fragments)}`), 'g');
        expect(calls).toEqual({
            text: 'SELECT /*+ A B */ 1 FROM t WHERE p',
            calls: { graph: 'g', nullsEqual: false, era: true, temporalArithmetic: false }
        });
        expect(called('SELECT 1 FROM dual', 'g')).toEqual({ text: 'SELECT 1 FROM dual' });
    });

    it("binds an equality's index key, _cyk_, as plain text, and every name it binds is in its SQL", () => {
        const query = backend.renderQuery(
            (q: any) => ({
                where: [q.name.eq('Ada'), q.$score.gt(1)],
                orderBy: [q.name.asc()],
                seek: q.name.after('B')
            }),
            scored
        );
        expect(query.bindings._cyk__q0).toEqual('Ada');
        expect(query.where).toContain('$_cyk__q0');
        const statement = backend.loadAllFragments(scored.model as any, query.where, { orderBy: query.orderBy });
        const names = named(statement.text);
        for (const name of Object.keys(query.bindings)) {
            expect(names).toContain(name);
        }
        for (const name of names) {
            expect(Object.keys(query.bindings)).toContain(name);
        }
        // Bound as it is, a VARCHAR2: the SQL compares the index's columns with it as text, never as JSON or a CLOB.
        const compiled = new OracleSpecCompiler(statement.spec(query.bindings).finalizedCopy('SQL')).compile();
        expect(Object.values(compiled.parameters as Record<string, unknown>)).toContain('Ada');
    });

    it('reads an equality through the labelled index the module writes, and the statement tests that label no more', () => {
        const indexed = [{ label: 'Scored', properties: ['name'] }];
        const query = backend.renderQuery((q: any) => ({ where: [q.name.eq('Ada'), q.$score.gt(1)] }), scored, indexed);
        expect(query.where).toContain(`CASE WHEN JSON_EXISTS(n_.labels, '$[*]?(@ == "Scored")') THEN`);
        expect(query.labelsTested).toEqual(['Scored']);
        const statement = backend.loadAllFragments(scored.model as any, query.where, {}, query.labelsTested);
        expect(statement.text).not.toContain(`JSON_EXISTS(n_.labels, '$?(@ == "Scored")')`);
        // A view's root is the row the module reads the index over, so its label is the one implied.
        expect(
            backend.renderQuery((q: any) => ({ where: q.scored.name.eq('Ada') }), view, indexed).labelsTested
        ).toEqual(['Scored']);
        // Inside an or the module reads no index, and the label is tested as before.
        const either = backend.renderQuery(
            (q: any) => ({ where: anyOf(q.name.eq('Ada'), q.name.eq('Bo')) }),
            scored,
            indexed
        );
        expect(either.labelsTested).toEqual([]);
        // A range comparison is not read through the index: the module reads an equality alone through it.
        expect(backend.renderQuery((q: any) => ({ where: q.name.gte('A') }), scored, indexed).labelsTested).toEqual([]);
    });

    it("leaves out the label an ignore-case equality read through the index over a lowercased copy implies, as the module's impliedLabels say (drivine-cypher-spec#373)", () => {
        const account: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Account) };
        const indexed = [{ label: 'Account', properties: ['__drivine.lower.email'] }];
        const lowered = backend.renderQuery(
            loweredQuery((q: any) => ({ where: q.email.eqIgnoreCase('Ada@X.com') }), account, new Set(['email'])),
            account,
            indexed
        );
        // The module reads the copy through the labelled index, and since #373 each branch of its term, the one past
        // 4,000 bytes too, holds only for a node of the label: the statement tests the label no more.
        expect(lowered.where).toContain(`CASE WHEN JSON_EXISTS(n_.labels, '$[*]?(@ == "Account")') THEN`);
        expect(lowered.labelsTested).toEqual(['Account']);
        const statement = backend.loadAllFragments(account.model as any, lowered.where, {}, lowered.labelsTested);
        expect(statement.text).not.toContain(`JSON_EXISTS(n_.labels, '$?(@ == "Account")')`);
        // An equality of the copy's own value, not lowered, implies the label too.
        const plain = backend.renderQuery(
            (q: any) => ({ where: q.property('__drivine.lower.email').eq('ada@x.com') }),
            account,
            indexed
        );
        expect(plain.labelsTested).toEqual(['Account']);
        // An equality of an indexed property the module reads through no index, a list's or "", implies none alone...
        for (const value of [['Ada'], '']) {
            const unread = backend.renderQuery((q: any) => ({ where: q.name.eq(value) }), account, [
                ...indexed,
                { label: 'Account', properties: ['name'] }
            ]);
            expect(unread.labelsTested).toEqual([]);
            const tested = backend.loadAllFragments(account.model as any, unread.where, {}, unread.labelsTested);
            expect(tested.text).toContain(`WHERE JSON_EXISTS(n_.labels, '$?(@ == "Account")') AND (`);
            // ...and beside the lowered one, the lowered one implies it.
            const beside = backend.renderQuery(
                loweredQuery(
                    (q: any) => ({ where: [q.email.eqIgnoreCase('Ada@X.com'), q.name.eq(value)] }),
                    account,
                    new Set(['email'])
                ),
                account,
                [...indexed, { label: 'Account', properties: ['name'] }]
            );
            expect(beside.labelsTested).toEqual(['Account']);
        }
        // Inside an or no equality is read through the index, so none implies the label.
        const either = backend.renderQuery(
            loweredQuery(
                (q: any) => ({ where: anyOf(q.email.eqIgnoreCase('Ada@X.com'), q.email.eqIgnoreCase('Bo@X.com')) }),
                account,
                new Set(['email'])
            ),
            account,
            indexed
        );
        expect(either.labelsTested).toEqual([]);
    });

    it('compares a text past 4,000 bytes as a CLOB, not through the index, which holds none, and tests the label', () => {
        const indexed = [{ label: 'Scored', properties: ['name'] }];
        // 4,000 bytes is read through the index; one byte more, or 2,001 two-byte characters, is not.
        const at = backend.renderQuery((q: any) => ({ where: q.name.eq('a'.repeat(4000)) }), scored, indexed);
        expect(at.labelsTested).toEqual(['Scored']);
        expect(Object.keys(at.bindings)).toEqual(['_cyk__q0']);
        for (const long of ['a'.repeat(4001), 'é'.repeat(2001)]) {
            const query = backend.renderQuery((q: any) => ({ where: q.name.eq(long) }), scored, indexed);
            expect(query.where).not.toContain(`CASE WHEN JSON_EXISTS(n_.labels, '$[*]?(@ == "Scored")') THEN`);
            expect(query.where).toContain(`DBMS_LOB.COMPARE(TO_CLOB(JSON_VALUE(n_.props, '$.name' RETURNING CLOB))`);
            expect(query.labelsTested).toEqual([]);
            expect(query.bindings).toEqual({ _cy__q0: JSON.stringify(long) });
            const statement = backend.loadAllFragments(scored.model as any, query.where, {}, query.labelsTested);
            expect(statement.text).toContain(`WHERE JSON_EXISTS(n_.labels, '$?(@ == "Scored")') AND (`);
        }
    });

    it("writes an indexed equality over the expressions of layout 2's labelled and unique indexes, as the plan makes them", async () => {
        const ran: string[] = [];
        const recorder = {
            run: async (statement: unknown): Promise<any[]> => {
                ran.push(String(statement));
                return Promise.resolve([]);
            }
        };
        await new IndexManager(planningOn('oracle', recorder)).ensure(rangeIndex('Scored', 'name'));
        await new ConstraintManager(planningOn('oracle', recorder)).ensure(uniquenessConstraint('Scored', 'name'));
        /** The expressions the index of the kind (lx2, uq2) is made over, over the DSL's row. */
        const columns = (kind: string): string[] => {
            const made = ran.join('\n').match(
                // A range index's indexes are built ONLINE (drivine-cypher-spec#381); a unique one's is not.
                new RegExp(
                    `INDEX IF NOT EXISTS drivine_${kind}_Scoredname_\\w+ ON drivine_node n \\((.*)\\)(?: ONLINE)?';`
                )
            );
            expect(made).not.toBeNull();
            const ddl = made![1].replace(/''/g, "'").replace(/\bn\./g, 'n_.');
            const split: string[] = [];
            let depth = 0;
            let start = 0;
            for (let i = 0; i < ddl.length; i++) {
                depth += ddl[i] === '(' ? 1 : ddl[i] === ')' ? -1 : 0;
                if (ddl[i] === ',' && depth === 0) {
                    split.push(ddl.slice(start, i).trim());
                    start = i + 1;
                }
            }
            return [...split, ddl.slice(start).trim()];
        };
        const where = backend.renderQuery((q: any) => ({ where: q.name.eq('Ada') }), scored, [
            { label: 'Scored', properties: ['name'] }
        ]).where!;
        for (const kind of ['lx2', 'uq2']) {
            const [type, value] = columns(kind);
            expect(where).toContain(`${type} = 'string'`);
            expect(where).toContain(`${value} = $_cyk__q0`);
        }
    });

    it('says which stored functions a statement calls, for the connection to make sure of them', () => {
        const where = backend.renderWhere((q: any) => q.meta.eq({ a: null }), scored).where;
        expect(where).toContain('drivine_nulls_equal(');
        for (const statement of [
            backend.loadAllFragments(scored.model as any, where),
            backend.countFragments(scored.model as any, where),
            backend.deleteAll(scored, where),
            backend.patchOne(scored.model as any, where)
        ]) {
            expect(statement.calls).toEqual({
                graph: 'drivine',
                nullsEqual: true,
                era: false,
                temporalArithmetic: false
            });
            expect(statement.text).not.toContain('drivine:');
            expect(statement.spec()._storedFunctions).toEqual(statement.calls);
            expect(statement.spec().finalizedCopy('SQL')._storedFunctions).toEqual(statement.calls);
        }
        expect(
            backend.countFragments(scored.model as any, backend.renderWhere((q: any) => q.name.eq('x'), scored).where)
                .calls
        ).toBeUndefined();
        expect(new QuerySpecification('SELECT 1 FROM dual')._storedFunctions).toBeUndefined();
    });

    it("says the stored functions a search's, a cascade's and a grouped read's filter calls", async () => {
        const calls = { graph: 'drivine', nullsEqual: true, era: false, temporalArithmetic: false };
        const where = backend.renderWhere((q: any) => q.meta.eq({ a: null }), scored).where;
        const rooted = backend.renderWhere((q: any) => q.location.name.eq({ a: null }), hierarchy).where;
        for (const statement of [
            backend.nearest(scored, { label: 'Scored', property: 'e', similarity: 'COSINE', k: 3, where }),
            backend.matching(scored, { label: 'Scored', properties: ['name'], text: 'ada', limit: 3, where }),
            backend.delete(hierarchy, rooted, CascadeType.DELETE_ALL),
            backend.cascadeDepthChecks(hierarchy, rooted)[0].statement,
            await grouped((q: any) => ({ where: q.meta.eq({ a: null }), keys: { name: key(q.name) } }))
        ]) {
            expect(statement.calls).toEqual(calls);
            expect(statement.text).not.toContain('drivine:');
            expect(statement.spec()._storedFunctions).toEqual(calls);
        }
    });

    it("says a statement calls the graph's temporal arithmetic, where an order by arithmetic of a property does", () => {
        // A property's value may be a date, so the module works out the arithmetic by the graph's function.
        const query = backend.renderQuery((q: any) => ({ orderBy: times(q.$score, 2).desc() }), scored);
        expect(query.orderBy).toContain('drivine_temporal_arith(');
        const statement = backend.loadAllFragments(scored.model as any, query.where, { orderBy: query.orderBy });
        expect(statement.calls).toEqual({ graph: 'drivine', nullsEqual: false, era: false, temporalArithmetic: true });
        expect(statement.text).not.toContain('drivine:');
    });

    it('reads a regular expression as the module does, and takes its refusal of one it cannot answer', () => {
        expect(backend.renderWhere((q: any) => q.name.matches('(?i)(a).*\\1'), scored).where).toContain('REGEXP_LIKE(');
        expect(() => backend.renderWhere((q: any) => q.name.matches('(a)(b)(c)(d)(e)(f)(g)(h)(i)\\9'), scored)).toThrow(
            /backreference \\9/
        );
    });

    it('counts and deletes over n_, and reads a raw where over n as n_', () => {
        const where = backend.written("n.name = 'Ada'");
        expect(where).toEqual(`JSON_VALUE(n_.props, '$.name') = 'Ada'`);
        expect(backend.countFragments(scored.model as any, where).text).toContain('FROM drivine_node n_\nWHERE ');
        expect(backend.deleteAll(scored, where).text).toContain('DELETE FROM drivine_node n_\nWHERE ');
        // A write's own reads keep the row `n`.
        expect(backend.heldProperties(scored.model as any).text).toContain('FROM drivine_node n\nWHERE ');
        expect(backend.foundStamp(scored.model as any).text).toContain('FROM drivine_node n\nWHERE ');
    });

    it('keys and adds a property whose name begins with $ as the layout holds it, $$', async () => {
        const statement = await grouped(() => ({
            keys: { score: key('$score') },
            aggregates: { total: sum('$score'), all: count() }
        }));
        expect(statement.text).toContain(`n_.props, '$?(@."$$score".type()`);
        expect(statement.text).toContain(`SUM(JSON_VALUE(n_.props, '$."$$score"' RETURNING NUMBER))`);
        expect(statement.text).not.toContain(`'$."$score"`);
        // A property key is ordered through the group's node of least nid, joined back by the keys Oracle keeps.
        expect(statement.text).toContain('MIN(n_.nid) AS k0r');
        expect(statement.text).toContain(`LEFT JOIN drivine_node k0_ ON ${sameKey('k0_.nid', 'g.k0r')}`);
        expect(statement.text).toContain(`JOIN drivine_node n_ ON ${sameKey('n_.nid', 'm.nid')}`);
        expect(statement.text.startsWith(`SELECT ${HINT} JSON_OBJECT(`)).toBe(true);
        expect(statement.text).not.toContain('FIRST_VALUE');
    });

    it("takes a least or greatest value's node by a window over the rows before they are grouped, joined back", async () => {
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
        // Each the first of its group by a window, those that have one and meet the filter first; null for none.
        expect(text).toMatch(
            /FIRST_VALUE\(n_\.nid\) OVER \(PARTITION BY m\.k0 ORDER BY CASE WHEN .* THEN 0 ELSE 1 END, .*\) AS w0/
        );
        expect(text).toMatch(/FIRST_VALUE\(n_\.nid\) OVER \(PARTITION BY m\.k0 ORDER BY .* DESC\) AS w1/);
        expect(text).toMatch(/CASE WHEN COUNT\(CASE WHEN .* THEN 1 END\) > 0 THEN MIN\(n_\.w0\) END AS a0, /);
        expect(text).toContain('SELECT m.k0, n_.*, FIRST_VALUE(');
        expect(text).toContain('    ) n_\n    GROUP BY n_.k0');
        // Not KEEP (DENSE_RANK FIRST …), which ends Oracle's server process ordered by a value of JSON.
        expect(text).not.toContain('DENSE_RANK');
        for (const holder of ['a0_', 'a1_']) {
            expect(text).toContain(
                `LEFT JOIN drivine_node ${holder} ON ${sameKey(`${holder}.nid`, `g.${holder.slice(0, 2)}`)}`
            );
        }
        expect(text).toMatch(/\nWHERE .*a1_\.props.*\$_cy_f\d+_value/);
        expect(text).toContain('HAVING COUNT(*) >= $_having1');
        expect(text).toMatch(/\nORDER BY .*a1_\.props/);
        expect(text.split(HINT)).toHaveLength(2);
        expect(Object.keys(statement.bindings)).toContain('_cyk__q1');
        for (const name of named(text)) {
            expect(Object.keys(statement.bindings)).toContain(name);
        }
    });

    it("orders a path key through its node, joined back, by the node's id as Cypher orders it", async () => {
        const statement = await grouped(() => ({
            keys: { judge: pathKey(Judge, [{ type: 'JUDGED_BY' }]) },
            aggregates: { all: count() }
        }));
        expect(statement.text).toContain(`LEFT JOIN drivine_node k0_ ON ${sameKey('k0_.nid', 'g.k0')}`);
        expect(statement.text).toMatch(/\nORDER BY .*k0_\.props, '\$\.code/);
    });

    it("reads a raw where over n as the row n_ a read of the DSL calls its root, in a grouped read's too", async () => {
        const statement = await grouped(() => ({
            where: "n.name = 'Ada'",
            keys: { name: key('name') },
            aggregates: { named: count('n.props IS NOT NULL') }
        }));
        expect(statement.text).toContain(`AND (JSON_VALUE(n_.props, '$.name') = 'Ada'))`);
        expect(statement.text).toContain('SUM(CASE WHEN n_.props IS NOT NULL THEN 1 ELSE 0 END)');
    });
});
