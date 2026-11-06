import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    ModelRegistry,
    PersistenceManager,
    QuerySpecification,
    StatelessGraphObjectManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { CypherFloat } from '@/cypher/ast/Expression';
import { CompiledCypher } from '@/cypher/sql/CompiledCypher';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { closeGraphEngines } from '../support/GraphEngines';
import { oraclePlan } from '../support/Oracle';
import { cypherSqlStores, sqlPersistenceManager, SqlStore } from '../support/SqlStores';

jest.setTimeout(300_000);

/** The graph the suite writes: tables of its own, so no other suite's nodes are among its rows. */
const GRAPH = 'propkey';
const NODES = 5000;
const IMPORT_LABEL = 'UNIQUE IMPORT LABEL';
const IMPORT_ID = 'UNIQUE IMPORT ID';
const IMPORTED = 2000;
/** A whole number past 2^53, which a JavaScript number doesn't hold. */
const BIG = BigInt('9007199254740993');
const LONG = 'x'.repeat(5000);

/** A float, as the JVM binds a double: a JavaScript number that is whole is bound as a whole number. */
const float = (value: number): CypherFloat => new CypherFloat(value);

/** How a store's plan for a compiled statement is made and read, where the suite reads it. */
interface Planner {
    /** Whether a `WHERE` comparing the property with a row's value probes the index too, as a pattern's does. */
    whereProbesIndex: boolean;

    compiled(cypher: string, parameters: Record<string, any>): CompiledCypher;

    /** The plan the store makes for `compiled`, as it writes it. */
    plan(compiled: CompiledCypher): Promise<string>;

    /** Whether `plan` finds the nodes by the index over their `id`, not by reading every node of the label. */
    probesIndex(plan: string): boolean;
}

/** The connection's name in the registry, as {@link sqlPersistenceManager} registers it. */
function connectionName(store: SqlStore): string {
    return `${store.name}_${GRAPH}`;
}

function postgresPlanner(store: SqlStore): Planner {
    return {
        compiled: (cypher, parameters) => new PostgresCypherCompiler(GRAPH).compile(cypher, parameters),
        /** The plan with no hash or merge join, as `CypherIdKeyPlan.spec.ts` takes it: over a graph this small Postgres might hash every node to the rows. */
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
        probesIndex: (plan) =>
            new RegExp(`Index Cond: \\(\\(props ->> '(id|${IMPORT_ID})'::text\\) = `).test(plan) &&
            !plan.includes(`Seq Scan on ${GRAPH}_node`),
        whereProbesIndex: true
    };
}

function oraclePlanner(store: SqlStore): Planner {
    const graph = GRAPH.toUpperCase();
    return {
        /**
         * Compiled knowing the indexes the graph has, which a statement the connection runs is not yet
         * (liberation-data/drivine4j#638): its rows are found as before, without the index, which the tests of rows here
         * check stays so.
         */
        compiled: (cypher, parameters) =>
            new OracleCypherCompiler(GRAPH, true, true, [
                ['Person', 'id'],
                [IMPORT_LABEL, IMPORT_ID]
            ]).compile(cypher, parameters),
        plan: async (compiled) => oraclePlan(connectionName(store), compiled, 'BASIC +PREDICATE'),
        /**
         * The uniqueness constraint's index read by its key, and neither the index over labels, which reads every node of
         * the label, nor a full scan of the nodes.
         */
        probesIndex: (plan) =>
            new RegExp(`INDEX (UNIQUE|RANGE) SCAN\\s*\\|\\s*${graph}_UQ_`).test(plan) &&
            !plan.includes(`${graph}_NODE_LABELS`) &&
            !new RegExp(`TABLE ACCESS (STORAGE )?FULL\\s*\\|\\s*${graph}_NODE\\b`).test(plan),
        /** A `WHERE` names no label to write the labelled index's expression for. */
        whereProbesIndex: false
    };
}

