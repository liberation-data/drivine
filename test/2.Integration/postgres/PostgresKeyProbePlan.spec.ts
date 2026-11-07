import { Client } from 'pg';
import {
    ConnectionPropertiesFromEnv,
    DatabaseType,
    PersistenceManager,
    QuerySpecification
} from '@liberation-data/drivine';
import { PostgresSpecCompiler } from '@/connection/postgres/PostgresSpecCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { closeGraphEngines } from '../support/GraphEngines';
import { sqlPersistenceManager, sqlStores } from '../support/SqlStores';

jest.setTimeout(300_000);

/** The graph the suite writes: tables of its own. */
const GRAPH = 'cy_probe';
const NODES = `${GRAPH}_node`;
const EDGES = `${GRAPH}_edge`;
const ROWS = 2000;

/** A statement's text with each probe of a key put back as the plain join it was, as Oracle's and SQLite's still join. */
function plain(sql: string): string {
    return sql.replace(
        /LEFT JOIN LATERAL \(\s*SELECT \* FROM (\S+) (\w+) WHERE (\2\.\w+ = .*?) OFFSET 0\s*\) \2 ON TRUE/g,
        'LEFT JOIN $1 $2 ON $3'
    );
}

/** Whether `plan` materializes a scan of `table`, of the whole table or of its key's whole index, to compare each row with. */
function materialized(plan: string, table: string): boolean {
    const scanned = `(Seq Scan|Index (Only )?Scan using \\S+) on ${table} `;
    return new RegExp(`Materialize\\s*\\(.*\\n\\s*->\\s+${scanned}`).test(plan);
}

/** Whether `plan` reads `table` by its key's index for the row's id: a scan of the index with the id as its condition. */
function probed(plan: string, table: string): boolean {
    return new RegExp(
        `Index (Only )?Scan using ${table}_pkey on ${table} \\w+.*\\n\\s*Index Cond: \\((\\w+\\.)?[ne]id = `
    ).test(plan);
}

/**
 * The plans Postgres makes for a write that reads its rows' nodes or relationships back by id, where the table's
 * statistics say it is empty while it still has pages: as an ANALYZE (or an autoanalyze) just after a `DELETE` leaves
 * it, before the rows are written again (#655, liberation-data/drivine4j#644). A plain join was planned to compare each
 * row with every row of a scan materialized, and a `FOREACH` over 20,000 nodes took 19 s where it takes under one. The
 * probe is planned as a scan of the key's index.
 *
 * Each write runs on a connection of its own, as PL/pgSQL keeps a plan for its session: a pooled connection that planned
 * the statement before, with the statistics right, keeps that plan. The plans are logged by auto_explain, as notices.
 * drivine4j's `PostgresKeyProbePlanTest`.
 */
