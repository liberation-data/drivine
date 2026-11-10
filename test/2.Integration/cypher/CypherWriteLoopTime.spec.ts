import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { closeGraphEngines } from '../support/GraphEngines';
import { cypherSqlStores, sqlPersistenceManager, SqlStore } from '../support/SqlStores';

// Ten times the rows took a hundred times as long before #624: minutes for each write over the large run.
jest.setTimeout(3_600_000);

/** The graph the suite writes: tables of its own, so no other suite's nodes are among its rows. */
const GRAPH = 'cy_loop';

const SMALL = 2_000;
const LARGE = 20_000;

/** Linear is about 10, and was 50 to 100 when each row copied the list. */
const RATIO = 30;

/** Where the small run is short, its fixed costs, and a runner's jitter, are much of it: the large one gets this at least. */
const FLOOR_MS = 3_000;

/** Whether a write that took `small` ms over {@link SMALL} rows and `large` over {@link LARGE} grew faster than its rows. */
const slow = (small: number, large: number): boolean => large > Math.max(RATIO * small, FLOOR_MS);

/**
 * On Postgres, vacuums and analyses the node and edge tables of the graph `graph`, as autovacuum does: run while they are
 * empty, it leaves statistics that say they have no rows, where a table never vacuumed is taken to have ten pages.
 */
const vacuumed = async (store: SqlStore, pm: PersistenceManager, graph: string): Promise<void> => {
    if (store.type === DatabaseType.POSTGRES) {
        await pm.execute(new QuerySpecification(`VACUUM ANALYZE ${graph}_edge`));
        await pm.execute(new QuerySpecification(`VACUUM ANALYZE ${graph}_node`));
    }
};

/**
 * A write timed, what it gives for `n` rows where it gives any, and the read that counts what it left. A self-loop is
 * counted from its one node, `(n)-[r]->(n)`, which joins the node table once: `(:CyLoop)-[r]->(:CyLoop)` joins it twice,
 * and on Postgres, with the node table's statistics stale on purpose, that was planned as a scan of every node for each
 * node: 655 s over 20,000 rows, untimed (#680).
 */
interface Write {
    name: string;
    cypher: string;
    gives?: (n: number) => any[];
    check: string;
    left: (n: number) => number;
}

const WRITES: Write[] = [
    {
        name: 'CREATE',
        cypher: 'UNWIND range(1, $n) AS i CREATE (:CyLoop {i: i})',
        check: 'MATCH (n:CyLoop) RETURN count(n)',
        left: (n) => n
    },
    {
        name: 'SET',
        cypher: 'MATCH (n:CyLoop) SET n.x = n.i',
        check: 'MATCH (n:CyLoop) WHERE n.x IS NOT NULL RETURN count(n)',
        left: (n) => n
    },
    {
        name: 'REMOVE',
        cypher: 'MATCH (n:CyLoop) REMOVE n.x',
        check: 'MATCH (n:CyLoop) WHERE n.x IS NOT NULL RETURN count(n)',
        left: () => 0
    },
    {
        name: 'MERGE',
        cypher: 'MATCH (n:CyLoop) MERGE (n)-[:CY_SELF]->(n)',
        check: 'MATCH (n:CyLoop)-[r:CY_SELF]->(n) RETURN count(r)',
        left: (n) => n
    },
    {
        name: 'CALL…RETURN',
        cypher: 'MATCH (n:CyLoop) CALL (n) { SET n.y = n.i RETURN n.i AS j } RETURN count(j)',
        gives: (n) => [n],
        check: 'MATCH (n:CyLoop) WHERE n.y = n.i RETURN count(n)',
        left: (n) => n
    }
];

