import * as oracledb from 'oracledb';
import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { OracleGraph } from '@/backend/oracle';
import { check, loadSpec, runsOn, skipped, trimIndent, valuesFor } from '../../cypher/CypherSpec';
import { describeOnOracle } from '../support/Oracle';

jest.setTimeout(300_000);

/**
 * Renumbered inline, a statement of this case takes Oracle over a minute to plan, and a CI runner over two (#572): that
 * is what the era functions are for. Planned beside the other suites, two of them then failed with ORA-04036 (PGA limit),
 * so it is left out here: the SQL it compiles to without them is the SQL before them, which `OracleEraFunction.spec.ts`
 * pins. A statement of one `CALL` still runs inline below.
 */
const PLANNED_TOO_SLOWLY = 'Temporal values from CALL';

/** A graph of its own, whose era functions are dropped once its provider has made them. */
const GRAPH = 'cypher_no_era';

/** Runs `statements` in a session of the test user's own. */
async function run(statements: string[]): Promise<void> {
    const it = ConnectionPropertiesFromEnv('ORACLE');
    const connection = await oracledb.getConnection({
        user: it.userName,
        password: it.password,
        connectString: `${it.host}:${it.port ?? 1521}/${it.databaseName}`
    });
    try {
        for (const statement of statements) {
            await connection.execute(statement);
        }
    } finally {
        await connection.close();
    }
}

/**
 * The Cypher spec's temporal statements on an Oracle store without the functions that renumber a year BC (see
 * `OracleGraph.era`), as one an earlier version made, or whose user may not make a function, has: each statement is
 * compiled to renumber it inline, and gives the same rows (#609). drivine4j's CypherTemporalOracleWithoutEraTest.
 */
describeOnOracle('The Cypher spec on Oracle without the era functions', () => {
    let pm: PersistenceManager;
    const graph = new OracleGraph(GRAPH);

    const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(
            new QuerySpecification({ text: trimIndent(cypher), language: 'CYPHER' }).bind(
                valuesFor(parameters, (it) => Number(it))
            )
        );

    beforeAll(async () => {
        const registry = DatabaseRegistry.getInstance();
        registry
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: GRAPH })
            .register('CYPHER_ORACLE_NO_ERA');
        pm = new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance()).get(
            'CYPHER_ORACLE_NO_ERA',
            'NON_TRANSACTIONAL'
        );
        // Its provider makes the graph's functions before its first connection: the era functions are dropped after it.
        await pm.query(new QuerySpecification('SELECT 1 FROM DUAL'));
        await run([`DROP FUNCTION ${graph.era}`, `DROP FUNCTION ${graph.eraDate}`]);
    }, 300_000);

    afterAll(async () => {
        await DatabaseRegistry.getInstance().connectionProvider('CYPHER_ORACLE_NO_ERA')?.end();
        await run([
            `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
            `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`,
            ...[graph.nullsEqual, graph.era, graph.eraDate].map((it) => `DROP FUNCTION IF EXISTS ${it}`)
        ]);
    });

    const spec = loadSpec('temporal.yaml');
    spec.cases
        .filter((cypherCase) => cypherCase.name !== PLANNED_TOO_SLOWLY)
        .forEach((cypherCase) =>
            it(cypherCase.name, async () => {
                await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
                if (spec.graph) {
                    await query(spec.graph);
                }
                for (let i = 0; i < cypherCase.steps.length; i++) {
                    if (runsOn(cypherCase.steps[i], 'oracle') && !skipped('temporal.yaml', cypherCase, i, 'oracle')) {
                        await check('temporal.yaml', cypherCase, i, 'oracle', async (step) =>
                            query(step.cypher, step.parameters ?? {})
                        );
                    }
                }
            })
        );

    it('numbers a year before 1 as Neo4j does in a statement that writes, and in the step of a reduce', async () => {
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        expect(
            await query(
                "CREATE (n:CyTemporal {id: 'w', day: date('-0044-03-15') + duration('P1D')}) RETURN [toString(n.day), n.day.year, toString(date('0000-12-31') + duration('P1D'))]"
            )
        ).toEqual([['-0044-03-16', -44, '0001-01-01']]);
        expect(
            await query(
                "RETURN reduce(s = '', d IN [date('-0044-03-15'), date('0000-12-31'), date('0500-03-15')] | s + toString(d + duration('P1D')) + ',')"
            )
        ).toEqual(['-0044-03-16,0001-01-01,0500-03-16,']);
    });

    it('numbers a moment returned by a CALL as Neo4j does', async () => {
        // One CALL deep, it is planned in well under a second inline; two deep, over a minute (PLANNED_TOO_SLOWLY).
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await query("CREATE (:CyTemporal {id: 'a', day: date('2024-03-15')})");
        expect(
            await query("MATCH (n:CyTemporal) CALL { WITH n RETURN n.day AS d } RETURN (d + duration('P1D')).day")
        ).toEqual([16]);
    });

    it('compiles a statement that would call the era functions and nulls_equal to call only nulls_equal', async () => {
        // The store keeps nulls_equal and not the era functions: a write that compares [null] with [1] gives null, as
        // Cypher does.
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        expect(
            await query(
                "CREATE (n:CyTemporal {id: 'm', day: date('-0044-03-15') + duration('P1D')}) WITH n, [null] AS a, [1] AS b RETURN [coalesce(a = b, 'null'), toString(n.day)]"
            )
        ).toEqual([['null', '-0044-03-16']]);
    });

    it('still has no era functions, so each statement above was compiled to renumber its years inline', async () => {
        const made = await pm.query(
            new QuerySpecification(
                `SELECT COUNT(*) AS "n" FROM user_objects WHERE object_type = 'FUNCTION' AND object_name IN ('${graph.era.toUpperCase()}', '${graph.eraDate.toUpperCase()}')`
            )
        );
        expect(made).toEqual([0]);
    });
});
