import { DatabaseRegistry, DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { CompiledCypher } from '@/cypher/sql/CompiledCypher';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { SqliteCypherCompiler } from '@/cypher/sql/SqliteCypherCompiler';
import { closeGraphEngines } from '../support/GraphEngines';
import { cypherSqlStores, sqlPersistenceManager, SqlStore } from '../support/SqlStores';

jest.setTimeout(300_000);

/** The graph the suite writes: tables of its own, so no other suite's nodes are among its rows. */
const GRAPH = 'idkey';
const NODES = 5000;
const EDGES = NODES - 1;

/** How a store's plan for a compiled statement is made and read. */
interface Planner {
    /**
     * The label the statements match their nodes by, which every node carries. Oracle reads a label from the index over
     * labels before any key, `nid = 6` written included, so its statements match no label, and show the key read.
     */
    item: string;

    compiled(cypher: string, parameters: Record<string, any>): CompiledCypher;

    /** The plan the store makes for `compiled`, as it writes it. */
    plan(compiled: CompiledCypher): Promise<string>;

    /** Whether `plan` reads a row of the table `table`, `node` or `edge`, by its primary key. */
    readsByKey(plan: string, table: string): boolean;

    /** Whether `plan` reads every row of the table `table`. */
    scans(plan: string, table: string): boolean;

    /** Gathers the store's statistics of the graph's tables, where it plans by them. */
    analyze(): Promise<void>;
}

/** The connection's name in the registry, as {@link sqlPersistenceManager} registers it. */
function connectionName(store: SqlStore): string {
    return `${store.name}_${GRAPH}`;
}

function sqlitePlanner(pm: PersistenceManager): Planner {
    return {
        item: ':Item',
        compiled: (cypher, parameters) => new SqliteCypherCompiler(GRAPH).compile(cypher, parameters),
        /** A line for each table or rows the plan reads, each led by the table it reads. */
        async plan(compiled: CompiledCypher): Promise<string> {
            const tables = new Map(
                [...compiled.sql.matchAll(new RegExp(`\\b${GRAPH}_(node|edge) (\\w+)`, 'g'))].map(
                    ([, table, alias]) => [alias, table]
                )
            );
            const rows: any[] = await pm.query(
                new QuerySpecification(`EXPLAIN QUERY PLAN ${compiled.sql}`).bind(compiled.parameters)
            );
            return rows
                .map((it) => it.detail as string)
                .filter((it) => it.startsWith('SCAN ') || it.startsWith('SEARCH '))
                .map((line) => `${tables.get(line.split(' ')[1]) ?? 'rows'}: ${line}`)
                .join('\n');
        },
        readsByKey: (plan, table) =>
            plan
                .split('\n')
                .some((it) => it.startsWith(`${table}: SEARCH `) && it.includes('INTEGER PRIMARY KEY (rowid=?)')),
        scans: (plan, table) => plan.split('\n').some((it) => it.startsWith(`${table}: SCAN `)),
        async analyze() {
            await pm.execute(new QuerySpecification(`ANALYZE ${GRAPH}_node`));
            await pm.execute(new QuerySpecification(`ANALYZE ${GRAPH}_edge`));
        }
    };
}

function postgresPlanner(pm: PersistenceManager, store: SqlStore): Planner {
    const key = (table: string): string => (table === 'node' ? 'nid' : 'eid');
    return {
        item: ':Item',
        compiled: (cypher, parameters) => new PostgresCypherCompiler(GRAPH).compile(cypher, parameters),
        /**
         * The plan of `compiled` with no hash or merge join. Over a graph this small, Postgres reads every node once and
         * joins them to a hundred ids by a hash of the key, where it reads each node by the key over a larger one:
         * without either join, the plan reads the key where it can. `SET LOCAL` holds in a transaction, on its connection.
         */
        async plan(compiled: CompiledCypher): Promise<string> {
            const connection = await DatabaseRegistry.getInstance()
                .connectionProvider(connectionName(store))!
                .connect();
            try {
                await connection.startTransaction();
                await connection.query(new QuerySpecification('SET LOCAL enable_hashjoin = off'));
                await connection.query(new QuerySpecification('SET LOCAL enable_mergejoin = off'));
                const rows = await connection.query(
                    new QuerySpecification(`EXPLAIN ${compiled.sql}`).bind(compiled.parameters)
                );
                return rows.map((it) => it['QUERY PLAN']).join('\n');
            } finally {
                await connection.rollbackTransaction();
                await connection.release();
            }
        },
        /** Reading the row by the key, or reading none where the key is known to be no id, as for `5.5`. */
        readsByKey: (plan, table) =>
            plan.includes('One-Time Filter: false') ||
            new RegExp(
                `Index (Only )?Scan using ${GRAPH}_${table}_pkey on ${GRAPH}_${table} \\w+[^\\n]*\\n\\s+Index Cond: \\(${key(
                    table
                )} = `
            ).test(plan),
        /**
         * A scan of the table, of the index over labels (which every node here carries), or of the key's index with no
         * condition on the key, each of which reads each row as a scan does.
         */
        scans(plan: string, table: string): boolean {
            const lines = plan.split('\n');
            return lines.some(
                (line, i) =>
                    line.includes(`Seq Scan on ${GRAPH}_${table} `) ||
                    (line.includes(`Bitmap Heap Scan on ${GRAPH}_${table} `) &&
                        (lines[i + 1] ?? '').includes('Recheck Cond: (labels')) ||
                    (line.includes(`Scan using ${GRAPH}_${table}_pkey on ${GRAPH}_${table} `) &&
                        !(lines[i + 1] ?? '').includes(`Index Cond: (${key(table)} = `))
            );
        },
        async analyze() {
            await pm.execute(new QuerySpecification(`ANALYZE ${GRAPH}_node`));
            await pm.execute(new QuerySpecification(`ANALYZE ${GRAPH}_edge`));
        }
    };
}

function oraclePlanner(pm: PersistenceManager, store: SqlStore): Planner {
    const readsByKey = (plan: string, table: string): boolean => {
        const key = table === 'node' ? 'NID' : 'EID';
        // A node read by the key a relationship's end gives is no key the statement compares. Where the statement reads
        // no more of a node than its key, Oracle drops it, and reads the relationship's end by the key compared, through
        // its index. Within a half of a relationship read both ways round (#588), the key is named with no table's.
        return plan
            .split('\n')
            .some(
                (line) =>
                    (new RegExp(`access\\(.*"${key}"`).test(line) && !/"\."(SRC|DST)"/.test(line)) ||
                    (table === 'node' && /access\("\w+"\."(SRC|DST)"=JSON_VALUE/.test(line))
            );
    };
    return {
        item: '',
        compiled: (cypher, parameters) => new OracleCypherCompiler(GRAPH).compile(cypher, parameters),
        /** The plan Oracle makes for `compiled`, its values written in as literals, explained and read on one session. */
        async plan(compiled: CompiledCypher): Promise<string> {
            const sql = Object.entries(compiled.parameters)
                .sort(([a], [b]) => b.length - a.length)
                .reduce(
                    (text, [name, value]) =>
                        text
                            .split(`$${name}`)
                            .join(
                                value === null || value === undefined
                                    ? 'NULL'
                                    : `'${String(value).replace(/'/g, "''")}'`
                            ),
                    compiled.sql
                );
            const id = `idkey_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
            const connection = await DatabaseRegistry.getInstance()
                .connectionProvider(connectionName(store))!
                .connect();
            try {
                await connection.query(new QuerySpecification(`EXPLAIN PLAN SET STATEMENT_ID = '${id}' FOR ${sql}`));
                const lines = await connection.query(
                    new QuerySpecification(
                        `SELECT plan_table_output AS "line" FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', '${id}', 'BASIC +PREDICATE'))`
                    )
                );
                return lines.map((it) => it.line ?? it.LINE ?? it).join('\n');
            } finally {
                await connection.release();
            }
        },
        /**
         * The key read, by its index or as the key of a join: over a graph this small, Oracle, which takes a `JSON_TABLE`
         * to give 8,168 rows, joins the nodes to the ids by a hash of the key, once over the nodes, where it reads each node
         * by its key over a larger graph.
         */
        readsByKey,
        /** A scan of the table, or of an index, that reads no row by its key: each row is compared with each id. */
        scans: (plan, table) =>
            (new RegExp(`TABLE ACCESS (STORAGE )?FULL\\s*\\|\\s*${GRAPH.toUpperCase()}_${table.toUpperCase()}\\b`).test(
                plan
            ) ||
                /INDEX (FULL|FAST FULL|RANGE) SCAN/.test(plan)) &&
            !readsByKey(plan, table),
        async analyze() {
            await pm.execute(
                new QuerySpecification(
                    `BEGIN DBMS_STATS.GATHER_TABLE_STATS(USER, '${GRAPH.toUpperCase()}_NODE'); ` +
                        `DBMS_STATS.GATHER_TABLE_STATS(USER, '${GRAPH.toUpperCase()}_EDGE'); END;`
                )
            );
        }
    };
}