/**
 * A compiled write that loops over its rows takes time in proportion to them (#624, liberation-data/drivine4j#588). Each
 * row the loop kept was appended to a JSON list of the rows it leaves, which copied the list, so ten times the rows took
 * about a hundred times as long. Each write is timed over {@link SMALL} rows and {@link LARGE}, ten times as many, and
 * the large run must take less than {@link RATIO} times the small one, or {@link FLOOR_MS} where that is more: a ratio,
 * so a slower runner, which is slower at both, passes alike. drivine4j's `CompiledWriteLoopTimeTest`.
 *
 * On Postgres the edge table is vacuumed while empty first, as autovacuum leaves a store's tables once they have been
 * emptied (#628, liberation-data/drivine4j#609): its statistics then say it has no rows. The `MERGE` read its
 * pattern by a plan PL/pgSQL made for the empty edge table, a scan of the whole table, and kept it while the loop filled
 * the table: 28.6 s over 20,000 rows, where it took 0.4 s on a table never vacuumed.
 *
 * The node table is analyzed just after it was emptied, not vacuumed, as an autoanalyze that runs just after the `DELETE`
 * leaves it: its pages of dead rows taken to hold one row (#646, liberation-data/drivine4j#631,
 * liberation-data/drivine-python#430). The `CALL`'s per-row read of its node was then planned to materialize a scan of
 * the whole primary key index and filter it for the row's node, so it was quadratic: 72 s to 142 s over 20,000 rows in
 * drivine-python's CI. Materialization is now off in the loop too. So that the state lasts until the `CALL`, the node
 * table is not autovacuumed while the writes are timed: an autoanalyze of the rows the writes made, landing before it,
 * puts the statistics right, and the test passed without the fix.
 */
describe.each(cypherSqlStores())('A compiled write loop on $type', (store) => {
    let pm: PersistenceManager;

    const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(parameters));

    const clear = async (): Promise<void> => {
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
    };

    /** The milliseconds each write took over `n` rows, each checked by what it gave and what it left. */
    const timed = async (n: number): Promise<number[]> => {
        await clear();
        if (store.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(`ANALYZE ${GRAPH}_node`));
            await pm.execute(new QuerySpecification(`VACUUM ANALYZE ${GRAPH}_edge`));
        }
        const times: number[] = [];
        for (const write of WRITES) {
            const start = process.hrtime.bigint();
            const rows = await query(write.cypher, { n });
            times.push(Number((process.hrtime.bigint() - start) / BigInt(1_000_000)));
            if (write.gives) {
                expect([write.name, n, rows]).toEqual([write.name, n, write.gives(n)]);
            }
            expect([write.name, n, await query(write.check)]).toEqual([write.name, n, [write.left(n)]]);
        }
        return times;
    };

    beforeAll(() => {
        pm = sqlPersistenceManager(store, GRAPH);
    });

    afterAll(async () => {
        await clear();
        await closeGraphEngines();
    });

    /** Whether the node table is autovacuumed: not while the writes are timed, so its statistics are those of its ANALYZE. */
    const autovacuumed = async (on: boolean): Promise<void> => {
        if (store.type === DatabaseType.POSTGRES) {
            const option = on ? 'RESET (autovacuum_enabled)' : 'SET (autovacuum_enabled = false)';
            await pm.execute(new QuerySpecification(`ALTER TABLE ${GRAPH}_node ${option}`));
        }
    };

    it('should take about ten times as long over ten times the rows, not a hundred', async () => {
        let small: number[];
        let large: number[];
        await autovacuumed(false);
        try {
            small = await timed(SMALL);
            large = await timed(LARGE);
        } finally {
            await autovacuumed(true);
        }
        const report = WRITES.map(
            (it, i) => `${it.name} ${small[i]} ms over ${SMALL} rows, ${large[i]} ms over ${LARGE}`
        ).join('; ');
        process.stdout.write(`CypherWriteLoopTime ${store.type}: ${report}\n`);
        const slower = WRITES.filter((_, i) => slow(small[i], large[i])).map((it) => it.name);
        expect([slower, report]).toEqual([[], report]);
    });
});

/** The graph the keyed reads write: tables of its own. */
const KEYED = 'cy_keyed';