/**
 * A node matched by a property its index is over, the value an unwound row's (#636, liberation-data/drivine4j#617):
 * compared as JSON inside a `CASE` alone, which no index answers, so a batch of relationships read every node of the
 * label for each row. Beside it now stands a test the index answers, for a value of any kind, that leaves out no row the
 * comparison keeps: a text, a number, a float equal to a whole one, a truth value, a list, null and a missing key each
 * give the rows they gave. On Oracle, a parameter's value had no such test either. drivine4j's `PropertyKeyIndexTest`;
 * its infinities are left out, as a JavaScript number binds none but as null. On Postgres and Oracle, as there: SQLite
 * reads no index beside a row's value.
 */
describe.each(cypherSqlStores().filter((it) => it.type !== DatabaseType.SQLITE))(
    'A property compared with a row, on $type',
    (store) => {
        let pm: PersistenceManager;
        const planner: Planner = store.type === DatabaseType.POSTGRES ? postgresPlanner(store) : oraclePlanner(store);

        const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
            pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(parameters));

        const rowsOf = (...values: unknown[]): Record<string, any> => ({ rows: values.map((s) => ({ s })) });

        const analyze = async (): Promise<void> => {
            if (store.type === DatabaseType.POSTGRES) {
                await pm.execute(new QuerySpecification(`ANALYZE ${GRAPH}_node`));
            } else {
                await pm.execute(
                    new QuerySpecification(
                        `BEGIN DBMS_STATS.GATHER_TABLE_STATS(USER, '${GRAPH.toUpperCase()}_NODE'); END;`
                    )
                );
            }
        };

        beforeAll(async () => {
            pm = sqlPersistenceManager(store, GRAPH);
            await query('RETURN 1');
            await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
            const gom = new StatelessGraphObjectManager(pm, backendFor(store.type, GRAPH), new ModelRegistry());
            await gom.constraints.ensure(uniquenessConstraint('Person', 'id'));
            await gom.constraints.ensure(uniquenessConstraint(IMPORT_LABEL, IMPORT_ID));
            await query(`UNWIND range(0, ${IMPORTED - 1}) AS k CREATE (:\`${IMPORT_LABEL}\` {\`${IMPORT_ID}\`: k})`);
            await query(`UNWIND range(0, ${NODES - 1}) AS k CREATE (:Person {id: 'p' + toString(k), k: k})`);
            await query(
                'CREATE (:Person {id: 7, k: -1}), (:Person {id: 8.0, k: -2}), (:Person {id: true, k: -3}), (:Person {id: [1, 2], k: -4})'
            );
            await query(
                "CREATE (:Person {id: ['a', 'b'], k: -5}), (:Person {id: [], k: -6}), (:Person {id: [1], k: -7}), (:Person {id: [[1, 2]], k: -8})"
            );
            await query(
                'CREATE (:Person {id: 0.1, k: -9}), (:Person {id: 1.0e20, k: -10}), (:Person {id: -7, k: -11}), (:Person {id: 0, k: -12})'
            );
            await query(
                "CREATE (:Person {id: '', k: -13}), (:Person {id: $big, k: -14}), (:Person {id: $long, k: -15})",
                {
                    big: BIG,
                    long: LONG
                }
            );
            await analyze();
        }, 900_000);

        afterAll(async () => {
            await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
            await closeGraphEngines();
        });

        it("finds for a row's value of each kind the nodes it is equal to, as JSON compares them", async () => {
            // 7.0 is 7, and 8 is 8.0, as in Cypher; a list, empty, of one item or of lists, is equal to the same list only, not
            // to its item or to its items in another order; null and a missing key are equal to nothing.
            const rows = [
                { s: 'p5' },
                { s: 7 },
                { s: float(7) },
                { s: 8 },
                { s: true },
                { s: [1, 2] },
                { s: null },
                {},
                { s: 'nobody' },
                { s: '7' },
                { s: ['a', 'b'] },
                { s: [] },
                { s: [1] },
                { s: [[1, 2]] },
                { s: [2, 1] },
                { s: 1 }
            ];
            const expected = [-8, -7, -6, -5, -4, -3, -2, -1, -1, 5];
            expect(
                await query('UNWIND $rows AS row MATCH (a:Person {id: row.s}) RETURN a.k ORDER BY a.k', { rows })
            ).toEqual(expected);
            // The same, compared in a WHERE.
            expect(
                await query('UNWIND $rows AS row MATCH (a:Person) WHERE a.id = row.s RETURN a.k ORDER BY a.k', { rows })
            ).toEqual(expected);
            // A list on its own: beside a null row, Oracle has been seen to plan the read otherwise and find lists it finds no other way.
            expect(
                await query(
                    'UNWIND $rows AS row MATCH (a:Person {id: row.s}) RETURN a.k ORDER BY a.k',
                    rowsOf([1, 2], [])
                )
            ).toEqual([-6, -4]);
        });

        it("finds for a row's number, empty text or long text the node it is equal to", async () => {
            // -0.0 is 0, as in Cypher. Oracle's index holds no text for an empty or a long one, which JSON_VALUE reads as null.
            const values = [0.1, 1.0e20, -7, float(-0), BIG, '', LONG];
            const statement = 'UNWIND $rows AS row MATCH (a:Person {id: row.s}) RETURN a.k ORDER BY a.k';
            expect(await query(statement, rowsOf(...values))).toEqual([-15, -14, -13, -12, -11, -10, -9]);
            // Each on its own, as rows that hold no list.
            const ks = [-9, -10, -11, -12, -14, -13, -15];
            for (let i = 0; i < values.length; i++) {
                expect([String(values[i]).slice(0, 20), await query(statement, rowsOf(values[i]))]).toEqual([
                    String(values[i]).slice(0, 20),
                    [ks[i]]
                ]);
            }
            // A parameter's or a written empty or long text.
            expect(await query('MATCH (a:Person {id: $s}) RETURN a.k', { s: '' })).toEqual([-13]);
            expect(await query("MATCH (a:Person {id: ''}) RETURN a.k")).toEqual([-13]);
            expect(await query('MATCH (a:Person {id: $s}) RETURN a.k', { s: LONG })).toEqual([-15]);
        });

        it('finds for a text the statement works out, or an item of a list it writes, the node it is equal to though empty or long', async () => {
            // Not an empty text worked out: on Oracle, a text function gives null for one, as SQL holds no empty text.
            expect(
                await query(
                    'UNWIND $rows AS row MATCH (a:Person {id: toString(row.s)}) RETURN a.k ORDER BY a.k',
                    rowsOf(LONG, 'p5')
                )
            ).toEqual([-15, 5]);
            expect(await query("UNWIND ['', 'p5'] AS s MATCH (a:Person {id: s}) RETURN a.k ORDER BY a.k")).toEqual([
                -13, 5
            ]);
        });

        it("finds for each row of a list the statement writes what it is equal to, a list, a parameter's list or a function's among them", async () => {
            expect(
                await query(
                    "UNWIND [{s: 'p5'}, {s: [1, 2]}, {s: $l}, {s: range(7, 8)}] AS row MATCH (a:Person {id: row.s}) RETURN a.k ORDER BY a.k",
                    { l: [] }
                )
            ).toEqual([-6, -4, 5]);
            expect(
                await query("UNWIND [{s: 'p5'}, {s: $l}] AS row MATCH (a:Person {id: row.s}) RETURN a.k ORDER BY a.k", {
                    l: [1, 2]
                })
            ).toEqual([-4, 5]);
            expect(await query("UNWIND [[1, 2], 'p5'] AS s MATCH (a:Person {id: s}) RETURN a.k ORDER BY a.k")).toEqual([
                -4, 5
            ]);
            expect(
                await query(
                    "UNWIND [{s: datetime('2024-03-15T10:00:00Z')}, {s: range(1, 2)}] AS row MATCH (a:Person {id: row.s}) RETURN a.k"
                )
            ).toEqual([-4]);
            expect(
                await query(
                    "UNWIND [{s: 'p5'}, {s: null}, {t: [1, 2]}, {s: 7.5}] AS row MATCH (a:Person {id: row.s}) RETURN a.k"
                )
            ).toEqual([5]);
            // The items themselves, of a parameter's list or of one written, and parameters that hold no list among literals.
            const scalars = { ids: ['p5', float(7), 8, true, BIG, null, 0.1], a: float(7), b: 8, c: true, d: BIG };
            const found = [-14, -9, -3, -2, -1, 5];
            const withoutTenth = found.filter((it) => it !== -9);
            expect(await query('UNWIND $ids AS id MATCH (a:Person {id: id}) RETURN a.k ORDER BY a.k', scalars)).toEqual(
                found
            );
            expect(
                await query(
                    "UNWIND [$a, $b, $c, $d, 'p5'] AS s MATCH (a:Person {id: s}) RETURN a.k ORDER BY a.k",
                    scalars
                )
            ).toEqual(withoutTenth);
            expect(
                await query(
                    "UNWIND [{s: $a}, {s: $b}, {s: $c}, {s: $d}, {s: 'p5'}] AS row MATCH (a:Person {id: row.s}) RETURN a.k ORDER BY a.k",
                    scalars
                )
            ).toEqual(withoutTenth);
            expect(
                await query('UNWIND $ids AS id MATCH (a:Person {id: id}) RETURN a.k ORDER BY a.k', {
                    ids: ['p5', [1, 2], []]
                })
            ).toEqual([-6, -4, 5]);
            // Rows that hold no list or null, as a parameter's.
            expect(
                await query('UNWIND $ids AS id MATCH (a:Person {id: id}) RETURN a.k ORDER BY a.k', {
                    ids: ['p5', float(7), 8, true, BIG, 0.1]
                })
            ).toEqual(found);
        });

        it('finds for a key of a map a row holds what it is equal to, where the map is missing, null or holds a list', async () => {
            const statement = 'UNWIND $rows AS row MATCH (a:Person {id: row.a.b}) RETURN a.k ORDER BY a.k';
            const lists = [{ a: { b: 'p5' } }, { a: { b: [1, 2] } }, { a: null }, {}, { a: {} }];
            expect(await query(statement, { rows: lists })).toEqual([-4, 5]);
            expect(await query(statement, { rows: [{ a: { b: 'p5' } }, { a: null }, {}, { a: { c: [1] } }] })).toEqual([
                5
            ]);
            expect(await query(statement, { rows: [{ a: { b: 'p5' } }, {}, { a: { c: [1] } }] })).toEqual([5]);
            // A key read of a list or a text, which Neo4j refuses: what the comparison alone gives, as a WHERE compares it.
            const where = 'UNWIND $rows AS row MATCH (a:Person) WHERE a.id = row.a.b RETURN a.k ORDER BY a.k';
            const odd = { rows: [{ a: [{ b: [1, 2] }] }, { a: 'text' }, { a: { b: 'p5' } }] };
            expect(await query(statement, odd)).toEqual(await query(where, odd));
        });

        it('finds for a truth value or a number no text that looks like it, nor for a text the truth value or number, by = or its reverse or by not-equal', async () => {
            await query(
                "CREATE (:Odd {id: 'true', k: 1}), (:Odd {id: true, k: 2}), (:Odd {id: '7', k: 3}), (:Odd {id: 7, k: 4})"
            );
            const rows = { rows: [true, 'true', 7, '7', null, float(7)].map((s, i) => ({ i, s })) };
            const equal = [2, 11, 24, 33, 54];
            const p = 'RETURN row.i * 10 + a.k AS p ORDER BY p';
            expect(await query(`UNWIND $rows AS row MATCH (a:Odd {id: row.s}) ${p}`, rows)).toEqual(equal);
            expect(await query(`UNWIND $rows AS row MATCH (a:Odd) WHERE a.id = row.s ${p}`, rows)).toEqual(equal);
            expect(await query(`UNWIND $rows AS row MATCH (a:Odd) WHERE row.s = a.id ${p}`, rows)).toEqual(equal);
            // Not equal: a null row is equal to nothing and unequal to nothing.
            const unequal = [1, 3, 4, 12, 13, 14, 21, 22, 23, 31, 32, 34, 51, 52, 53];
            expect(await query(`UNWIND $rows AS row MATCH (a:Odd) WHERE a.id <> row.s ${p}`, rows)).toEqual(unequal);
            expect(await query(`UNWIND $rows AS row MATCH (a:Odd) WHERE NOT a.id = row.s ${p}`, rows)).toEqual(unequal);
            // The same rows with no null among them, which are compared through the index.
            const noNull = { rows: [true, 'true', 7, '7', float(7)].map((s, i) => ({ i, s })) };
            expect(await query(`UNWIND $rows AS row MATCH (a:Odd {id: row.s}) ${p}`, noNull)).toEqual([
                2, 11, 24, 33, 44
            ]);
            expect(await query(`UNWIND $rows AS row MATCH (a:Odd) WHERE a.id <> row.s ${p}`, noNull)).toEqual([
                1, 3, 4, 12, 13, 14, 21, 22, 23, 31, 32, 34, 41, 42, 43
            ]);
        });

        it('finds with a MERGE of each row the node it is equal to, and makes none', async () => {
            const rows = rowsOf('p3', float(7), 8, [1, 2], true, 0.1, '');
            expect(
                await query('UNWIND $rows AS row MERGE (a:Person {id: row.s}) RETURN a.k ORDER BY a.k', rows)
            ).toEqual([-13, -9, -4, -3, -2, -1, 3]);
            expect(await query('MATCH (a:Person) RETURN count(a)')).toEqual([NODES + 15]);
        });

        it("finds a node at a relationship's end by a row's or a parameter's value", async () => {
            await query("MATCH (a:Person {id: 'p10'}), (b:Person {id: 'p11'}) CREATE (a)-[:LINKS]->(b)");
            expect(await query('MATCH (a:Person)-[:LINKS]->(b:Person {id: $s}) RETURN a.k', { s: 'p11' })).toEqual([
                10
            ]);
            expect(await query("MATCH (a:Person)-[:LINKS]->(b:Person {id: 'p11'}) RETURN a.k")).toEqual([10]);
            expect(
                await query(
                    'UNWIND $rows AS row MATCH (a:Person)-[:LINKS]->(b:Person {id: row.s}) RETURN a.k',
                    rowsOf('p11', 'p12')
                )
            ).toEqual([10]);
            expect(await query('MATCH (a:Person)-[:LINKS]->(b:Person {id: $s}) RETURN count(a)', { s: 'p12' })).toEqual(
                [0]
            );
        });

        it('finds the node of each row of an UNWIND through the index, not by reading every node of the label', async () => {
            const rows = {
                rows: Array.from({ length: 100 }, (_, i) => ({ s: `p${i * 7}`, d: `p${i * 7 + 1}` })),
                ids: Array.from({ length: 100 }, (_, i) => `p${i * 7}`)
            };
            const statements = [
                'UNWIND $rows AS row MATCH (a:Person {id: row.s}) RETURN a.k',
                'UNWIND $ids AS id MATCH (a:Person {id: id}) RETURN a.k',
                'UNWIND $rows AS row MATCH (a:Person {id: row.s}) MATCH (b:Person {id: row.d}) RETURN a.k, b.k',
                ...(planner.whereProbesIndex
                    ? ['UNWIND $rows AS row MATCH (a:Person) WHERE a.id = row.s RETURN a.k']
                    : [])
            ];
            for (const statement of statements) {
                const plan = await planner.plan(planner.compiled(statement, rows));
                // The whole plan where it doesn't: a diff of it shows only the lines about the change.
                expect(planner.probesIndex(plan) ? statement : `${statement}\n${plan}`).toEqual(statement);
            }
            expect(await query('UNWIND $rows AS row MATCH (a:Person {id: row.s}) RETURN count(a)', rows)).toEqual([
                100
            ]);
        });

        it("finds for a row's number a node whose number the store keeps with more zeros after its point", async () => {
            // Postgres's numeric keeps the scale a product makes: 0.25 * 10 is 2.50, 2.0 * 2.0 is 4.00, and 1.0E-5 is 0.000010.
            await query(
                'CREATE (:Scaled {id: 0.25 * 10, k: 1}), (:Scaled {id: 0.25 * 4, k: 2}), (:Scaled {id: 2.0 * 2.0, k: 3}), (:Scaled {id: 1.0E-5, k: 4}), (:Scaled {id: [1.0, 2.50], k: 5})'
            );
            const cases: [unknown[], number[]][] = [
                [
                    [2.5, 1, 4, 0.00001],
                    [1, 2, 3, 4]
                ],
                [
                    [float(1), float(4)],
                    [2, 3]
                ],
                [[[1, 2.5]], [5]]
            ];
            for (const [values, expected] of cases) {
                const bound = rowsOf(...values);
                expect([
                    values,
                    await query('UNWIND $rows AS row MATCH (a:Scaled {id: row.s}) RETURN a.k ORDER BY a.k', bound)
                ]).toEqual([values, expected]);
                expect([
                    values,
                    await query(
                        'UNWIND $rows AS row MATCH (a:Scaled) WHERE a.id = row.s RETURN a.k ORDER BY a.k',
                        bound
                    )
                ]).toEqual([values, expected]);
            }
        });

        it("finds, with the same statement given rows with no list and then rows with one, the list's node the second time", async () => {
            // A statement is compiled for the rows it is given: one whose rows hold no list at the key leaves out the test that
            // lets a list through, and is no statement compiled for rows that do. No compiled statement is kept by its text.
            const statement = 'UNWIND $rows AS row MATCH (a:Person {id: row.s}) RETURN a.k ORDER BY a.k';
            expect(await query(statement, rowsOf('p5'))).toEqual([5]);
            expect(await query(statement, rowsOf('p5', [1, 2]))).toEqual([-4, 5]);
            expect(await query(statement, rowsOf('p5'))).toEqual([5]);
        });

        it('makes a relationship for each row between the nodes the row names', async () => {
            const rows = { rows: Array.from({ length: 50 }, (_, i) => ({ s: `p${i}`, d: `p${i + 1}` })) };
            await query(
                'UNWIND $rows AS row MATCH (a:Person {id: row.s}) MATCH (b:Person {id: row.d}) CREATE (a)-[:FOLLOWS]->(b)',
                rows
            );
            expect(await query('MATCH (:Person)-[r:FOLLOWS]->(:Person) RETURN count(r)')).toEqual([50]);
            expect(await query("MATCH (a:Person {id: 'p0'})-[:FOLLOWS]->(b) RETURN [a.k, b.k]")).toEqual([[0, 1]]);
        });

        /** A batch of relationships as `apoc.export.cypher` writes it: its rows written out, its key a name of spaces. */
        const apocBatch = (
            from: number,
            to: number,
            write: string = 'CREATE (start)-[r:NEXT_CHUNK]->(finish) SET r += row.properties'
        ): string =>
            `UNWIND [${Array.from(
                { length: to - from },
                (_, i) => `{start: {_id: ${from + i}}, end: {_id: ${from + i + 1}}, properties: {}}`
            ).join(', ')}] AS row ` +
            `MATCH (start:\`${IMPORT_LABEL}\` {\`${IMPORT_ID}\`: row.start._id}) ` +
            `MATCH (finish:\`${IMPORT_LABEL}\` {\`${IMPORT_ID}\`: row.end._id}) ${write}`;

        it('finds the nodes of each row of a batch of relationships as APOC exports it, through the index on a key of spaces', async () => {
            // Its reads, planned as a query: a write compiles to a procedure, which no EXPLAIN takes.
            const plan = await planner.plan(planner.compiled(apocBatch(0, 20, 'RETURN start, finish'), {}));
            expect(planner.probesIndex(plan) ? 'probes' : plan).toEqual('probes');
            // Not on Oracle: the connection compiles with no index named (liberation-data/drivine4j#638), and a batch of 20
            // took 231 s there over 2,000 nodes of the label (#636).
            if (store.type === DatabaseType.ORACLE) {
                return;
            }
            await query(apocBatch(0, 20));
            await query(apocBatch(20, 40));
            expect(
                await query(`MATCH (:\`${IMPORT_LABEL}\`)-[r:NEXT_CHUNK]->(:\`${IMPORT_LABEL}\`) RETURN count(r)`)
            ).toEqual([40]);
            expect(
                await query(
                    `MATCH (a)-[:NEXT_CHUNK]->(b {\`${IMPORT_ID}\`: 40}) RETURN [a.\`${IMPORT_ID}\`, b.\`${IMPORT_ID}\`]`
                )
            ).toEqual([[39, 40]]);
        });

        it("finds the node of a parameter's text through the index", async () => {
            const plan = await planner.plan(planner.compiled('MATCH (a:Person {id: $s}) RETURN a.k', { s: 'p42' }));
            expect(planner.probesIndex(plan) ? 'probes' : plan).toEqual('probes');
            expect(await query('MATCH (a:Person {id: $s}) RETURN a.k', { s: 'p42' })).toEqual([42]);
        });
    }
);
