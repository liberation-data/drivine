import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { SharedCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { closeGraphEngines } from '../support/GraphEngines';
import { describeOnOracle, oraclePlan } from '../support/Oracle';
import { sqlPersistenceManager, SqlStore } from '../support/SqlStores';

/** The hint that plans a statement without statistics feedback, as the shared compiler writes it (drivine4j's `OracleCypherCompiler.planned`). */
const NO_FEEDBACK = "OPT_PARAM('_optimizer_use_feedback' 'false')";

jest.setTimeout(120_000);

/** The graph the suite writes: tables of its own, so no other suite's nodes are among its rows. */
const GRAPH = 'nodeeq';

const STORE: SqlStore = { name: 'ORACLE', type: DatabaseType.ORACLE };

/**
 * On Oracle, a node with a label equal to a node matched before it is still joined, and so found when it has more than
 * one label (#598, liberation-data/drivine4j#576). Compared column to column, Oracle dropped the later node's join
 * (`ELIMINATE_JOIN` in the plan's outline) and tested its label in a form that misses such a node. drivine4j's
 * `OracleNodeEqualityPlanTest`.
 */
describeOnOracle('A node equal to a node matched before it, as Oracle plans it', () => {
    let pm: PersistenceManager;

    const query = async (cypher: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }));

    /** That `statement` gives `expected`, and that Oracle keeps the join of the later of the two nodes compared. */
    const assertJoined = async (statement: string, expected: any[]): Promise<void> => {
        const compiled = new SharedCypherCompiler('oracle', { name: GRAPH }).compile(statement);
        const compared = /\b(n(\d+))\.nid = (n(\d+))\.nid\b/.exec(compiled.sql);
        expect([statement, compiled.sql, compared !== null]).toEqual([statement, compiled.sql, true]);
        const [, a, an, b, bn] = compared!;
        const later = (Number(an) > Number(bn) ? a : b).toUpperCase();
        const plan = await oraclePlan(`${STORE.name}_${GRAPH}`, compiled, 'BASIC +OUTLINE');
        expect(plan).toContain('Outline Data');
        expect([statement, plan, new RegExp(`ELIMINATE_JOIN\\([^)]*"${later}"`).test(plan)]).toEqual([
            statement,
            plan,
            false
        ]);
        expect([statement, await query(statement)]).toEqual([statement, expected]);
    };

    beforeAll(async () => {
        pm = sqlPersistenceManager(STORE, GRAPH);
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        // Two labels on each node: Oracle's filter of the labels, in the multivalue index's form, missed such a node.
        await query(
            "CREATE (k:Person:CyEq {name: 'Keanu'}), (c:Person:CyEq {name: 'Carrie'}), (l:Person:CyEq {name: 'Laurence'}), " +
                '(k)-[:KNOWS]->(c), (l)-[:KNOWS]->(k)'
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await closeGraphEngines();
    });

    it('a node with two labels, equal to a node matched before it, is still joined and found', async () => {
        const knows = "MATCH (p {name: 'Keanu'})-[:KNOWS]->(q)";
        await assertJoined(`${knows} MATCH (c:Person) WHERE c = q RETURN c.name`, ['Carrie']);
        await assertJoined(`${knows} MATCH (c:Person) WHERE q = c RETURN c.name`, ['Carrie']);
        await assertJoined("MATCH (p {name: 'Keanu'})<-[:KNOWS]-(q) MATCH (c:Person) WHERE c = q RETURN c.name", [
            'Laurence'
        ]);
        await assertJoined(
            "MATCH (p:Person {name: 'Keanu'})-[:KNOWS]->(q) MATCH (c:Person) WHERE c = q RETURN c.name",
            ['Carrie']
        );
        await assertJoined(`${knows}, (c:Person) WHERE c = q RETURN c.name`, ['Carrie']);
        await assertJoined(`${knows} MATCH (c:Person) WHERE id(c) = id(q) RETURN c.name`, ['Carrie']);
    });

    /**
     * A statement that writes is a procedure, and Oracle takes the step that reads c by its key with its hint (#614,
     * liberation-data/drivine4j#585).
     */
    it('a node read by its key in a statement that writes is found, and written', async () => {
        const statement =
            "MATCH (p {name: 'Keanu'})-[:KNOWS]->(q) MATCH (c:Person) WHERE c = q SET c.seen = true RETURN c.name";
        const sql = new SharedCypherCompiler('oracle', { name: GRAPH }).compile(statement).sql;
        expect([sql, sql.includes(NO_FEEDBACK)]).toEqual([sql, true]);
        try {
            expect([statement, await query(statement)]).toEqual([statement, ['Carrie']]);
            expect(await query('MATCH (c:Person) WHERE c.seen = true RETURN c.name')).toEqual(['Carrie']);
        } finally {
            await query('MATCH (c:Person) REMOVE c.seen');
        }
    });
});