describe.each(sqlStores().filter((it) => it.type === DatabaseType.POSTGRES))(
    'A row read back by its id where the table statistics say it is empty, on $name',
    (store) => {
        let pm: PersistenceManager;

        const sql = async (...statements: string[]): Promise<void> => {
            for (const statement of statements) {
                await pm.execute(new QuerySpecification(statement));
            }
        };

        const cypher = async (text: string): Promise<any[]> =>
            pm.query(new QuerySpecification({ text, language: 'CYPHER' }).bind({ n: ROWS }));

        beforeAll(async () => {
            pm = sqlPersistenceManager(store, GRAPH);
            // Its first statement makes the graph's tables.
            await pm.query(new QuerySpecification('SELECT 1 AS one'));
        });

        afterEach(async () => {
            await sql(
                `ALTER TABLE ${NODES} RESET (autovacuum_enabled)`,
                `ALTER TABLE ${EDGES} RESET (autovacuum_enabled)`,
                `TRUNCATE ${EDGES}, ${NODES}`
            );
        });

        afterAll(async () => {
            await closeGraphEngines();
        });

        /**
         * `ROWS` nodes, each with a relationship to itself where `relationships`, made, deleted and made again, with the
         * tables analyzed while they were empty: their statistics say they hold no rows, over the pages the first ones left.
         */
        const stale = async (relationships: boolean): Promise<void> => {
            await sql(
                `TRUNCATE ${EDGES}, ${NODES}`,
                `ALTER TABLE ${NODES} SET (autovacuum_enabled = off)`,
                `ALTER TABLE ${EDGES} SET (autovacuum_enabled = off)`
            );
            const made = relationships
                ? 'UNWIND range(1, $n) AS i CREATE (a:CyLoop {i: i})-[:CY_SELF]->(a)'
                : 'UNWIND range(1, $n) AS i CREATE (:CyLoop {i: i})';
            await cypher(made);
            await sql(`DELETE FROM ${EDGES}`, `DELETE FROM ${NODES}`, `ANALYZE ${NODES}`, `ANALYZE ${EDGES}`);
            await cypher(made);
        };

        /** The plans of the statements `cypher` compiles to, `compiled` from its text, run on a connection of its own. */
        const plans = async (cypher: string, compiled: (sql: string) => string): Promise<string[]> => {
            const statement = new PostgresCypherCompiler(GRAPH).compile(cypher);
            const properties = ConnectionPropertiesFromEnv(store.name);
            const client = new Client({
                host: properties.host,
                port: properties.port,
                user: properties.userName,
                password: properties.password,
                database: properties.databaseName
            });
            const notices: string[] = [];
            client.on('notice', (notice) => notices.push(notice.message ?? ''));
            await client.connect();
            try {
                for (const setting of [
                    "LOAD 'auto_explain'",
                    'SET auto_explain.log_min_duration = 0',
                    'SET auto_explain.log_nested_statements = on',
                    'SET auto_explain.log_level = notice',
                    'SET client_min_messages = notice'
                ]) {
                    await client.query(setting);
                }
                for (const setup of statement.setup) {
                    await client.query(compiled(setup));
                }
                const positional = new PostgresSpecCompiler(
                    new QuerySpecification(compiled(statement.sql)).bind(statement.parameters).finalizedCopy('SQL')
                ).compile();
                await client.query(positional.statement, positional.parameters);
            } finally {
                await client.end();
            }
            return notices;
        };

        /** The plans of those of `cypher`'s statements that join its rows to the table `table`, with the statistics stale. */
        const joinPlans = async (
            cypher: string,
            table: string,
            relationships: boolean,
            compiled: (sql: string) => string = (it) => it
        ): Promise<string[]> => {
            await stale(relationships);
            const joins = (await plans(cypher, compiled)).filter(
                (it) => it.includes('jsonb_array_elements') && it.includes(` ${table} `)
            );
            expect([cypher, joins.length > 0]).toEqual([cypher, true]);
            return joins;
        };

        const assertProbed = async (statement: string, table: string, relationships: boolean): Promise<void> => {
            // The state is the one the probe is for: joined plainly, the rows are compared with a scan of every row materialized.
            const unprobed = await joinPlans(statement, table, relationships, plain);
            const shown = unprobed.join('\n---\n');
            expect([unprobed.some((it) => materialized(it, table)), shown]).toEqual([true, shown]);
            for (const plan of await joinPlans(statement, table, relationships)) {
                expect([materialized(plan, table), probed(plan, table), plan]).toEqual([false, true, plan]);
            }
            const made = await cypher('MATCH (:CyLoop)-[r:CY_SELF]->(:CyLoop) WHERE r.w = 1 RETURN count(r)');
            expect(made).toEqual([ROWS]);
        };

        it("reads a write's rows' nodes back by the key's index, where the node table's statistics say it is empty", async () => {
            await assertProbed(
                'MATCH (n:CyLoop) FOREACH (x IN [1] | CREATE (n)-[r:CY_SELF]->(n) SET r.w = x)',
                NODES,
                false
            );
        });

        it("reads a write's rows' relationships back by the key's index, where the edge table's statistics say it is empty", async () => {
            await assertProbed('MATCH ()-[r:CY_SELF]->() FOREACH (x IN [1] | SET r.w = x)', EDGES, true);
        });
    }
);
