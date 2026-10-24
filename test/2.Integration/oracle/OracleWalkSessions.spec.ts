import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(120_000);

const GRAPH = 'drivine_walk_sessions';

/**
 * A walk compiled from Cypher gives the same rows in each session that runs it, as a pool may hand a statement to any
 * of its connections. Oracle adapted the plan of a walk's recursive step as it ran it, and a walk either way around a
 * cycle then found no rows in the next session to run the same statement (liberation-data/drivine4j#182).
 */
describeOnOracle('a walk on Oracle, run in two sessions', () => {
    const managers: PersistenceManager[] = [];
    const cypher = async (pm: PersistenceManager, text: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text, language: 'CYPHER' }));
    const dropGraph = async (): Promise<void> => {
        for (const statement of [
            `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
            `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`
        ]) {
            await managers[0].execute(new QuerySpecification(statement));
        }
    };

    beforeAll(async () => {
        const registry = DatabaseRegistry.getInstance();
        const factory = new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance());
        // Two connections, each a pool of its own, so each statement below runs in a session of each.
        for (const name of ['ORACLE_WALK_ONE', 'ORACLE_WALK_TWO']) {
            registry
                .builder()
                .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: GRAPH })
                .register(name);
            managers.push(factory.get(name, 'NON_TRANSACTIONAL'));
        }
        await managers[0].execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await cypher(
            managers[0],
            "CREATE (a:CyWrite {id: 'a'})-[:R]->(b:CyWrite {id: 'b'})-[:R]->(c:CyWrite {id: 'c'})-[:R]->(a)"
        );
    });

    afterAll(async () => {
        await dropGraph();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
    });

    it('gives the rows of a walk either way around a cycle in each', async () => {
        const sid = "SELECT SYS_CONTEXT('USERENV', 'SID') FROM DUAL";
        const [one, two] = await Promise.all(managers.map(async (it) => it.getOne(new QuerySpecification(sid))));
        expect(one).not.toEqual(two);
        // The spec's writes.yaml, "Walks around a cycle", step 3.
        const walk = "MATCH (:CyWrite {id: 'a'})-[rs:R*]-(n) RETURN [n.id, size(rs)] ORDER BY size(rs), n.id";
        const rows = [];
        for (const pm of managers) {
            rows.push(await cypher(pm, walk));
        }
        const expected = [
            ['b', 1],
            ['c', 1],
            ['b', 2],
            ['c', 2],
            ['a', 3],
            ['a', 3]
        ];
        expect(rows).toEqual([expected, expected]);
    });
});
