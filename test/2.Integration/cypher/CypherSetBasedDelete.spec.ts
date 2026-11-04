import {
    DatabaseRegistry,
    DatabaseType,
    inDrivineContext,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    TransactionContextHolder
} from '@liberation-data/drivine';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';
import { cypherSqlStores, isSqlStore, sqlPersistenceManager, SqlStore } from '../support/SqlStores';

jest.setTimeout(120_000);

/**
 * The graph the SQL stores delete in, of their own: a statement here deletes every node and relationship it matches, as
 * `MATCH (n) DETACH DELETE n` does, and the suites beside it keep theirs in the shared one.
 */
const GRAPH = 'set_delete';

/** Neo4j, the default connection, where it is configured, and the SQL stores, on which each statement is compiled to SQL. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...cypherSqlStores()];
}

/**
 * A `DELETE` deletes the nodes and relationships of all its rows at once, a statement for each table, and one that ends
 * the statement reads its ids from the match itself (#612, liberation-data/drivine4j#587): it deletes what Neo4j does.
 * The rows are Neo4j's (2026.10). drivine4j's `CypherWriteContract`, its tests for #587.
 */
describe.each(stores())('A DELETE on $type', (store) => {
    const sql = isSqlStore(store.type);
    /**
     * A node of any label: on the SQL stores, whose graph is the suite's own, none, so a statement reads the whole graph;
     * on Neo4j, whose graph other suites share, the label every node here has.
     */
    const any = sql ? '' : ':CyDelete';
    let pm: PersistenceManager;
    const query = async (cypher: string): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }));

    /** Four nodes, `k` 1 to 4: 1, 2 and 3 in a ring of relationships `i` 1 to 3, 1 with a loop `i` 4 too, and 4 with no relationship. */
    const ring = async (): Promise<any[]> =>
        query(
            'CREATE (a:CyDelete {k: 1}), (b:CyDelete {k: 2}), (c:CyDelete {k: 3}), (:CyDelete {k: 4}), ' +
                '(a)-[:R {i: 1}]->(b), (b)-[:R {i: 2}]->(c), (c)-[:R {i: 3}]->(a), (a)-[:R {i: 4}]->(a)'
        );

    const ks = async (): Promise<any[]> => query('MATCH (n:CyDelete) RETURN n.k ORDER BY n.k');

    const rs = async (): Promise<any[]> => query(`MATCH (${any})-[r]->() RETURN r.i ORDER BY r.i`);

    const wipe = async (): Promise<void> =>
        sql
            ? void (await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`)))
            : clearLabels(pm, store, 'CyDelete');

    beforeAll(() => {
        pm = sql ? sqlPersistenceManager(store as SqlStore, GRAPH) : persistenceManagerFor(store);
    });

    beforeEach(async () => {
        await wipe();
    });

    afterAll(async () => {
        await wipe();
        await closeGraphEngines();
    });

    it('should DETACH DELETE each node once, however many rows match it, with its relationships', async () => {
        await ring();
        await query('MATCH (n:CyDelete)-[]-() DETACH DELETE n, n');
        expect(await ks()).toEqual([4]);
        expect(await rs()).toEqual([]);
        // A node read by its label alone: on Oracle the delete's subquery over the node table found none.
        await query('MATCH (n:CyDelete) DETACH DELETE n');
        expect(await ks()).toEqual([]);
        await ring();
        await query(`MATCH (n${any}) DETACH DELETE n`);
        expect([
            await query(`MATCH (n${any}) RETURN count(n)`),
            await query(`MATCH (${any})-[r]->() RETURN count(r)`)
        ]).toEqual([[0], [0]]);
    });

    it('should give the rows a DETACH DELETE matched after it, with what was read before it', async () => {
        await ring();
        expect(await query('MATCH (n:CyDelete)-[r]->() WITH n, n.k AS k DETACH DELETE n RETURN k ORDER BY k')).toEqual([
            1, 1, 2, 3
        ]);
        expect(await ks()).toEqual([4]);
        expect(await query('MATCH (n:CyDelete) DETACH DELETE n RETURN count(*)')).toEqual([1]);
        expect(await ks()).toEqual([]);
    });

    it("should DETACH DELETE the nodes a WITH that orders and limits keeps, and take an optional match's null for no node", async () => {
        await ring();
        await query('MATCH (n:CyDelete) WITH n ORDER BY n.k DESC LIMIT 2 DETACH DELETE n');
        expect(await ks()).toEqual([1, 2]);
        expect(await rs()).toEqual([1, 4]);
        await query('MATCH (n:CyDelete {k: 2}) OPTIONAL MATCH (n)-[:NONE]->(m) DETACH DELETE m');
        expect(await ks()).toEqual([1, 2]);
        await query(`OPTIONAL MATCH (${any})-[r:NONE]->() DELETE r`);
        expect(await rs()).toEqual([1, 4]);
    });

    it('should DETACH DELETE only the node a match of two nodes binds, where the delete reads its ids from the match', async () => {
        // The delete's subquery reads the node table twice, a property of each two ways (liberation-data/drivine4j#415).
        await query('CREATE (:CyDelete:N1 {k: 1, n: 1}), (:CyDelete:N2 {k: 2, n: 2})');
        await query('MATCH (a:N1), (b:N2) WHERE a.n + b.n > 0 AND a.n - b.n < 5 DETACH DELETE a');
        expect(await ks()).toEqual([2]);
        await query('CREATE (:CyDelete:N1 {k: 3, n: 1})-[:R {i: 1}]->(:CyDelete:N2 {k: 4, n: 2})');
        await query('MATCH (a:N1)-[r]->(b:N2) WHERE a.n + b.n > 0 AND a.n - b.n < 5 DELETE r');
        expect(await rs()).toEqual([]);
        expect(await ks()).toEqual([2, 3, 4]);
    });

    it('should DELETE each relationship once, one found both ways round included', async () => {
        await ring();
        expect(await query('MATCH (:CyDelete)-[r]-(:CyDelete) WHERE r.i <> 2 DELETE r RETURN count(*)')).toEqual([5]);
        expect(await rs()).toEqual([2]);
        await query(`MATCH (${any})-[r]->() DELETE r`);
        expect(await rs()).toEqual([]);
        expect(await ks()).toEqual([1, 2, 3, 4]);
    });

    it('should fail a DELETE of a node that keeps a relationship no row deletes, deleting nothing, and delete one whose rows delete them all', async () => {
        await ring();
        // Node 1 keeps the relationship from 3.
        await expect(query('MATCH (a:CyDelete {k: 1})-[r]->() DELETE r, a')).rejects.toThrow(/still has relationships/);
        expect(await ks()).toEqual([1, 2, 3, 4]);
        expect(await rs()).toEqual([1, 2, 3, 4]);
        // Each row deletes one of node 1's relationships, and node 1 is deleted once.
        await query('MATCH (a:CyDelete {k: 1})-[r]-() DELETE r, a');
        expect(await ks()).toEqual([2, 3, 4]);
        expect(await rs()).toEqual([2]);
        // A node on each row of a cross product, deleted once.
        await query('MATCH (a:CyDelete {k: 4}), (b:CyDelete) DELETE a');
        expect(await ks()).toEqual([2, 3]);
    });

    it('should DETACH DELETE beside a DELETE in one statement, in a CALL and in a FOREACH, as Neo4j does', async () => {
        await ring();
        // The relationship from 1 to 2 goes with node 1, and the DELETE after it finds it gone.
        await query('MATCH (a:CyDelete {k: 1})-[r]->(:CyDelete {k: 2}) DETACH DELETE a DELETE r');
        expect(await ks()).toEqual([2, 3, 4]);
        expect(await rs()).toEqual([2]);
        // In a CALL { … } and a FOREACH, each row is written alone.
        expect(await query('MATCH (n:CyDelete) WHERE n.k > 2 CALL (n) { DETACH DELETE n } RETURN count(*)')).toEqual([
            2
        ]);
        expect(await ks()).toEqual([2]);
        await query('CREATE (:CyDelete {k: 5})-[:R {i: 5}]->(:CyDelete {k: 6})');
        await query('MATCH (n:CyDelete) WITH collect(n) AS ns FOREACH (n IN ns | DETACH DELETE n)');
        expect(await ks()).toEqual([]);
        expect(await rs()).toEqual([]);
    });

    it('should undo a DELETE in a transaction that rolls back, which reads within it what the DELETE left', async () => {
        // Drivine Studio runs Cypher in a transaction of its own: the one statement a DELETE is goes with the rest of it.
        const tpm = new PersistenceManagerFactory(
            DatabaseRegistry.getInstance(),
            TransactionContextHolder.getInstance()
        ).get(sql ? `${store.name}_${GRAPH}` : store.name, 'TRANSACTIONAL');
        const inside = async (cypher: string): Promise<any[]> =>
            tpm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }));
        await ring();
        const seen = await inDrivineContext()
            .withTransaction({ rollback: true })
            .run(async () => {
                await inside('MATCH (n:CyDelete) WHERE n.k > 2 DETACH DELETE n');
                await inside('MATCH (:CyDelete)-[r {i: 1}]->() DELETE r');
                return [
                    await inside('MATCH (n:CyDelete) RETURN n.k ORDER BY n.k'),
                    await inside('MATCH (:CyDelete)-[r]->() RETURN r.i ORDER BY r.i')
                ];
            });
        expect(seen).toEqual([[1, 2], [4]]);
        expect(await ks()).toEqual([1, 2, 3, 4]);
        expect(await rs()).toEqual([1, 2, 3, 4]);
        // Planned again after the rollback, Oracle crashed the session on this delete without NO_ADAPTIVE_PLAN (#612).
        await query('MATCH (a:CyDelete) OPTIONAL MATCH (a)-[r:R]->(:CyDelete {k: 2}) DELETE r');
        expect(await rs()).toEqual([2, 3, 4]);
    });

    it("should DELETE an optional match's variable where it is not null, and nothing for a match of no rows", async () => {
        await ring();
        await query('MATCH (a:CyDelete) OPTIONAL MATCH (a)-[r:R]->(:CyDelete {k: 2}) DELETE r');
        expect(await rs()).toEqual([2, 3, 4]);
        await query('MATCH (a:CyDelete) OPTIONAL MATCH (a)-[:R]->(m:CyDelete {k: 3}) DETACH DELETE m');
        expect(await ks()).toEqual([1, 2, 4]);
        expect(await rs()).toEqual([4]);
        // Node 4 has no relationship, so its row's is null.
        await query('MATCH (a:CyDelete) WHERE a.k IN [1, 4] OPTIONAL MATCH (a)-[r]-() DELETE r, a');
        expect(await ks()).toEqual([2]);
        expect(await rs()).toEqual([]);
        await query('MATCH (n:CyDeleteNone) DELETE n');
        expect(await query('MATCH (n:CyDeleteNone) DETACH DELETE n RETURN count(*)')).toEqual([0]);
        expect(await ks()).toEqual([2]);
    });

    it('should write the rows a DELETE leaves by the clauses after it, and DELETE each item of a FOREACH alone', async () => {
        await ring();
        await query(
            'MATCH (n:CyDelete) WHERE n.k > 2 DETACH DELETE n WITH count(*) AS c CREATE (:CyDelete {k: 10 + c})'
        );
        expect(await ks()).toEqual([1, 2, 12]);
        expect(await rs()).toEqual([1, 4]);
        await query(
            'MATCH (a:CyDelete {k: 1})-[r]-() WITH a, collect(r) AS rs FOREACH (r IN rs | DELETE r) WITH a DELETE a'
        );
        expect(await ks()).toEqual([2, 12]);
        expect(await rs()).toEqual([]);
    });

    it('should DELETE what the rows a write left hold, where the DELETE ends the statement after the write', async () => {
        // The delete reads its ids from the rows the write put back, each node or relationship joined from its table.
        await ring();
        await query('MATCH (n:CyDelete) WHERE n.k > 2 SET n.gone = true DETACH DELETE n');
        expect(await ks()).toEqual([1, 2]);
        expect(await rs()).toEqual([1, 4]);
        await query('MATCH (a:CyDelete {k: 1}) CREATE (a)-[:R {i: 9}]->(c:CyDelete {k: 9}) DETACH DELETE c');
        expect(await ks()).toEqual([1, 2]);
        expect(await rs()).toEqual([1, 4]);
        await query(`MATCH (${any})-[r]->() SET r.x = 1 DELETE r`);
        expect(await rs()).toEqual([]);
        expect(await ks()).toEqual([1, 2]);
    });
});
