import {
    CursorSpecification,
    DatabaseRegistry,
    PersistenceManager,
    QuerySpecification
} from '@liberation-data/drivine';
import { hasLabels, OracleGraph } from '@/backend/oracle/OracleGraph';
import { oracleRefusal } from '@/connection/oracle/OracleConnectionProvider';
import { OracleConnection } from '@/connection/oracle/OracleConnection';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';

jest.setTimeout(60_000);

describeOnOracle('Oracle connection', () => {
    let pm: PersistenceManager;

    beforeAll(async () => {
        pm = oraclePersistenceManager();
        await pm.execute(
            new QuerySpecification(`
                BEGIN
                    EXECUTE IMMEDIATE 'DROP TABLE drivine_conn_test';
                EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF;
                END;`)
        );
        await pm.execute(
            new QuerySpecification('CREATE TABLE drivine_conn_test (id VARCHAR2(20) PRIMARY KEY, n NUMBER, doc JSON)')
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('DROP TABLE drivine_conn_test'));
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('should bind named parameters, a map as JSON, and read JSON back as an object', async () => {
        await pm.execute(
            new QuerySpecification('INSERT INTO drivine_conn_test (id, n, doc) VALUES ($id, $n, JSON($doc))').bind({
                id: 'a',
                n: 1,
                doc: { tags: ['x', 'y'], nested: { ok: true } }
            })
        );
        const row = await pm.getOne<any>(
            new QuerySpecification('SELECT n AS "n", doc AS "doc" FROM drivine_conn_test WHERE id = $id').bind({
                id: 'a'
            })
        );
        expect(row).toEqual({ n: 1, doc: { tags: ['x', 'y'], nested: { ok: true } } });
    });

    it('should not take a parameter as the prefix of a longer one, and leave out binds the statement lacks', async () => {
        const row = await pm.getOne<any>(
            new QuerySpecification('SELECT $id AS "id", $idList AS "list" FROM dual').bind({
                id: 'one',
                idList: 'many',
                unused: 3
            })
        );
        expect(row).toEqual({ id: 'one', list: 'many' });
    });

    it('should skip and limit with OFFSET and FETCH', async () => {
        const rows = await pm.query<any>(
            new QuerySpecification('SELECT LEVEL AS "n" FROM dual CONNECT BY LEVEL <= 5 ORDER BY LEVEL')
                .skip(1)
                .limit(2)
        );
        expect(rows).toEqual([2, 3]);
    });

    it('should hand back the rows a PL/SQL block returns', async () => {
        const rows = await pm.query<any>(
            new QuerySpecification(`
                DECLARE c SYS_REFCURSOR;
                BEGIN
                    OPEN c FOR SELECT 'hello' AS "greeting", $who AS "who" FROM dual;
                    DBMS_SQL.RETURN_RESULT(c);
                END;`).bind({ who: 'world' })
        );
        expect(rows).toEqual([{ greeting: 'hello', who: 'world' }]);
    });

    it('should commit outside a transaction, and keep a transaction until commit or rollback', async () => {
        const provider = DatabaseRegistry.getInstance().connectionProvider('ORACLE')!;
        const connection = await provider.connect();
        try {
            await connection.startTransaction();
            await connection.query(
                new QuerySpecification("INSERT INTO drivine_conn_test (id, n) VALUES ('rolled', 1)")
            );
            await connection.rollbackTransaction();
            await connection.startTransaction();
            await connection.query(new QuerySpecification("INSERT INTO drivine_conn_test (id, n) VALUES ('kept', 2)"));
            await connection.commitTransaction();
        } finally {
            await connection.release();
        }
        const ids = await pm.query<any>(
            new QuerySpecification("SELECT id AS \"id\" FROM drivine_conn_test WHERE id IN ('rolled', 'kept')")
        );
        expect(ids).toEqual(['kept']);
    });

    it('should find a node of several labels a transaction has written and not committed by a test of them all', async () => {
        const graph = new OracleGraph('drivine_labels_test');
        const drop = async (): Promise<void> => {
            for (const statement of [
                `DROP PROPERTY GRAPH IF EXISTS ${graph.name}`,
                `DROP TABLE IF EXISTS ${graph.edges} PURGE`,
                `DROP TABLE IF EXISTS ${graph.nodes} PURGE`
            ]) {
                await pm.execute(new QuerySpecification(statement));
            }
        };
        await drop();
        await pm.execute(new QuerySpecification(graph.ensuring));
        const connection = await DatabaseRegistry.getInstance().connectionProvider('ORACLE')!.connect();
        try {
            await connection.startTransaction();
            await connection.query(
                new QuerySpecification(
                    `INSERT INTO ${graph.nodes} (labels, props) VALUES (JSON('["Dog", "Animal"]'), JSON('{}'))`
                )
            );
            const found = await connection.query<number>(
                new QuerySpecification(
                    `SELECT COUNT(*) AS "n" FROM ${graph.nodes} n WHERE ${hasLabels('n', ['Dog', 'Animal'])}`
                )
            );
            expect(found).toEqual([1]);
        } finally {
            await connection.rollbackTransaction();
            await connection.release();
            await drop();
        }
    });

    it("should find a label after the first by its whole text as the labels' JSON writes it", async () => {
        const graph = new OracleGraph('drivine_labels_text_test');
        const drop = async (): Promise<void> => {
            for (const statement of [
                `DROP PROPERTY GRAPH IF EXISTS ${graph.name}`,
                `DROP TABLE IF EXISTS ${graph.edges} PURGE`,
                `DROP TABLE IF EXISTS ${graph.nodes} PURGE`
            ]) {
                await pm.execute(new QuerySpecification(statement));
            }
        };
        await drop();
        try {
            await pm.execute(new QuerySpecification(graph.ensuring));
            for (const labels of [
                ['Pet', 'Dogs'],
                ['Pet', 'Dog', `it's "q"`, 'c\\d', 'Ünïcødé']
            ]) {
                const json = JSON.stringify(labels).replace(/'/g, "''");
                await pm.execute(
                    new QuerySpecification(
                        `INSERT INTO ${graph.nodes} (labels, props) VALUES (JSON('${json}'), JSON('{}'))`
                    )
                );
            }
            const count = async (labels: string[]): Promise<number> =>
                (
                    await pm.query<number>(
                        new QuerySpecification(
                            `SELECT COUNT(*) AS "n" FROM ${graph.nodes} n WHERE ${hasLabels('n', labels)}`
                        )
                    )
                )[0];
            expect(await count(['Pet', 'Dog'])).toEqual(1);
            expect(await count(['Pet', 'og'])).toEqual(0);
            expect(await count(['Pet', `it's "q"`, 'c\\d', 'Ünïcødé'])).toEqual(1);
        } finally {
            await drop();
        }
    });

    it("should make the store once another session's lock goes, and leave the session's DDL not waiting after, made or failed", async () => {
        const graph = new OracleGraph('drivine_ddl_wait_test');
        const provider = DatabaseRegistry.getInstance().connectionProvider('ORACLE')!;
        const run = async (statement: string): Promise<void> => {
            await pm.execute(new QuerySpecification(statement));
        };
        const drop = async (): Promise<void> => {
            await run(`DROP PROPERTY GRAPH IF EXISTS ${graph.name}`);
            for (const table of [graph.edges, graph.nodes, graph.catalog]) {
                await run(`DROP TABLE IF EXISTS ${table} PURGE`);
            }
        };
        const holder = await provider.connect();
        const maker = await provider.connect();
        /** How long DDL `maker` runs on the edges, while `holder` writes them, takes to be turned away (ORA-00054). */
        const turnedAwayAfter = async (): Promise<number> => {
            await holder.startTransaction();
            await holder.query(new QuerySpecification(`LOCK TABLE ${graph.edges} IN ROW EXCLUSIVE MODE`));
            const started = Date.now();
            try {
                await expect(
                    maker.query(new QuerySpecification(`CREATE INDEX ${graph.name}_extra ON ${graph.edges} (type)`))
                ).rejects.toThrow(/ORA-00054/);
                return Date.now() - started;
            } finally {
                await holder.rollbackTransaction();
            }
        };
        try {
            await drop();
            await run(graph.ensuring);
            await run(`DROP PROPERTY GRAPH ${graph.name}`);
            await run(`DROP INDEX ${graph.name}_edge_src`);

            await holder.startTransaction();
            await holder.query(new QuerySpecification(`LOCK TABLE ${graph.edges} IN ROW EXCLUSIVE MODE`));
            const making = maker.query(new QuerySpecification(graph.ensuring));
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await holder.rollbackTransaction();
            await making;
            expect(
                await pm.query<number>(
                    new QuerySpecification(
                        `SELECT COUNT(*) AS "n" FROM user_property_graphs WHERE graph_name = '${graph.name.toUpperCase()}'`
                    )
                )
            ).toEqual([1]);
            expect(await turnedAwayAfter()).toBeLessThan(10_000);

            // A node table without the key the edges reference: the block fails after the wait is set.
            await drop();
            await run(`CREATE TABLE ${graph.nodes} (x NUMBER)`);
            await expect(maker.query(new QuerySpecification(graph.ensuring))).rejects.toThrow(/ORA-00904/);
            await run(`CREATE TABLE ${graph.edges} (type VARCHAR2(10))`);
            expect(await turnedAwayAfter()).toBeLessThan(10_000);
            // And the measure tells the wait: a session that waits three seconds is turned away after them.
            await maker.query(new QuerySpecification('ALTER SESSION SET DDL_LOCK_TIMEOUT = 3'));
            expect(await turnedAwayAfter()).toBeGreaterThanOrEqual(2500);
            await maker.query(new QuerySpecification('ALTER SESSION SET DDL_LOCK_TIMEOUT = 0'));
        } finally {
            await holder.release();
            await maker.release();
            await drop();
        }
    }, 120_000);

    it('should read a cursor in batches', async () => {
        const connection = await DatabaseRegistry.getInstance().connectionProvider('ORACLE')!.connect();
        try {
            const cursor = await connection.openCursor<any>(
                new CursorSpecification('SELECT LEVEL AS "n" FROM dual CONNECT BY LEVEL <= 7 ORDER BY LEVEL').batchSize(
                    3
                )
            );
            const seen: number[] = [];
            for await (const row of cursor) {
                seen.push(row);
            }
            await cursor.close();
            expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
        } finally {
            await connection.release();
        }
    });

    it("should find the test image is Oracle 23.9 or later, from the driver's version, and run Cypher's randomUUID", async () => {
        // The driver reads the version as it connects, which needs no grant (#428, as liberation-data/drivine4j#401).
        const connection = await DatabaseRegistry.getInstance().connectionProvider('ORACLE')!.connect();
        try {
            const session = (connection as OracleConnection).connection;
            expect([session.oracleServerVersionString, oracleRefusal(session)]).toEqual([
                session.oracleServerVersionString,
                undefined
            ]);
            const [uuid] = await connection.query(
                new QuerySpecification({ text: 'RETURN randomUUID()', language: 'CYPHER' })
            );
            expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        } finally {
            await connection.release();
        }
    });
});
