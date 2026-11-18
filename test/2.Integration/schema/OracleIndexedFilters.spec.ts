import {
    anyOf,
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    GraphStatement,
    ModelRegistry,
    GraphView,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QueryFn,
    QuerySpecification,
    rangeIndex,
    Root,
    StatelessGraphObjectManager,
    TargetModel,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { OracleGraph } from '@/backend/oracle';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';
import { OracleSeed } from '../support/OracleSeed';

jest.setTimeout(120_000);

@NodeFragment({ labels: ['OraIssue'] })
class Issue {
    @NodeId() id: string;
    repoKey?: string;
    state?: string;
    code?: string;
}

@GraphView()
class IssueView {
    @Root() issue: Issue;
}

const ISSUES = 20_000;

/**
 * drivine4j#65: Oracle takes a test of a node's labels for a lookup of one row, so a filter on a property with a range
 * index read every node of the label. An equality every root meets is written over the index's expression, which tests
 * the label too: the shared module's fragment writes it so for the labels it is given (drivine-cypher-spec#235, step 4),
 * over the expressions layout 2's labelled index (lx2) and unique index (uq2) are made over, so Oracle reads them (#696).
 */
describeOnOracle('filters read through labelled indexes on Oracle', () => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const byRepo = rangeIndex('OraIssue', 'repoKey');
    const uniqueCode = uniquenessConstraint('OraIssue', 'code');
    const byCode = rangeIndex('OraIssue', 'code');
    const target = (): TargetModel => ({ kind: 'NODE_FRAGMENT', model: gom.registry.fragment(Issue) });

    /** The ids a load with the query finds, in order. */
    const ids = async (fn: QueryFn<Issue>): Promise<string[]> =>
        (await gom.loadAll(Issue, fn)).map((it) => it.id).sort();

    /** The objects the plan of the load with the query reads: tables and indexes. */
    const planOf = async (fn: QueryFn<Issue>): Promise<string[]> => {
        const rendered = gom.backend.renderQuery(fn, target(), await gom.indexAdvisor.indexed());
        const statement: GraphStatement = gom.backend.loadAllFragments(
            gom.registry.fragment(Issue),
            rendered.where,
            {},
            rendered.labelsTested
        );
        await pm.execute(
            new QuerySpecification(`EXPLAIN PLAN SET STATEMENT_ID = 'drivine65' FOR ${statement.text}`).bind(
                rendered.bindings
            )
        );
        const rows = await pm.query<string>(
            new QuerySpecification(
                `SELECT object_name AS "name" FROM plan_table WHERE statement_id = 'drivine65' AND object_name IS NOT NULL`
            )
        );
        await pm.execute(new QuerySpecification(`DELETE FROM plan_table WHERE statement_id = 'drivine65'`));
        return rows;
    };

    beforeAll(async () => {
        pm = oraclePersistenceManager();
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.ORACLE), new ModelRegistry());
        await gom.indexes.drop(byRepo);
        await gom.indexes.drop(byCode);
        await gom.constraints.drop(uniqueCode);
        await new OracleSeed(pm, 'OraIssue').clear();
        await new OracleSeed(pm, 'OraComment').clear();
        // Issues over 50 repos, 400 each, 20 of each repo's closed; comments of the same repos under another label.
        await pm.execute(
            new QuerySpecification(
                `INSERT INTO drivine_node (labels, props) SELECT JSON('["OraIssue"]'), JSON_OBJECT('id' VALUE 'i' || ` +
                    `LEVEL, 'repoKey' VALUE 'r' || MOD(LEVEL, 50), 'code' VALUE 'c' || LEVEL, 'state' VALUE CASE ` +
                    `WHEN MOD(TRUNC(LEVEL / 50), 20) = 0 THEN 'closed' ELSE 'open' END RETURNING JSON) FROM dual CONNECT BY ` +
                    `LEVEL <= ${ISSUES}`
            )
        );
        await pm.execute(
            new QuerySpecification(
                `INSERT INTO drivine_node (labels, props) SELECT JSON('["OraComment"]'), ` +
                    `JSON_OBJECT('id' VALUE 'x' || LEVEL, 'repoKey' VALUE 'r' || MOD(LEVEL, 50) RETURNING JSON) ` +
                    `FROM dual CONNECT BY LEVEL <= 10`
            )
        );
        // A repo key stored as a number, beside one stored as text.
        await new OracleSeed(pm, 'OraIssue').node([], { id: 'n7', repoKey: 7, state: 'open' });
        await new OracleSeed(pm, 'OraIssue').node([], { id: 't7', repoKey: '7', state: 'open' });
        await pm.execute(new QuerySpecification(`BEGIN DBMS_STATS.GATHER_TABLE_STATS(USER, 'DRIVINE_NODE'); END;`));
    });

    afterAll(async () => {
        await gom.indexes.drop(byRepo);
        await gom.indexes.drop(byCode);
        await gom.constraints.drop(uniqueCode);
        await new OracleSeed(pm, 'OraIssue').clear();
        await new OracleSeed(pm, 'OraComment').clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('should find through the index what it finds without it', async () => {
        const queries: QueryFn<Issue>[] = [
            (q) => ({ where: [q.repoKey.eq('r7'), q.state.eq('closed')] }),
            (q) => ({ where: [q.repoKey.gte('r48'), q.repoKey.lt('r49')] }),
            (q) => ({ where: q.repoKey.eq('7') }),
            (q) => ({ where: anyOf(q.repoKey.eq('r1'), q.repoKey.eq('r2')) })
        ];
        const without = await Promise.all(queries.map(async (it) => ids(it)));
        await gom.indexes.ensure(byRepo);
        expect(await Promise.all(queries.map(async (it) => ids(it)))).toEqual(without);
        expect(without[0]).toHaveLength(ISSUES / 50 / 20);
        expect(await gom.count(Issue, (q) => ({ where: q.repoKey.eq('r7') }))).toEqual(ISSUES / 50);
        const views = await gom.loadAll(IssueView, (q) => ({
            where: [q.issue.repoKey.eq('r7'), q.issue.state.eq('closed')]
        }));
        expect(views.map((it) => it.issue.id).sort()).toEqual(without[0]);
    });

    // The DSL's equality is the module's fragment (drivine-cypher-spec#235), over the expression layout 2's labelled index
    // is made over by the module's schema plan, as drivine4j makes it (#696). Of a property each node holds a value of its
    // own of, where the index wins on cost: for one of a few values, such as the repo key, a 50th of the label each, one
    // node a block, Oracle rightly reads the table instead, and the plan is then a matter of cost (#803).
    it('should read the index, and not the label, for a comparison every root meets', async () => {
        await gom.indexes.ensure(byCode);
        try {
            const labelled = new OracleGraph().objectName('lx2', ['OraIssue', 'code']).toUpperCase();
            // Beside another condition, so its statement isn't the uniqueness constraint's test's: the driver's statement
            // cache keeps the EXPLAIN PLAN it ran prepared, and running it again once the indexes changed is refused
            // (ORA-00900).
            const closed: QueryFn<Issue> = (q) => ({ where: [q.code.eq('c42'), q.state.eq('closed')] });
            const indexed = await planOf(closed);
            expect(indexed).toContain(labelled);
            expect(indexed).not.toContain('DRIVINE_NODE_LABELS');
            expect(await ids(closed)).toEqual(['i42']);
            // Inside an or, the label is read as before.
            const either = await planOf((q) => ({ where: anyOf(q.code.eq('c1'), q.code.eq('c2')) }));
            expect(either).not.toContain(labelled);
        } finally {
            await gom.indexes.drop(byCode);
        }
    });

    it('should read a uniqueness constraint over the property as it reads a range index', async () => {
        await gom.constraints.ensure(uniqueCode);
        const plan = await planOf((q) => ({ where: q.code.eq('c42') }));
        expect(plan).toContain(new OracleGraph().objectName('uq2', ['OraIssue', 'code']).toUpperCase());
        expect(plan).not.toContain('DRIVINE_NODE_LABELS');
        expect(await ids((q) => ({ where: q.code.eq('c42') }))).toEqual(['i42']);
    });

    it('should stop reading through an index this manager drops', async () => {
        await gom.indexes.ensure(byRepo);
        const tested = async (): Promise<string[] | undefined> =>
            gom.backend.renderQuery<Issue>(
                (q) => ({ where: q.repoKey.eq('r7') }),
                target(),
                await gom.indexAdvisor.indexed()
            ).labelsTested;
        expect(await tested()).toEqual(['OraIssue']);
        await gom.indexes.drop(byRepo);
        expect(await tested()).toEqual([]);
        expect(await ids((q) => ({ where: [q.repoKey.eq('r7'), q.state.eq('closed')] }))).toHaveLength(
            ISSUES / 50 / 20
        );
    });

    it('should delete what a load finds', async () => {
        await gom.indexes.ensure(byRepo);
        const found = await ids((q) => ({ where: [q.repoKey.eq('r9'), q.state.eq('closed')] }));
        expect(await gom.deleteAll(Issue, (q) => ({ where: [q.repoKey.eq('r9'), q.state.eq('closed')] }))).toEqual(
            found.length
        );
        expect(await ids((q) => ({ where: [q.repoKey.eq('r9'), q.state.eq('closed')] }))).toEqual([]);
    });
});
