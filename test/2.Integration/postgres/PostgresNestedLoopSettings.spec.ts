import { Connection, DatabaseRegistry, DatabaseType, QuerySpecification } from '@liberation-data/drivine';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { closeGraphEngines } from '../support/GraphEngines';
import { sqlPersistenceManager, sqlStores } from '../support/SqlStores';

jest.setTimeout(60_000);

/** The graph the suite writes: tables of its own. */
const GRAPH = 'cy_planner';

const MERGE = 'MATCH (n:CyLoop) MERGE (n)-[:CY_SELF]->(n)';

/**
 * The planner's settings, after a procedure that set them off for a loop, are those the session or its transaction had
 * before it, and where the loop fails, those it had before the procedure: Postgres undoes `set_config(…, true)` with the
 * transaction or savepoint the failure rolls back (#628, #646, liberation-data/drivine4j#609,
 * liberation-data/drivine4j#631). drivine4j's `PostgresNestedLoopSettingsTest`.
 */
describe.each(sqlStores().filter((it) => it.type === DatabaseType.POSTGRES))(
    "The planner's settings around a write loop on $name",
    (store) => {
        let connection: Connection;

        const sql = async (text: string): Promise<any[]> => connection.query(new QuerySpecification(text));

        beforeAll(async () => {
            // Its first statement makes the graph's tables.
            await sqlPersistenceManager(store, GRAPH).query(new QuerySpecification(`SELECT 1 AS one`));
            connection = await DatabaseRegistry.getInstance().connectionProvider(`${store.name}_${GRAPH}`)!.connect();
        });

        afterAll(async () => {
            await connection?.release();
            await closeGraphEngines();
        });

        /**
         * The settings after `cypher` ran in a transaction that ran `setup` first, then rolled back: a `SET` in it, as a
         * `SET LOCAL`, is undone with it, so the connection goes back to its pool as it came.
         */
        const settingsAfter = async (
            setup: string,
            cypher: string,
            nodes: boolean = false,
            fails: boolean = false
        ): Promise<string[]> => {
            const text = new PostgresCypherCompiler(GRAPH).compile(cypher).setup.join('\n');
            for (const setting of ['enable_seqscan', 'enable_material']) {
                expect([text.includes(`set_config('${setting}', 'off', true)`), text]).toEqual([true, text]);
            }
            await connection.startTransaction();
            try {
                await sql(setup);
                if (nodes) {
                    await sql(`INSERT INTO ${GRAPH}_node (labels, props) VALUES ('["CyLoop"]', '{"i": 0}')`);
                }
                await sql('SAVEPOINT cy_loop');
                // Where it fails, it fails in the loop, with the settings off, and not before it sets them.
                const failure = await connection
                    .query(new QuerySpecification({ text: cypher, language: 'CYPHER' }))
                    .then(
                        () => undefined,
                        (e: Error) => e.message
                    );
                const failed = failure !== undefined;
                expect([cypher, failed, failed && /division by zero/.test(failure)]).toEqual([cypher, fails, fails]);
                if (failed) {
                    await sql('ROLLBACK TO SAVEPOINT cy_loop');
                }
                const [settings] = await sql(
                    "SELECT current_setting('enable_seqscan') AS s, current_setting('enable_hashjoin') AS h, " +
                        "current_setting('enable_mergejoin') AS m, current_setting('enable_material') AS t"
                );
                return [settings.s, settings.h, settings.m, settings.t];
            } finally {
                await connection.rollbackTransaction();
            }
        };

        it('are put back as the session had them, in its transaction', async () => {
            expect(await settingsAfter('SET enable_hashjoin = off', MERGE)).toEqual(['on', 'off', 'on', 'on']);
        });

        it('are put back as its transaction had them', async () => {
            expect(await settingsAfter('SET LOCAL enable_hashjoin = off', MERGE, true)).toEqual([
                'on',
                'off',
                'on',
                'on'
            ]);
        });

        it('are left as they were where the loop fails, once its savepoint is rolled back', async () => {
            // It divides by the node's 0 in the loop, where it works out the relationship it makes.
            const failing = 'MATCH (n:CyLoop) MERGE (n)-[:CY_SELF {w: 1 / n.i}]->(n)';
            expect(await settingsAfter('SET LOCAL enable_hashjoin = off', failing, true, true)).toEqual([
                'on',
                'off',
                'on',
                'on'
            ]);
        });
    }
);
