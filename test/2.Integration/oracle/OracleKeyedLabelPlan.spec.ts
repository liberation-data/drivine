import { DatabaseRegistry, DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { NO_FEEDBACK, OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { closeGraphEngines } from '../support/GraphEngines';
import { describeOnOracle, oracleLastPlan, oraclePlan } from '../support/Oracle';
import { sqlPersistenceManager, SqlStore } from '../support/SqlStores';

jest.setTimeout(300_000);

/** The graph the suite writes: tables of its own, so no other suite's nodes are among its rows. */
const GRAPH = 'keyedlabel';
const NODES = 3000;
const SMALL = 750;
/** Runs of one cursor: statistics feedback planned the second and third again, and the fourth as the first. */
const RUNS = 5;

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

    /** The alias of the later of the two nodes `sql` compares by their keys, as Oracle names it in a plan. */
    const laterCompared = (sql: string): string => {
        const compared = /\b(n(\d+))\.nid = (n(\d+))\.nid \+ 0/.exec(sql);
        expect([sql, compared !== null]).toEqual([sql, true]);
        const [, a, an, b, bn] = compared!;
        return (Number(an) > Number(bn) ? a : b).toUpperCase();
    };

    /** That `statement` counts `expected`, and that Oracle reads `b`, the later of the two nodes compared, by its primary key, and keeps its join. */
    const assertReadByKey = async (statement: string, expected: number): Promise<void> => {
        const compiled = new OracleCypherCompiler(GRAPH).compile(statement);
        const later = laterCompared(compiled.sql);
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

    /**
     * Statistics feedback planned the statement again from its first run's counts: the index over labels is estimated at
     * one row, and the run found 3,000. The second and third runs of a new cursor read every node for `b` and the index
     * once for each, as before #606, and the fourth went back to reading b by its key (#614, liberation-data/drivine4j#585).
     * So each run of one cursor, on one session, is checked by the plan of the child cursor that ran it.
     */
    it('reads a node by its key on every run of a new cursor, not planned again from what the first run found', async () => {
        const connection = await DatabaseRegistry.getInstance().connectionProvider(`${STORE.name}_${GRAPH}`)!.connect();
        try {
            const sid = String(
                (await connection.query(new QuerySpecification("SELECT SYS_CONTEXT('USERENV', 'SID') FROM dual")))[0]
            );
            for (const [statement, expected] of [
                ['MATCH (a:Big) MATCH (b:Big) WHERE a = b RETURN count(*)', NODES],
                ['MATCH (a:Big) MATCH (b:Big) WHERE id(b) = id(a) RETURN count(*)', NODES],
                ['MATCH (a:Big:Other) MATCH (b:Big:Other) WHERE a = b RETURN count(*)', NODES],
                ['MATCH (x:Small)-[:R]->(a:Big) MATCH (b:Big) WHERE a = b RETURN count(*)', NODES / 2]
            ] as const) {
                const sql = new OracleCypherCompiler(GRAPH).compile(statement).sql;
                expect([statement, sql.includes(NO_FEEDBACK)]).toEqual([statement, true]);
                const b = laterCompared(sql);
                // A new cursor: statistics gathered again invalidate the one an earlier test, or statement, ran.
                await connection.query(
                    new QuerySpecification(
                        `BEGIN DBMS_STATS.GATHER_TABLE_STATS(USER, '${GRAPH.toUpperCase()}_NODE', no_invalidate => FALSE); END;`
                    )
                );
                for (let run = 1; run <= RUNS; run++) {
                    const started = process.hrtime.bigint();
                    const count = (
                        await connection.query(new QuerySpecification({ text: statement, language: 'CYPHER' }))
                    ).map(Number);
                    const ms = Number(process.hrtime.bigint() - started) / 1e6;
                    const plan = await oracleLastPlan(sid, 'BASIC +PREDICATE +NOTE');
                    console.log(`${statement}, run ${run}: ${ms.toFixed(1)} ms\n${plan}\n`);
                    const where = `${statement}, run ${run} of one cursor:\n${plan}`;
                    expect([
                        where,
                        plan.includes('INDEX UNIQUE SCAN') && new RegExp(`access\\("${b}"\\."NID"=`).test(plan)
                    ]).toEqual([where, true]);
                    expect([where, plan.includes('statistics feedback used')]).toEqual([where, false]);
                    expect([statement, count]).toEqual([statement, [expected]]);
                }
            }
        } finally {
            await connection.release();
        }
    });
});