function plannerFor(store: SqlStore, pm: PersistenceManager): Planner {
    switch (store.type) {
        case DatabaseType.SQLITE:
            return sqlitePlanner(pm);
        case DatabaseType.POSTGRES:
            return postgresPlanner(pm, store);
        default:
            return oraclePlanner(pm, store);
    }
}

/**
 * An id compared by `=` or `IN`, where the row must pass the comparison, is read by the node's or the relationship's
 * primary key (#596, liberation-data/drivine4j#575): the id is JSON, compared as JSON, so each such read was a scan of
 * the table, and an `UNWIND` of ids a scan for each. The rows are those the comparison alone keeps, under `NOT` and `OR`
 * too, where no test of the key stands. drivine4j's `IdKeyPlanTest`.
 */
describe.each(cypherSqlStores())('An id compared, as $type plans it', (store) => {
    let pm: PersistenceManager;
    let planner: Planner;
    let item: string;
    /** Each node's id, by its `k`. */
    let ids: Map<number, number>;
    /** Each relationship's id, by the `k` of the node it leaves. */
    let edgeIds: Map<number, number>;

    const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(parameters));

    const id = (k: number): number => ids.get(k)!;

    /** That `statement` gives `expected`, and that the store's plan reads `table` by its key and scans no row of it. */
    const assertKeyed = async (
        statement: string,
        parameters: Record<string, any>,
        expected: any[],
        table: string = 'node'
    ): Promise<void> => {
        const plan = await planner.plan(planner.compiled(statement, parameters));
        expect([statement, await query(statement, parameters)]).toEqual([statement, expected]);
        expect([statement, plan, planner.readsByKey(plan, table) && !planner.scans(plan, table)]).toEqual([
            statement,
            plan,
            true
        ]);
    };

    /** That `statement` gives `expected`: where no test of the key may stand, the store reads every node, as before. */
    const assertUnkeyed = async (
        statement: string,
        parameters: Record<string, any>,
        expected: any[]
    ): Promise<void> => {
        const plan = await planner.plan(planner.compiled(statement, parameters));
        expect([statement, await query(statement, parameters)]).toEqual([statement, expected]);
        expect([statement, plan, planner.scans(plan, 'node')]).toEqual([statement, plan, true]);
    };

    beforeAll(async () => {
        pm = sqlPersistenceManager(store, GRAPH);
        planner = plannerFor(store, pm);
        item = planner.item;
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await query(`UNWIND range(0, ${NODES - 1}) AS k CREATE (:Item {k: k})`);
        ids = new Map((await query('MATCH (n:Item) RETURN [n.k, id(n)]')).map(([k, nid]) => [k, nid]));
        // A relationship from each of the first nodes to the next, each found by its id.
        const pairs = Array.from({ length: EDGES }, (_, k) => [k, id(k), id(k + 1)]);
        await query(
            'UNWIND $pairs AS p MATCH (a), (b) WHERE id(a) = p[1] AND id(b) = p[2] CREATE (a)-[:NEXT {k: p[0]}]->(b)',
            { pairs }
        );
        edgeIds = new Map((await query('MATCH (a)-[r:NEXT]->() RETURN [a.k, id(r)]')).map(([k, eid]) => [k, eid]));
        await planner.analyze();
    }, 900_000);

    afterAll(async () => {
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        await closeGraphEngines();
    });

    it('reads the node by its key for an id equal to a parameter, either way round', async () => {
        await assertKeyed(`MATCH (n${item}) WHERE id(n) = $id RETURN n.k`, { id: id(5) }, [5]);
        await assertKeyed(`MATCH (n${item}) WHERE $id = id(n) RETURN n.k`, { id: id(5) }, [5]);
        await assertKeyed('MATCH (n) WHERE elementId(n) = $id RETURN n.k', { id: id(5) }, [5]);
        await assertKeyed(`MATCH (n${item}) WHERE n.k >= 0 AND id(n) = $id AND n.k < 100 RETURN n.k`, { id: id(5) }, [
            5
        ]);
        // Written in the statement, with an exponent too.
        await assertKeyed(`MATCH (n${item}) WHERE id(n) = ${id(5)} RETURN n.k`, {}, [5]);
        await assertKeyed(`MATCH (n${item}) WHERE id(n) = ${id(5)}e0 RETURN n.k`, {}, [5]);
        await assertKeyed(`MATCH (n${item}) WHERE id(n) = ${id(5)}.0 RETURN n.k`, {}, [5]);
        await assertKeyed(`MATCH (n${item}) WHERE id(n) IN [${id(3)}, ${id(4)}e0] RETURN n.k ORDER BY n.k`, {}, [3, 4]);
    });

    it('finds no node for an id that is no whole number, a text or null', async () => {
        await assertKeyed(`MATCH (n${item}) WHERE id(n) = $id RETURN n.k`, { id: id(5) + 0.5 }, []);
        await assertKeyed(`MATCH (n${item}) WHERE id(n) = $id RETURN n.k`, { id: String(id(5)) }, []);
        await assertKeyed(`MATCH (n${item}) WHERE id(n) = $id RETURN n.k`, { id: [id(5)] }, []);
        expect(await query(`MATCH (n${item}) WHERE id(n) = $id RETURN n.k`, { id: null })).toEqual([]);
    });

    it('reads the node of each id an UNWIND gives by its key', async () => {
        const given = [id(5), 'x', null, id(6), [id(7)], { id: id(8) }, id(9) + 0.5];
        await assertKeyed(
            `UNWIND $ids AS i MATCH (n${item}) WHERE id(n) = i RETURN n.k ORDER BY n.k`,
            { ids: given },
            [5, 6]
        );
        await assertKeyed(
            `UNWIND $ids AS i MATCH (n${item}) WHERE i = id(n) RETURN n.k ORDER BY n.k`,
            { ids: [id(1), id(2)] },
            [1, 2]
        );
    });

    it('reads each node of an id in a list given or written by its key', async () => {
        const given = [id(5), 'x', null, id(6), [id(7)], { id: id(8) }, id(9) + 0.5];
        await assertKeyed(`MATCH (n${item}) WHERE id(n) IN $ids RETURN n.k ORDER BY n.k`, { ids: given }, [5, 6]);
        await assertKeyed(
            `MATCH (n${item}) WHERE id(n) IN $ids RETURN n.k ORDER BY n.k`,
            { ids: [id(3), id(4)] },
            [3, 4]
        );
        await assertKeyed(
            `MATCH (n${item}) WHERE id(n) IN [$a, $b] RETURN n.k ORDER BY n.k`,
            { a: id(3), b: id(4) },
            [3, 4]
        );
        // A null among the items written: compared item by item, as Cypher compares them.
        await assertKeyed(`MATCH (n${item}) WHERE id(n) IN [$a, null] RETURN n.k`, { a: id(3) }, [3]);
        await assertKeyed(`MATCH (n${item}) WHERE id(n) IN $ids RETURN n.k`, { ids: [] }, []);
    });

    it("reads a relationship's id, and a walk from a node's, by their keys", async () => {
        await assertKeyed('MATCH ()-[r]->() WHERE id(r) = $id RETURN r.k', { id: edgeIds.get(3) }, [3], 'edge');
        await assertKeyed(
            'MATCH ()-[r]->() WHERE elementId(r) IN $ids RETURN r.k ORDER BY r.k',
            { ids: [edgeIds.get(3), edgeIds.get(4)] },
            [3, 4],
            'edge'
        );
        await assertKeyed(`MATCH (a${item})-[r]->(b) WHERE id(a) = $id RETURN b.k`, { id: id(5) }, [6]);
        await assertKeyed(
            `MATCH (a${item}) WHERE id(a) = $id MATCH (b) WHERE id(b) = id(a) RETURN b.k`,
            { id: id(5) },
            [5]
        );
    });

    it('reads the key of an id compared across a relationship of either direction, read both ways round', async () => {
        // Postgres and Oracle read such a relationship from both halves of a UNION ALL (#588): its eid is the halves',
        // each read by its key.
        await assertKeyed(`MATCH (a${item})-[r]-(b) WHERE id(a) = $id RETURN b.k ORDER BY b.k`, { id: id(5) }, [4, 6]);
        await assertKeyed('MATCH ()-[r]-() WHERE id(r) = $id RETURN r.k', { id: edgeIds.get(3) }, [3, 3], 'edge');
        await assertKeyed(
            'MATCH ()-[r]-() WHERE id(r) IN $ids RETURN r.k ORDER BY r.k',
            { ids: [edgeIds.get(3), edgeIds.get(4)] },
            [3, 3, 4, 4],
            'edge'
        );
        await assertKeyed(
            `MATCH (a${item}) WHERE id(a) = $id MATCH (a)-[]-(b) MATCH (c) WHERE id(c) = id(b) RETURN c.k ORDER BY c.k`,
            { id: id(5) },
            [4, 6]
        );
    });

    it('leaves the comparison alone under NOT, beside an OR, or as a value, and gives what it gave', async () => {
        await assertUnkeyed(`MATCH (n${item}) WHERE NOT id(n) = $id RETURN count(n)`, { id: id(5) }, [NODES - 1]);
        await assertUnkeyed(`MATCH (n${item}) WHERE NOT id(n) IN $ids RETURN count(n)`, { ids: [id(5), null] }, [0]);
        await assertUnkeyed(`MATCH (n${item}) WHERE NOT id(n) IN $ids RETURN count(n)`, { ids: [id(5), 'x'] }, [
            NODES - 1
        ]);
        await assertUnkeyed(
            `MATCH (n${item}) WHERE id(n) = $id OR n.k = 7 RETURN n.k ORDER BY n.k`,
            { id: id(5) },
            [5, 7]
        );
        await assertUnkeyed(`MATCH (n${item}) WHERE (id(n) = $id) = false RETURN count(n)`, { id: id(5) }, [NODES - 1]);
        await assertUnkeyed(`MATCH (n${item}) RETURN count(CASE WHEN id(n) = $id THEN 1 END)`, { id: id(5) }, [1]);
        expect(await query(`MATCH (n${item}) WHERE n.k = 5 RETURN [n.k, id(n) = $id]`, { id: id(5) })).toEqual([
            [5, true]
        ]);
        expect(await query(`MATCH (n${item}) WHERE n.k = 5 RETURN [n.k, id(n) IN $ids]`, { ids: [null, 'x'] })).toEqual(
            [[5, null]]
        );
    });

    it('reads a hundred nodes for an UNWIND of a hundred ids, not every node for each', async () => {
        const given = { ids: Array.from({ length: 100 }, (_, i) => id(i * 7)) };
        const statement = `UNWIND $ids AS i MATCH (n${item}) WHERE id(n) = i RETURN count(n)`;
        expect(await query(statement, given)).toEqual([100]);
        const runs: number[] = [];
        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            await query(statement, given);
            runs.push(performance.now() - start);
        }
        console.log(
            `${store.type}: UNWIND of 100 ids over ${NODES} nodes, mean of 5 runs: ` +
                `${(runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(2)} ms`
        );
        await assertKeyed(statement, given, [100]);
    });
});
