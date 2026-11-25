import {
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    rangeIndex,
    StatelessGraphObjectManager,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { describeOnOracle, oracleLastPlan } from '../support/Oracle';
import { sqlPersistenceManager, SqlStore } from '../support/SqlStores';

jest.setTimeout(300_000);

/** The graph the suite writes: tables of its own, so its index is the only one its statements may read through. */
const GRAPH = 'indexedprops';
const NAME = `ORACLE_${GRAPH}`;
const STORE: SqlStore = { name: 'ORACLE', type: DatabaseType.ORACLE };
const NODES = 2000;
const INDEX = rangeIndex('IxKeyed', 'key');

/**
 * A Cypher statement run through a connection is compiled with the graph's labelled indexes (#753, drivine4j#805): a
 * keyed `MATCH` for each row of an `UNWIND` reads its node through the label's index, not every node of the label once
 * for each row. drivine4j's `OraclePropertyKeyIndexTest`, "a statement run through query is compiled with the graph's
 * labelled indexes".
 */
describeOnOracle("A Cypher statement on Oracle, compiled with the graph's labelled indexes", () => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    /** The name of the label's labelled index, as the graph's catalog records it. */
    const labelledIndex = async (): Promise<string> =>
        String(
            await pm.getOne<string>(
                new QuerySpecification(
                    `SELECT UPPER(JSON_VALUE(details, '$.labelled')) FROM ${GRAPH}_schema ` +
                        `WHERE kind = 'RANGE_INDEX' AND label = 'IxKeyed'`
                )
            )
        );

    /** The plan of a keyed `MATCH` for each of a batch of keys, run through one session of the graph's connection. */
    const keyedPlan = async (): Promise<string> => {
        const connection = await DatabaseRegistry.getInstance().connectionProvider(NAME)!.connect();
        try {
            const sid = String(
                (await connection.query(new QuerySpecification("SELECT SYS_CONTEXT('USERENV', 'SID') FROM dual")))[0]
            );
            const found = await connection.query(
                new QuerySpecification({
                    text: 'UNWIND $keys AS k MATCH (n:IxKeyed {key: k}) RETURN count(n)',
                    language: 'CYPHER'
                }).bind({ keys: Array.from({ length: 20 }, (_, i) => `k${i * 97}`) })
            );
            expect(found.map(Number)).toEqual([20]);
            return oracleLastPlan(sid, 'BASIC +PREDICATE');
        } finally {
            await connection.release();
        }
    };

    beforeAll(async () => {
        pm = sqlPersistenceManager(STORE, GRAPH);
        gom = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        ).get(NAME);
        await gom.indexes.drop(INDEX);
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await pm.execute(
            new QuerySpecification({
                text: `UNWIND range(0, ${NODES - 1}) AS i CREATE (:IxKeyed {key: 'k' + toString(i)})`,
                language: 'CYPHER'
            })
        );
        await pm.execute(
            new QuerySpecification(`BEGIN DBMS_STATS.GATHER_TABLE_STATS(USER, '${GRAPH.toUpperCase()}_NODE'); END;`)
        );
    });

    afterAll(async () => {
        await gom.indexes.drop(INDEX);
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
    });

    it('reads each keyed node through the index once the index is made, and not before', async () => {
        expect((await gom.indexes.ensure(INDEX)).status).toEqual('CREATED');
        const index = await labelledIndex();
        const withIndex = await keyedPlan();
        expect([withIndex, withIndex.includes(index)]).toEqual([withIndex, true]);

        // Dropped in this process: the next statement is compiled without it, and still finds the nodes.
        await gom.indexes.drop(INDEX);
        const without = await keyedPlan();
        expect([without, without.includes(index)]).toEqual([without, false]);
    });
});
