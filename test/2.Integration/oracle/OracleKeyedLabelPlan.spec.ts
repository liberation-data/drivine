import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { closeGraphEngines } from '../support/GraphEngines';
import { describeOnOracle, oraclePlan } from '../support/Oracle';
import { sqlPersistenceManager, SqlStore } from '../support/SqlStores';

jest.setTimeout(300_000);

/** The graph the suite writes: tables of its own, so no other suite's nodes are among its rows. */
const GRAPH = 'keyedlabel';
const NODES = 3000;
const SMALL = 750;

const STORE: SqlStore = { name: 'ORACLE', type: DatabaseType.ORACLE };

/** A node's `k`, for its `i`: on half the nodes, 0 to 4. */
const k = (i: number): number | undefined => (i % 2 === 0 ? i % 5 : undefined);

/** How many of the nodes, numbered from 1, `test` holds of. */
const count = (test: (i: number) => boolean): number =>
    Array.from({ length: NODES }, (_, i) => i + 1).filter(test).length;

/**
 * On Oracle, a node with a label whose key is set equal to a node found before it is read by its primary key, once for
 * each row of that node (#606, liberation-data/drivine4j#578). With its label tested through the index over labels,
 * Oracle read that index again for each row, and filtered it on the key: `MATCH (a:Big) MATCH (b:Big) WHERE a = b` took
 * 1.5 s over 4,000 nodes, growing with their square. The plan's outline names each join Oracle eliminates, which #598
 * keeps it from doing to the later node. drivine4j's `OracleKeyedLabelPlanTest`.
 */
describeOnOracle('A node with a label set equal to a node found before it, as Oracle plans it', () => {
    let pm: PersistenceManager;

    const query = async (cypher: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }));

    /** That `statement` counts `expected`, and that Oracle reads `b`, the later of the two nodes compared, by its primary key, and keeps its join. */
    const assertReadByKey = async (statement: string, expected: number): Promise<void> => {
        const compiled = new OracleCypherCompiler(GRAPH).compile(statement);
        const compared = /\b(n(\d+))\.nid = (n(\d+))\.nid \+ 0/.exec(compiled.sql);
        expect([statement, compiled.sql, compared !== null]).toEqual([statement, compiled.sql, true]);
        const [, a, an, b, bn] = compared!;
        const later = (Number(an) > Number(bn) ? a : b).toUpperCase();
        const plan = await oraclePlan(`${STORE.name}_${GRAPH}`, compiled, 'BASIC +PREDICATE +OUTLINE');
        expect([
            statement,
            plan,
            plan.includes('INDEX UNIQUE SCAN') && new RegExp(`access\\("${later}"\\."NID"=`).test(plan)
        ]).toEqual([statement, plan, true]);
        expect(plan).toContain('Outline Data');
        expect([statement, plan, new RegExp(`ELIMINATE_JOIN\\([^)]*"${later}"`).test(plan)]).toEqual([
            statement,
            plan,
            false
        ]);
        expect([statement, (await query(statement)).map(Number)]).toEqual([statement, [expected]]);
    };

    beforeAll(async () => {
        pm = sqlPersistenceManager(STORE, GRAPH);
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await query(`UNWIND range(1, ${NODES}) AS i CREATE (:Big:Other {i: i, k: CASE WHEN i % 2 = 0 THEN i % 5 END})`);
        await query(`UNWIND range(1, ${SMALL}) AS i CREATE (:Small {i: i})`);
        // A relationship into each Big node of odd i, from a Small node.
        await query(
            `MATCH (b:Big) WHERE b.i % 2 = 1 MATCH (s:Small) WHERE s.i = b.i % ${SMALL} + 1 CREATE (s)-[:R]->(b)`
        );
        await pm.execute(
            new QuerySpecification(
                `BEGIN DBMS_STATS.GATHER_TABLE_STATS(USER, '${GRAPH.toUpperCase()}_NODE'); ` +
                    `DBMS_STATS.GATHER_TABLE_STATS(USER, '${GRAPH.toUpperCase()}_EDGE'); END;`
            )
        );
    }, 900_000);

    afterAll(async () => {
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await closeGraphEngines();
    });

    it('reads a node with a label equal to a node found by its label, properties or a relationship by its key', async () => {
        await assertReadByKey('MATCH (a:Big) MATCH (b:Big) WHERE a = b RETURN count(*)', NODES);
        await assertReadByKey('MATCH (a:Big) MATCH (b:Big) WHERE b = a RETURN count(*)', NODES);
        await assertReadByKey('MATCH (a:Big), (b:Big) WHERE a = b RETURN count(*)', NODES);
        await assertReadByKey(
            'MATCH (a:Big) WHERE a.k = 1 MATCH (b:Big) WHERE a = b RETURN count(*)',
            count((i) => k(i) === 1)
        );
        await assertReadByKey(
            'MATCH (a:Big) MATCH (b:Big) WHERE a = b AND b.k > 0 RETURN count(*)',
            count((i) => (k(i) ?? 0) > 0)
        );
        await assertReadByKey('MATCH (a:Big:Other) MATCH (b:Big:Other) WHERE a = b RETURN count(*)', NODES);
        await assertReadByKey('MATCH (x:Small)-[:R]->(a:Big) MATCH (b:Big) WHERE a = b RETURN count(*)', NODES / 2);
        await assertReadByKey('MATCH (a:Big) MATCH (b:Big) WHERE id(b) = id(a) RETURN count(*)', NODES);
        await assertReadByKey('MATCH (a:Big) WHERE EXISTS { MATCH (b:Big) WHERE a = b } RETURN count(*)', NODES);
    });
});
