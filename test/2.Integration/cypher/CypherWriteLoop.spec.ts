import neo4j from 'neo4j-driver';
import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import {
    clearLabels,
    closeGraphEngines,
    GraphEngine,
    graphEngines,
    persistenceManagerFor
} from '../support/GraphEngines';
import { cypherSqlStores, isSqlStore, sqlPersistenceManager, SqlStore } from '../support/SqlStores';

jest.setTimeout(120_000);

/** The graph the SQL stores write in, of their own: on Neo4j, whose graph other suites share, each node is a `CyKeep`. */
const GRAPH = 'cy_keep';

/** Neo4j, the default connection, where it is configured, and the SQL stores, on which each statement is compiled to SQL. */
function stores(): GraphEngine[] {
    return [...graphEngines().filter((it) => it.type === DatabaseType.NEO4J), ...cypherSqlStores()];
}

/**
 * A value as the store takes it: Neo4j keeps a whole number apart from a float, and its driver sends a JavaScript number
 * as a float, so a whole number is sent to it as an integer. A SQL store binds every value as JSON.
 */
function given(store: GraphEngine, value: any): any {
    if (typeof value === 'number' && Number.isInteger(value) && store.type === DatabaseType.NEO4J) {
        return neo4j.int(value);
    }
    if (Array.isArray(value)) {
        return value.map((it) => given(store, it));
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, given(store, v)]));
    }
    return value;
}

/**
 * A write that loops over its rows keeps each row it leaves in a list the store extends in place, and reads them back
 * as one JSON list where a step reads them (#624, liberation-data/drivine4j#588): the rows are those Neo4j gives, in
 * their order, with their nulls and nested values, and a `CALL { … }` that writes and returns gives each row's in turn.
 * The rows are Neo4j's. drivine4j's `CypherWriteContract`, its tests for #588.
 */