/** Each write, and the read that counts what it leaves: n each time, over n rows. One that starts with `MATCH` reads {@link NODES}. */
const KEYED_WRITES: [name: string, cypher: string, check: string][] = [
    [
        'MERGE ON CREATE SET',
        'MATCH (n:CyLoop) MERGE (n)-[r:CY_SELF]->(n) ON CREATE SET r.w = n.i',
        'MATCH (n:CyLoop)-[r:CY_SELF]->(n) WHERE r.w IS NOT NULL RETURN count(r)'
    ],
    [
        'CALL MERGE',
        'MATCH (n:CyLoop) CALL (n) { MERGE (n)-[:CY_SELF]->(n) } RETURN count(n)',
        'MATCH (n:CyLoop)-[r:CY_SELF]->(n) RETURN count(r)'
    ],
    [
        'CALL CREATE SET',
        'MATCH (n:CyLoop) CALL (n) { CREATE (n)-[r:CY_SELF]->(n) SET r.w = n.i } RETURN count(n)',
        'MATCH (n:CyLoop)-[r:CY_SELF]->(n) WHERE r.w IS NOT NULL RETURN count(r)'
    ],
    [
        'FOREACH CREATE SET',
        'MATCH (n:CyLoop) FOREACH (x IN [1] | CREATE (n)-[r:CY_SELF]->(n) SET r.w = x)',
        'MATCH (n:CyLoop)-[r:CY_SELF]->(n) WHERE r.w = 1 RETURN count(r)'
    ],
    [
        'CALL RETURN',
        'MATCH (n:CyLoop) CALL (n) { SET n.y = n.i RETURN n.i AS j } RETURN count(j)',
        'MATCH (n:CyLoop) WHERE n.y = n.i RETURN count(n)'
    ],
    [
        'CALL DETACH DELETE',
        'MATCH (n:CyLoop) CALL (n) { CREATE (m:CyMade) DETACH DELETE m } RETURN count(n)',
        'MATCH (n:CyLoop) RETURN count(n)'
    ],
    [
        'CALL CREATE node SET',
        'UNWIND range(1, $n) AS i CALL (i) { CREATE (a:CyLoop {i: i}) SET a.y = i } RETURN count(i)',
        'MATCH (n:CyLoop) WHERE n.y = n.i RETURN count(n)'
    ]
];

/** The nodes a write that reads them is given. */
const NODES = 'UNWIND range(1, $n) AS i CREATE (:CyLoop {i: i})';

/**
 * A compiled write whose loop reads a node or a relationship by its key, from a table the loop adds to, or joins a table
 * to the rows of a `CALL { … }` for one row, takes time in proportion to its rows on Postgres (#628,
 * liberation-data/drivine4j#609): a `MERGE` that reads its pattern, a `SET` of what the loop made, in a `MERGE`'s
 * `ON CREATE`, a `CALL { … }` or a `FOREACH`, with the tables vacuumed while empty; and a `CALL { … }` that returns a
 * value or deletes what it made, over nodes just made, which Postgres planned to hash a scan of every node for each row
 * (17 s over 20,000 rows). Each is timed as the suite above times a write, from an empty graph vacuumed, that
 * {@link NODES} makes the nodes of where it reads them. drivine4j's `CompiledWriteKeyedReadTimePostgresTest`.
 */
describe.each(cypherSqlStores().filter((it) => it.type === DatabaseType.POSTGRES))(
    'A compiled write loop that reads a table for each row on $type',
    (store) => {
        let pm: PersistenceManager;

        const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
            pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(parameters));

        const clear = async (): Promise<void> => {
            await pm.execute(new QuerySpecification(`DELETE FROM ${KEYED}_node`));
        };

        /** The milliseconds `cypher` took over `n` rows, from an empty graph vacuumed, checked by what it left. */
        const timed = async (cypher: string, check: string, n: number): Promise<number> => {
            await clear();
            await vacuumed(store, pm, KEYED);
            if (cypher.startsWith('MATCH')) {
                await query(NODES, { n });
            }
            const start = process.hrtime.bigint();
            await query(cypher, { n });
            const ms = Number((process.hrtime.bigint() - start) / BigInt(1_000_000));
            expect([cypher, n, await query(check)]).toEqual([cypher, n, [n]]);
            return ms;
        };

        beforeAll(() => {
            pm = sqlPersistenceManager(store, KEYED);
        });

        afterAll(async () => {
            await clear();
            await closeGraphEngines();
        });

        it('should take about ten times as long over ten times the rows', async () => {
            const times: [number, number][] = [];
            for (const [, cypher, check] of KEYED_WRITES) {
                times.push([await timed(cypher, check, SMALL), await timed(cypher, check, LARGE)]);
            }
            const report = KEYED_WRITES.map(
                ([name], i) => `${name} ${times[i][0]} ms over ${SMALL} rows, ${times[i][1]} ms over ${LARGE}`
            ).join('; ');
            process.stdout.write(`CypherKeyedReadTime ${store.type}: ${report}\n`);
            const slower = KEYED_WRITES.filter((_, i) => slow(times[i][0], times[i][1])).map(([name]) => name);
            expect([slower, report]).toEqual([[], report]);
        });
    }
);
