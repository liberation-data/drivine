import {
    CursorSpecification,
    DatabaseRegistry,
    PersistenceManager,
    QuerySpecification
} from '@liberation-data/drivine';
import { hasLabels, OracleGraph } from '@/backend/oracle/OracleGraph';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';

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
});
