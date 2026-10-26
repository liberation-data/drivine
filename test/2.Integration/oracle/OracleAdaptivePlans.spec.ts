import * as oracledb from 'oracledb';
import {
    Connection,
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    QuerySpecification
} from '@liberation-data/drivine';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { loadSpec, trimIndent } from '../../cypher/CypherSpec';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(120_000);

const GRAPH = 'drivine_adaptive_plans';

/** The compiled read that found no rows in the Cypher suite (liberation-data/drivine#331). */
const READ = new OracleCypherCompiler(GRAPH).compile(
    "MATCH (:Person {name: 'Keanu'})-[r:ACTED_IN]->(m) RETURN m.title"
).sql;

/**
 * Oracle makes no adaptive plan in a session of Drivine's. Once the graph's tables had grown and shrunk without
 * statistics, an adaptive plan for a join that filters a node by a label and a property gave no rows, where the same
 * plan, fixed, gave them all (liberation-data/drivine#331). That state comes of a long run and isn't made here, so the
 * test asks the plan: in a session of Drivine's it is fixed, and in a session of Oracle's defaults the same read is
 * planned adaptive.
 */
describeOnOracle('a session of Drivine on Oracle', () => {
    const connections: Connection[] = [];

    /** The notes of the plan Oracle makes for `sql` in the session `run` runs its statements in. */
    const notesOf = async (run: (statement: string) => Promise<any[]>, sql: string): Promise<string> => {
        const id = `adaptive_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        await run(`EXPLAIN PLAN SET STATEMENT_ID = '${id}' FOR ${sql}`);
        const lines = await run(
            `SELECT plan_table_output AS "line" FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', '${id}', 'TYPICAL +ADAPTIVE +NOTE'))`
        );
        return lines.map((it) => it.line ?? it.LINE ?? it).join('\n');
    };

    beforeAll(async () => {
        const registry = DatabaseRegistry.getInstance();
        registry
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: GRAPH })
            .register('ORACLE_ADAPTIVE_PLANS');
        // Two sessions at once, so each is one the pool opened.
        const provider = registry.connectionProvider('ORACLE_ADAPTIVE_PLANS')!;
        connections.push(await provider.connect(), await provider.connect());
        await connections[0].query(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await connections[0].query(
            new QuerySpecification({ text: trimIndent(loadSpec('queries.yaml').graph!), language: 'CYPHER' })
        );
    });

    afterAll(async () => {
        for (const statement of [
            `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
            `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`
        ]) {
            await connections[0].query(new QuerySpecification(statement));
        }
        await Promise.all(connections.map(async (it) => it.release()));
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('plans a read of the graph fixed, where a session of Oracle defaults plans it adaptive', async () => {
        expect(connections[0].sessionId()).not.toEqual(connections[1].sessionId());
        for (const connection of connections) {
            const notes = await notesOf(async (it) => connection.query(new QuerySpecification(it)), READ);
            expect(notes).toContain('Plan hash value');
            expect(notes).not.toContain('adaptive plan');
        }
        const properties = ConnectionPropertiesFromEnv('ORACLE');
        const plain = await oracledb.getConnection({
            user: properties.userName,
            password: properties.password,
            connectString: `${properties.host}:${properties.port ?? 1521}/${properties.databaseName}`
        });
        try {
            const notes = await notesOf(
                async (it) => (await plain.execute(it, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows ?? [],
                READ
            );
            expect(notes).toContain('this is an adaptive plan');
        } finally {
            await plain.close();
        }
        // And the read gives its rows.
        expect(await connections[1].query(new QuerySpecification(READ))).toHaveLength(3);
    });
});