describe.each(stores())('The rows a write loop keeps on $type', (store) => {
    const sql = isSqlStore(store.type);
    let pm: PersistenceManager;
    const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(given(store, parameters)));

    const wipe = async (): Promise<void> =>
        sql
            ? void (await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`)))
            : clearLabels(pm, store, 'CyKeep');

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

    it('should leave the rows of a CREATE, SET or REMOVE in their order, with their nulls', async () => {
        // Each row a write loop keeps is put back in the order it was read, a null and a map of lists as they were.
        expect(await query('UNWIND [3, null, 1, 2] AS i CREATE (n:CyKeep {k: i}) RETURN [i, n.k]')).toEqual([
            [3, 3],
            [null, null],
            [1, 1],
            [2, 2]
        ]);
        expect(await query('UNWIND [{a: [1, null]}, null] AS m CREATE (:CyKeep {m: true}) RETURN m')).toEqual([
            { a: [1, null] },
            null
        ]);
        expect(
            await query('MATCH (n:CyKeep) WHERE n.k IS NOT NULL WITH n ORDER BY n.k DESC SET n.x = n.k * 10 RETURN n.x')
        ).toEqual([30, 20, 10]);
        expect(
            await query('MATCH (n:CyKeep) WHERE n.k IS NOT NULL WITH n ORDER BY n.k REMOVE n.x RETURN [n.k, n.x]')
        ).toEqual([
            [1, null],
            [2, null],
            [3, null]
        ]);
        expect(await query('MATCH (n:CyKeepNone) SET n.x = 1 RETURN count(*)')).toEqual([0]);
        expect(await query('UNWIND [1, 2] AS k FOREACH (x IN [k] | CREATE (:CyKeep {f: x})) RETURN k')).toEqual([1, 2]);
    });

    it("should leave a MERGE's rows for each row in turn, a row for each node it matches", async () => {
        // A MERGE keeps a row for each node it finds, or the one it makes, the input rows in their order.
        await query("CREATE (:CyKeep {k: 7, t: 'a'}), (:CyKeep {k: 7, t: 'b'})");
        const rows = await query('UNWIND [8, 7, 8] AS k MERGE (n:CyKeep {k: k}) RETURN [k, n.t]');
        expect(rows.map((it) => it[0])).toEqual([8, 7, 7, 8]);
        expect(new Set(rows.slice(1, 3).map((it) => it[1]))).toEqual(new Set(['a', 'b']));
        expect(await query('MATCH (n:CyKeep) RETURN count(n)')).toEqual([3]);
    });

    it('should give the rows of a CALL that writes and returns for each row in turn, what it returns in order', async () => {
        // What a call returns for each row is kept after what it returned for the rows before it.
        expect(
            await query(
                'UNWIND [1, 2] AS k CALL (k) { UNWIND [k, k * 10] AS j CREATE (:CyKeep {j: j}) RETURN j } RETURN [k, j]'
            )
        ).toEqual([
            [1, 1],
            [1, 10],
            [2, 2],
            [2, 20]
        ]);
        expect(
            await query('UNWIND [1, 2] AS k CALL (k) { CREATE (m:CyKeep) RETURN m.none AS z } RETURN [k, z]')
        ).toEqual([
            [1, null],
            [2, null]
        ]);
        expect(await query('MATCH (n:CyKeepNone) CALL (n) { SET n.x = 1 RETURN 1 AS one } RETURN count(*)')).toEqual([
            0
        ]);
        // A call within a call keeps its rows in a list of its own depth, and two calls in turn each make theirs anew.
        expect(
            await query(
                'UNWIND [1, 2] AS k CALL (k) { UNWIND [k, k * 2] AS i CALL (i) { CREATE (:CyKeep {i: i}) RETURN i * 10 AS j } ' +
                    'CREATE (:CyKeep {j: j}) RETURN j } CALL (j) { CREATE (:CyKeep {j: j}) RETURN j + 1 AS l } RETURN [k, j, l]'
            )
        ).toEqual([
            [1, 10, 11],
            [1, 20, 21],
            [2, 20, 21],
            [2, 40, 41]
        ]);
    });

    it('should keep the values of a row as a read gives them: large whole numbers, decimals, temporals and nested maps', async () => {
        // A kept row goes through the store's own list (jsonb[], JSON_ARRAY_T, a list in SQLite's function) and back.
        // Each value is read from the row's item, so the row holds it, not the statement's text. No text past 32 KB: on
        // Oracle a read and a CREATE that return one, in a list, leave the session to crash on its next statement, as
        // before #624's change (liberation-data/drivine4j#599). drivine4j keeps one past 2^53, 9007199254740993: no
        // JavaScript number holds it, and Drivine fails to give it from Neo4j, so the largest one does here, 2^53 - 1.
        const parameters = {
            rows: [1, 2].map((i) => ({
                i,
                big: Number.MAX_SAFE_INTEGER,
                f: 0.1,
                m: { a: { b: [1, 'c', null] } },
                d: '2020-01-02',
                dt: '2020-01-02T03:04:05.123Z'
            }))
        };
        const values =
            'UNWIND $rows AS r WITH r.i AS i, r.big AS big, r.f AS f, r.i / 3.0 AS third, r.m AS m, date(r.d) AS d, datetime(r.dt) AS dt ';
        const items = '[i, big, f, third, m, d.year, d.day, dt.epochMillis]';
        const read = await query(`${values}RETURN ${items}`, parameters);
        expect(read.length).toBe(2);
        expect([...read[0].slice(0, 3), read[0][4]]).toEqual([
            1,
            Number.MAX_SAFE_INTEGER,
            0.1,
            { a: { b: [1, 'c', null] } }
        ]);
        expect(await query(`${values}CREATE (:CyKeep {i: i}) RETURN ${items}`, parameters)).toEqual(read);
        expect(
            await query(
                `${values}CALL (i, big, f, third, m, d, dt) { CREATE (:CyKeep {i: i}) RETURN ${items} AS row } RETURN row`,
                parameters
            )
        ).toEqual(read);
    });
});
