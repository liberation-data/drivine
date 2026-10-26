import neo4j from 'neo4j-driver';
import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    PersistenceManager,
    PersistenceManagerFactory,
    PostgresGraph,
    QuerySpecification,
    Stamps,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { DrivineTestContainers, Environment } from '@/testing';
import { check, loadSpec, runsOn, skipped, trimIndent, valuesFor } from '../../cypher/CypherSpec';

jest.setTimeout(120_000);

/** The graph the spec writes on a SQL store: tables of its own, so no other suite's nodes are among its rows. */
const GRAPH = 'cypher';

/**
 * The Neo4j the spec runs on, `neo4j:latest` as in drivine4j, so a new Neo4j that gives other rows shows up at once.
 * It is a container of its own: the spec's statements match labels other suites write (`Person`, `Movie`), and Neo4j
 * 5, which the other suites run on when `NEO4J_TEST_IMAGE` names it, refuses two of them (a date added to a text, and
 * an order by an aggregate of a variable no item names). `CYPHER_SPEC_NEO4J_IMAGE` picks another.
 */
const SPEC_NEO4J_IMAGE = process.env.CYPHER_SPEC_NEO4J_IMAGE ?? 'neo4j:latest';

/** The container of the spec's Neo4j, where it started one. */
let neo4jContainer: DrivineTestContainers | undefined;

/** A store the spec runs on: its name in the spec, and how a statement and the graph are run there. */
interface Store {
    name: string;
    type: DatabaseType;
    /** The registry's name for its connection, and the one it is built from. */
    connection: string;
    from?: string;
}

/**
 * The stores configured in the environment: Neo4j, the default connection; Postgres; and Oracle with ORACLE_TESTS=true.
 * On a SQL store each statement is compiled to SQL over the graph's tables.
 */
function stores(): Store[] {
    return [
        ...(process.env.DATABASE_TYPE === 'NEO4J'
            ? [{ name: 'neo4j', type: DatabaseType.NEO4J, connection: 'CYPHER_NEO4J' }]
            : []),
        ...(process.env.POSTGRES_DATABASE_TYPE === 'POSTGRES'
            ? [{ name: 'postgres', type: DatabaseType.POSTGRES, connection: 'CYPHER_POSTGRES', from: 'POSTGRES' }]
            : []),
        ...(process.env.ORACLE_DATABASE_TYPE === 'ORACLE'
            ? [{ name: 'oracle', type: DatabaseType.ORACLE, connection: 'CYPHER_ORACLE', from: 'ORACLE' }]
            : [])
    ];
}

/** A persistence manager for the store, over the spec's own graph on a SQL store. */
async function managerFor(store: Store): Promise<PersistenceManager> {
    const registry = DatabaseRegistry.getInstance();
    if (store.from) {
        registry
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv(store.from), defaultGraphPath: GRAPH })
            .register(store.connection);
    } else {
        await startNeo4j();
        DatabaseRegistry.buildOrResolveFromEnv(store.connection);
    }
    const pm = new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance()).get(
        store.connection,
        'NON_TRANSACTIONAL'
    );
    // Oracle's connection makes the graph's tables; on Postgres, an object manager does, so here the spec does.
    if (store.type === DatabaseType.POSTGRES) {
        await pm.execute(new QuerySpecification(new PostgresGraph(GRAPH).ensuring));
    }
    return pm;
}

/**
 * Points the CYPHER_NEO4J datasource at the spec's Neo4j: a container of {@link SPEC_NEO4J_IMAGE}, or with
 * USE_LOCAL_NEO4J=true the default datasource's instance, as it is.
 */
async function startNeo4j(): Promise<void> {
    const env: Environment = {
        CYPHER_NEO4J_DATABASE_TYPE: 'NEO4J',
        NEO4J_TEST_IMAGE: SPEC_NEO4J_IMAGE,
        USE_LOCAL_NEO4J: process.env.USE_LOCAL_NEO4J
    };
    if (env.USE_LOCAL_NEO4J === 'true') {
        Object.keys(process.env)
            .filter((key) => key.startsWith('DATABASE_'))
            .forEach((key) => (env[`CYPHER_NEO4J_${key}`] = process.env[key]));
    } else {
        neo4jContainer = await DrivineTestContainers.start(env);
    }
    Object.keys(env)
        .filter((key) => key.startsWith('CYPHER_NEO4J_'))
        .forEach((key) => (process.env[key] = env[key]));
}

/**
 * A step's parameters as the store takes them. Neo4j keeps a whole number apart from a float, and the driver sends a
 * JavaScript number as a float, so a whole number the spec writes is sent as an integer, as drivine4j sends a Long; a
 * SQL store binds every parameter as JSON, where it is the number it is.
 */
function parametersFor(store: Store, parameters: Record<string, any>): Record<string, any> {
    return valuesFor(parameters, (it) => (store.type === DatabaseType.NEO4J ? neo4j.int(it.toString()) : Number(it)));
}

/**
 * A Cypher statement written for a graph engine runs on a SQL store, compiled to its SQL, and gives the same rows: the
 * spec's statements (`test/cypher`), run on Neo4j, Postgres and Oracle, give the rows it says on each.
 */
describe.each(stores().map((it) => [it.name, it] as const))('The Cypher spec on %s', (_, store) => {
    let pm: PersistenceManager;

    beforeAll(async () => {
        pm = await managerFor(store);
    }, 300_000);

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        await neo4jContainer?.stop();
    });

    const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
        pm.query(
            new QuerySpecification({ text: trimIndent(cypher), language: 'CYPHER' }).bind(
                parametersFor(store, parameters)
            )
        );

    /**
     * Empties the whole graph, as the spec's README asks, and not just the nodes of the file's label: its statements
     * match plain labels (`MATCH (p:Person)`), so a node anything else left would be among their rows. On a SQL store
     * a node's edges go with it.
     */
    const clear = async (): Promise<void> => {
        if (store.type === DatabaseType.NEO4J) {
            await pm.execute(new QuerySpecification('MATCH (n) DETACH DELETE n'));
        } else {
            await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        }
    };

    describe.each(['queries.yaml', 'writes.yaml', 'temporal.yaml'])('%s', (file) => {
        const spec = loadSpec(file);
        it.each(spec.cases.map((it) => [it.name, it] as const))('%s', async (__, cypherCase) => {
            await clear();
            if (spec.graph) {
                await query(spec.graph);
            }
            for (let i = 0; i < cypherCase.steps.length; i++) {
                if (runsOn(cypherCase.steps[i], store.name) && !skipped(file, cypherCase, i, store.name)) {
                    await check(cypherCase, i, store.name, async (step) => query(step.cypher, step.parameters ?? {}));
                }
            }
        });
    });

    /**
     * Lists and maps that hold a null, compared as Cypher compares them, on every store: drivine4j's own tests of
     * liberation-data/drivine4j#225, ported for liberation-data/drivine#290. They sit beside the spec's cases of it
     * since v0.6.6.
     */
    describe('lists and maps that hold a null', () => {
        const seed = async (): Promise<void> => {
            await clear();
            await query(loadSpec('queries.yaml').graph!);
        };

        it('compare item by item, null where no pair differs', async () => {
            // Cypher compares a list or a map item by item, so a null it holds makes the comparison null.
            expect(await query('RETURN [[null] = [null], {x: null} = {x: null}, [null, 1] = [null, 1]]')).toEqual([
                [null, null, null]
            ]);
            expect(await query('RETURN [[1, null] = [2, null], [1, 2] = [1], [null] = [null, null], [] = []]')).toEqual([
                [false, false, false, true]
            ]);
            expect(await query('RETURN [[null] <> [null], [1, null] <> [2, null], [null, 1] <> [null, 1]]')).toEqual([
                [null, true, null]
            ]);
            expect(
                await query(
                    'RETURN [{x: null} = {y: null}, {x: 1, y: null} = {x: 2, y: null}, {x: null} = {x: 1}, {x: null} = {}, {a: 1} = {a: 1, b: null}]'
                )
            ).toEqual([[false, false, null, false, false]]);
            expect(
                await query(
                    'RETURN [[[null]] = [[null]], [[1, null]] = [[2, null]], [{x: null}] = [{x: null}], {a: [null]} = {a: [null]}, [1, [null]] = [2, [null]], [[null], 1] = [[null], 2]]'
                )
            ).toEqual([[null, false, null, null, false, false]]);
            expect(
                await query(
                    "RETURN [[1] = ['1'], [null] = [1], [[1]] = [1], [null, 'a'] = [1, 'b'], [1] = [1.0], [null] = [[1]], [null] = [{x: 1}], [null, 1] = [1, null]]"
                )
            ).toEqual([[false, null, false, false, true, null, null, null]]);
            expect(await query("RETURN CASE [null] WHEN [null] THEN 'y' ELSE 'n' END")).toEqual(['n']);
            // Lists that hold no null compare as before.
            expect(
                await query(
                    "RETURN [[1, 2] = [1, 2], [1, 2] <> [1, 3], {x: 1} = {x: 1}, 'a' IN ['a', 'b'], 'c' IN ['a', 'b']]"
                )
            ).toEqual([[true, true, true, true, false]]);
        });

        it('IN compares a value with each item as equality does', async () => {
            // True where an item is equal, else null where a comparison is null, else false.
            await seed();
            // A node with no name is in no list of names, nor out of one: NOT keeps it no more than the IN does.
            expect(
                await query(
                    "MATCH (n:CyTest) WHERE NOT (n.name IN ['Keanu']) RETURN count(*) UNION ALL MATCH (n:CyTest) WHERE n.name IN ['Keanu'] AND n.born > 0 OR n.name IN $x RETURN count(*)",
                    { x: [] }
                )
            ).toEqual([3, 1]);
            // A quantifier keeps an item where its condition is true, so one with no name is in all of no list of names.
            expect(await query("MATCH (n:CyTest) WHERE all(x IN [1] WHERE n.name IN ['Keanu']) RETURN count(*)")).toEqual([
                1
            ]);
            expect(
                await query(
                    'RETURN [null IN [null], [null] IN [[null]], 1 IN [null], 1 IN [1, null], 2 IN [1, null], null IN [], [null] IN [[1, 2]], ' +
                        '[null] IN [[1]], [1, null] IN [[2, null]], [1] IN [[1], null], {x: null} IN [{x: null}], [1] IN [[2], null], [1] IN [[null]], null IN [1]]'
                )
            ).toEqual([[null, null, null, true, null, false, false, null, false, true, null, null, null, null]]);
            expect(
                await query('RETURN [$x IN $l, 2 IN $l, $a IN $ls, $a IN [[2, null]], 1 IN $n]', {
                    x: null,
                    l: [1, 2],
                    a: [1, null],
                    ls: [[1, null], [3]],
                    n: null
                })
            ).toEqual([[null, true, null, false, null]]);
            // Read by a WHERE, a null is in no list that holds one: JSON's null is equal to such an item as JSON.
            const nulls = { x: null, l: [null, 2], m: { x: null } };
            expect(await query('UNWIND [1] AS i WITH i WHERE $x IN $l RETURN i', nulls)).toEqual([]);
            expect(await query('UNWIND [1] AS i WITH i WHERE null IN $l OR $m.x IN $l RETURN i', nulls)).toEqual([]);
            expect(await query('RETURN [x IN [1] WHERE null IN $l OR $m.x IN $l]', nulls)).toEqual([[]]);
        });

        it('compare item by item where neither side is written out', async () => {
            // Parameters, values carried by a WITH and collected lists are compared as they are at run time.
            expect(
                await query('RETURN [$a = $b, $a = $c, $a IN [$b], $a IN $l, $m = $n, $p = $p]', {
                    a: [1, null],
                    b: [1, null],
                    c: [2, null],
                    l: [[1, null], [3]],
                    m: { x: null },
                    n: { x: 1 },
                    p: [1, 2]
                })
            ).toEqual([[null, false, null, null, null, true]]);
            expect(
                await query(
                    'WITH [1, null] AS a, [1, null] AS b, [2, null] AS c, [null, 1] AS d RETURN [a = b, a = c, a <> c, a = d, a IN [b, c], a IN [c]]'
                )
            ).toEqual([[null, false, true, null, null, false]]);
            expect(
                await query(
                    'WITH [[null], 1] AS a, [[null], 2] AS b, {k: [null]} AS m, {k: [1]} AS n, {k: [1], j: 2} AS o RETURN [a = b, m = n, m = m, m = o, n = n]'
                )
            ).toEqual([[false, null, null, false, true]]);
            expect(
                await query(
                    'UNWIND [[1, null], [2, null]] AS l WITH collect(l) AS ls RETURN [ls = [[1, null], [2, null]], ls[0] = ls[1], ls[0] IN ls]'
                )
            ).toEqual([[null, false, null]]);
            expect(
                await query('UNWIND [[1, null], [2, null], [3]] AS l WITH l WHERE l = [1, null] OR l = [3] RETURN l')
            ).toEqual([[3]]);
            // A parameter's list compared item by item as the statement is compiled, at any depth.
            expect(
                await query(
                    'UNWIND [[1, [2, 3]], [1, [2]], 5] AS l WITH collect(l) AS ls RETURN [ls[0] = $p, ls[1] = $p, ls[2] = $p, $p = ls[0], ls[0] <> $q, $q = ls[1]]',
                    { p: [null, [2, 3]], q: [1, [null, 4]] }
                )
            ).toEqual([[null, false, false, null, true, false]]);
        });

        it("find a null a value holds, not one its text spells, at any length and in a reduce's step", async () => {
            // Oracle reads whether a value holds a null from its JSON's text.
            expect(
                await query(
                    String.raw`UNWIND ['a,null]', 'x:null}', 'null', 'a\",null]', 'é😀\",null]', 'a\\'] AS s WITH s, [s] AS v, [[s]] AS l, {k: s} AS m, [{k: s}] AS ms RETURN [v IN l, v = [s], m IN ms]`
                )
            ).toEqual(Array.from({ length: 6 }, () => [true, true, true]));
            // A text that ends in a backslash ends where its quote does.
            expect(
                await query(
                    String.raw`UNWIND ['a\\'] AS s WITH s, [s, ',null]'] AS v RETURN [v = [s, ',null]'], v IN [[s, ',null]']]]`
                )
            ).toEqual([[true, true]]);
            const long = "[x IN range(1, 600) | 'abcdefghij']";
            expect(
                await query(`WITH ${long} AS v, ${long} AS w, [${long}] AS l RETURN [v = w, v IN l, v <> w]`)
            ).toEqual([[true, true, false]]);
            // A long value that holds a null is read whole, so the null is found.
            expect(
                await query(
                    `WITH ${long} + [null] AS v, ${long} + [null] AS w, [${long} + [null]] AS l, ['z'] + ${long} + [null] AS u RETURN [v = w, v IN l, v <> w, v = u]`
                )
            ).toEqual([[null, null, null, false]]);
            // A text past 32 KB beside a null is compared whole.
            expect(
                await query("WITH [null, $t] AS a, [null, $t] AS b, [null, $t + 'y'] AS c RETURN [a = b, a = c]", {
                    t: 'x'.repeat(40000)
                })
            ).toEqual([[null, false]]);
            // In the step of a reduce, as in a statement that writes, on Oracle.
            expect(
                await query(
                    "WITH [1, null] AS a, [2, null] AS c RETURN reduce(acc = [], x IN [a, c] | acc + [coalesce(x = a, 'null')])"
                )
            ).toEqual([['null', false]]);
            expect(
                await query(
                    "UNWIND ['a,null]'] AS s WITH s, [s] AS v, [[s]] AS l RETURN reduce(acc = [], x IN [v] | acc + [x = [s], x IN l])"
                )
            ).toEqual([[true, true]]);
        });

        it('a null node or relationship in a list or a map makes its comparison null', async () => {
            // A node or a relationship OPTIONAL MATCH finds none of is null in what holds it.
            await seed();
            expect(
                await query(
                    'OPTIONAL MATCH (x:Nope)-[r]->() RETURN [[r] = [r], {x: r} = {x: r}, [r] <> [r], r IN [r], [r] IN [[r]], x IN [x], [x] = [x], {x: x} = {x: x}, [r, 1] = [r, 2]]'
                )
            ).toEqual([[null, null, null, null, null, null, null, null, false]]);
            expect(
                await query(
                    "MATCH (:Person {name: 'Keanu'})-[r1:KNOWS]->() OPTIONAL MATCH (:Person {name: 'Hugo'})-[r2:KNOWS]->() " +
                        'WITH r1, r2, [r1, r2] AS a, {x: r2} AS m ' +
                        'RETURN [[r1, r2] = [r1, r2], {a: r1, b: r2} = {a: r1, b: r2}, a = a, m = m, a = [r1, r1], r1 IN [r2], a = [r1]]'
                )
            ).toEqual([[null, null, null, null, null, null, false]]);
        });

        it('compare in a statement that writes, on Oracle as null where equal as JSON and else false', async () => {
            // On Oracle a procedure calls no function of its own, so values that differ as JSON are false there.
            await clear();
            expect(
                await query(
                    "CREATE (n:CyNullEquality) WITH n, [1, null] AS a, [1, null] AS b, [2, null] AS c SET n.same = coalesce(a = b, 'null'), n.other = a = c, n.unequal = a <> c RETURN [n.same, n.other, n.unequal]"
                )
            ).toEqual([['null', false, true]]);
            // Values that hold no null compare as before, a text that holds a null's text and a long value among them.
            const long = "[x IN range(1, 600) | 'abcdefghij']";
            expect(
                await query(
                    `UNWIND ['a,null]'] AS s WITH s, [s] AS v, [[s]] AS l, ${long} AS w, [${long}] AS ws CREATE (n:CyNullEquality) SET n.eq = v = [s], n.in = v IN l, n.longEq = w = ${long}, n.longIn = w IN ws RETURN [n.eq, n.in, n.longEq, n.longIn]`
                )
            ).toEqual([[true, true, true, true]]);
            // Lists written out are compared item by item, on Oracle too.
            expect(
                await query("CREATE (n:CyNullEquality) SET n.eq = coalesce([null] = [1], 'null') RETURN n.eq")
            ).toEqual(['null']);
            // Values that differ as JSON are false on Oracle, as the README says, where Cypher's comparison is null.
            expect(
                await query(
                    "CREATE (n:CyNullEquality) WITH n, [null] AS a, [1] AS b SET n.eq = coalesce(a = b, 'null') RETURN n.eq"
                )
            ).toEqual([store.type === DatabaseType.ORACLE ? false : 'null']);
        });
    });
});

/**
 * What the spec cannot say, on a SQL store, as drivine4j's own tests say it: values that change on every run, a
 * parameter of JavaScript's own date, a statement built in code, and a transaction rolled back on a connection of its
 * own.
 */
describe.each(stores().filter((it) => it.type !== DatabaseType.NEO4J).map((it) => [it.name, it] as const))(
    'Cypher compiled on %s',
    (_, store) => {
        let pm: PersistenceManager;

        const query = async (cypher: string, parameters: Record<string, any> = {}): Promise<any[]> =>
            pm.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }).bind(parameters));

        beforeAll(async () => {
            pm = await managerFor(store);
        }, 300_000);

        beforeEach(async () => {
            await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        });

        afterAll(async () => {
            await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
            DatabaseRegistry.tearDown();
        });

        it('randomUUID gives a new UUID each time', async () => {
            const [a, b] = await query('UNWIND [1, 2] AS x RETURN randomUUID()');
            expect(a).not.toEqual(b);
            expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        });

        it('toString of a float that is a whole number keeps its fraction, as in Cypher', async () => {
            // Not in the spec, whose case binds the float as a parameter, which a JavaScript number cannot keep a float.
            // Oracle writes a double of 2 as 2 (liberation-data/drivine#243).
            const [row] = await query(
                'RETURN [toString(2.0), toString(2.5), toString(1.5 * 2), toString(7), toString(-3.0)]'
            );
            expect(row).toEqual(['2.0', '2.5', '3.0', '7', '-3.0']);
            expect(await query("RETURN toString('a')")).toEqual(['a']);
            // A float too small for Oracle's NUMBER, which reads it as 0, a whole number.
            expect(Number((await query('RETURN toString(1.0E-200)'))[0])).toEqual(1e-200);
        });

        it('round() reads a precision from data, or a whole float, as a whole number toward zero, and a null as null', async () => {
            // Beyond the spec's round() cases: a float, -0.5 and a whole float read from data, and every rounding mode.
            await query('CREATE (:Round {p: 1.7, q: -0.5, w: 2.0, r: -2})');
            expect(
                await query(
                    "MATCH (n:Round) RETURN [round(2.555, n.p), round(2.55, n.p, 'UP'), round(2.5, n.q), round(2.5, n.q, 'HALF_UP'), round(2.555, n.w), round(2.555, 2.0, 'HALF_UP')]"
                )
            ).toEqual([[2.6, 2.6, 3.0, 3.0, 2.56, 2.56]]);
            expect(
                await query(
                    "RETURN [round(2.5, 0, 'HALF_UP'), round(-2.5, 0, 'HALF_EVEN'), round(2.5, 0, 'DOWN'), round(2.1, 0, 'CEILING'), round(2.9, 0, 'FLOOR'), round(-2.1, 0, 'UP')]"
                )
            ).toEqual([[3.0, -2.0, 2.0, 3.0, 2.0, -3.0]]);
            expect(
                await query("RETURN [round(null, 2), round(2.5, null), round(null, 2, 'UP'), round(2.5, null, 'UP')]")
            ).toEqual([[null, null, null, null]]);
            // A negative precision from data fails when the row is read, as on Neo4j, in both forms.
            await expect(query("MATCH (n:Round) RETURN round(1234.5, n.r, 'HALF_UP')")).rejects.toThrow(
                'round() takes a precision of 0 or more'
            );
            await expect(query('MATCH (n:Round) RETURN round(1234.5, n.r)')).rejects.toThrow(
                'round() takes a precision of 0 or more'
            );
            if (store.type !== DatabaseType.ORACLE) {
                // Oracle overflows on a precision past its NUMBER range, as in drivine4j (liberation-data/drivine4j#266).
                expect(
                    await query("RETURN [round(2.5, 400), round(2.5, 400, 'HALF_UP'), round(2.5, 400, 'CEILING')]")
                ).toEqual([[2.5, 2.5, 2.5]]);
            }
        });

        it("a negative precision from data fails only on a row that reads it, in a WHERE and an aggregate too, with the compiler's message", async () => {
            // The spec reads a precision from data since v0.6.4; here, in a WHERE and an aggregate, and on rows filtered out.
            await query('CREATE (:Round {r: -2, k: 1}), (:Round {r: 1, k: 2})');
            for (const statement of [
                'MATCH (n:Round) RETURN round(1234.5, n.r)',
                'MATCH (n:Round) WHERE round(1234.5, n.r) > 0 RETURN n.k',
                'MATCH (n:Round) RETURN sum(round(1234.5, n.r))',
                "MATCH (n:Round) RETURN collect(round(1234.5, n.r, 'HALF_UP'))",
                // A constant the compiler does not read as given is worked out by the store, as one from data.
                'RETURN round(1234.5, 1 - 3)',
                "RETURN round(1234.5, toInteger('-2'))"
            ]) {
                await expect(query(statement)).rejects.toThrow('round() takes a precision of 0 or more, as in Neo4j.');
            }
            expect(await query('MATCH (n:Round) WHERE n.r >= 0 RETURN round(1234.5, n.r)')).toEqual([1234.5]);
            expect(await query('MATCH (n:Nothing) RETURN round(1234.5, 1 - 3)')).toEqual([]);
            expect(await query('UNWIND [] AS x RETURN round(1234.5, 1 - 3)')).toEqual([]);
            expect(await query("MATCH (n:Round) WHERE n.k > 5 RETURN round(1234.5, toInteger('-2'))")).toEqual([]);
            expect(await query('MATCH (n:Round) WHERE n.k = 2 RETURN sum(round(1234.5, n.r))')).toEqual([1234.5]);
            expect(
                await query(
                    'MATCH (n:Round) RETURN CASE WHEN n.r < 0 THEN 0.0 ELSE round(1234.5, n.r) END ORDER BY n.k'
                )
            ).toEqual([0.0, 1234.5]);
            expect(await query("RETURN [round(1234.5, 3 - 1), round(1234.5, toInteger('2'))]")).toEqual([
                [1234.5, 1234.5]
            ]);
        });

        it('a sum of a text the statement makes and a text or a float gives the text Cypher writes', async () => {
            // A side the statement makes a text is written as its own text on a SQL store (#326); a float beside it
            // still as toString writes it.
            expect(
                await query(
                    "UNWIND [1, 2] AS i WITH 'x' + toString(i) AS t RETURN t + toUpper('b'), 'a' + toUpper(t), t + 2.5, split('p,q', ',')[0] + t ORDER BY t"
                )
            ).toEqual([
                ['x1B', 'aX1', 'x12.5', 'px1'],
                ['x2B', 'aX2', 'x22.5', 'px2']
            ]);
            expect(
                await query("WITH 1.0E7 AS f, 0.5 AS h RETURN 'x' + toString(1) + f, substring('abc', 1) + h")
            ).toEqual([['x11.0E7', 'bc0.5']]);
            expect(
                await query(
                    "UNWIND ['a', 'b'] AS s WITH collect(toUpper(s)) AS ss, 1.5 AS f UNWIND ss AS u RETURN u + f ORDER BY u"
                )
            ).toEqual(['A1.5', 'B1.5']);
            // A CASE, a coalesce, a list and a CALL's UNION that may give a float beside a text write the float as
            // toString does.
            expect(
                await query(
                    "WITH 2.5 AS f RETURN CASE WHEN f > 1 THEN f ELSE 'a' END + 'x', coalesce(CASE WHEN f < 1 THEN 'a' END, f) + 'x', ['a', f][1] + 'x'"
                )
            ).toEqual([['2.5x', '2.5x', '2.5x']]);
            expect(
                await query("CALL { RETURN 2.5 AS v UNION RETURN toUpper('a') AS v } RETURN v + 'x' AS s ORDER BY s")
            ).toEqual(['2.5x', 'Ax']);
            // The least and the greatest of texts are a text, put together with a float as Cypher writes it.
            expect(
                await query("UNWIND ['b', 'a'] AS s WITH min(toUpper(s)) AS lo, max(s) AS hi RETURN lo + 2.5, hi + 2.5")
            ).toEqual([['A2.5', 'b2.5']]);
        });

        /** Writes the graph of the spec's `queries.yaml`, which the tests that read it start from. */
        const seed = async (): Promise<void> => {
            await query(trimIndent(loadSpec('queries.yaml').graph!));
        };

        it('collect(DISTINCT) beside grouping keys, other aggregates, an order, a page and a variable outside its aggregates', async () => {
            // Not in the spec: aggregatesFirst's grouping WITH, and the projection over it.
            await seed();
            expect(
                await query(
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p.name, count(*) + size(collect(DISTINCT m.title)) ORDER BY count(*) DESC, p.name SKIP 1 LIMIT 1'
                )
            ).toEqual([['Carrie', 4]]);
            expect(
                await query(
                    'MATCH (p:Person)-[:ACTED_IN]->(m) WITH p, collect(DISTINCT m) AS ms WHERE size(ms) > 1 RETURN p.name, size(ms) ORDER BY p.name'
                )
            ).toEqual([
                ['Carrie', 2],
                ['Keanu', 3]
            ]);
            expect(
                await query(
                    'MATCH (p:Person)-[:ACTED_IN]->(m) WITH p, size(collect(DISTINCT m.title)) + p.born AS x RETURN p.name, x ORDER BY p.name'
                )
            ).toEqual([
                ['Carrie', 1969],
                ['Keanu', 1967],
                ['Laurence', 1962]
            ]);
        });

        it('collect(DISTINCT) in a DISTINCT projection ordered by a key property or an aggregate no item is', async () => {
            // Not in the spec: the projection over aggregatesFirst's grouping WITH orders by what that WITH holds.
            await seed();
            expect(
                await query(
                    'MATCH (p:Person)-[:ACTED_IN]->(m) WITH DISTINCT p, size(collect(DISTINCT m.title)) AS n ORDER BY p.born DESC RETURN p.name, n'
                )
            ).toEqual([
                ['Carrie', 2],
                ['Keanu', 3],
                ['Laurence', 1]
            ]);
            expect(
                await query(
                    'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN DISTINCT p.name, size(collect(DISTINCT m.title)) ORDER BY count(*)'
                )
            ).toEqual([
                ['Laurence', 1],
                ['Carrie', 2],
                ['Keanu', 3]
            ]);
            expect(
                await query(
                    'MATCH (p:Person)-[:ACTED_IN]->(m) WITH p.name AS name, m.title AS t ' +
                        "RETURN name AS nm, size(collect(DISTINCT t)) ORDER BY any(x IN collect(DISTINCT t) WHERE x STARTS WITH 'J' AND name = 'Keanu'), nm"
                )
            ).toEqual([
                ['Carrie', 2],
                ['Laurence', 1],
                ['Keanu', 3]
            ]);
        });

        it('collect(DISTINCT) beside an item named after a variable another item is, ordered by that name', async () => {
            // Not in the spec: in an order term, an item's name is that item, not the variable it shadows.
            await seed();
            const rows = await query(
                'MATCH (p:Person)-[:ACTED_IN]->(m) RETURN p AS person, p.name AS p, size(collect(DISTINCT m.title)) ORDER BY toLower(p)'
            );
            expect(rows.map((it) => it.slice(1))).toEqual([
                ['Carrie', 2],
                ['Keanu', 3],
                ['Laurence', 1]
            ]);
        });

        it('an item of the relationships collect gathers is read in the projection that gathers them', async () => {
            // Not in the spec: Oracle reads no aggregate from a subquery, so the item is read from what collect gathered.
            await seed();
            expect(
                await query(
                    "MATCH (p:Person)-[r:ACTED_IN]->() WHERE p.name <> 'Keanu' RETURN p.name, collect(r)[0].role ORDER BY p.name"
                )
            ).toEqual([
                ['Carrie', 'Trinity'],
                ['Laurence', 'Morpheus']
            ]);
            expect(
                await query(
                    "MATCH (:Person {name: 'Laurence'})-[r:ACTED_IN]->() MATCH (:Person {name: 'Carrie'})-[s:ACTED_IN]->() " +
                        'RETURN size(collect(r) + collect(s)), (collect(r) + collect(s))[0].role, (collect(r) + collect(s))[-1].role'
                )
            ).toEqual([[4, 'Morpheus', 'Trinity']]);
            expect(
                await query(
                    "MATCH (:Person {name: 'Laurence'})-[r:ACTED_IN]->() WITH collect(r) AS rs RETURN rs[9] IS NULL, rs[-9] IS NULL"
                )
            ).toEqual([[true, true]]);
        });

        it('collect(DISTINCT) under a comprehension, a quantifier or a reduce that names a grouping key in its body', async () => {
            // Not in the spec: aggregatesFirst's grouping WITH keeps each variable such a body names, outside the aggregate.
            await seed();
            expect(
                await query(
                    'MATCH (p:Person)-[:ACTED_IN]->(m) WITH p.name AS name, m.title AS t ' +
                        'RETURN name, size([x IN collect(DISTINCT t) WHERE x <> name]), any(x IN collect(DISTINCT t) WHERE x = name), ' +
                        'reduce(n = 0, x IN collect(DISTINCT t) | n + size(name)) ORDER BY name'
                )
            ).toEqual([
                ['Carrie', 2, false, 12],
                ['Keanu', 3, false, 15],
                ['Laurence', 1, false, 8]
            ]);
        });

        it('collect(DISTINCT) beside a pattern or a subquery that names a grouping key', async () => {
            // Not in the spec: aggregatesFirst's grouping WITH keeps each variable a pattern or a subquery names, outside the
            // aggregate.
            await seed();
            expect(
                await query(
                    'MATCH (p:Person)-[:ACTED_IN]->(m) WITH p, size(collect(DISTINCT m.title)) + COUNT { (p)-[:KNOWS]->() } AS x, ' +
                        'size([(p)-[:KNOWS]->(f) | f.name] + collect(DISTINCT m.title)) AS y, ' +
                        "size(collect(DISTINCT m.title)) > 2 OR EXISTS { (p)-[:KNOWS]->(:Person {name: 'Keanu'}) } AS z " +
                        'RETURN p.name, x, y, z ORDER BY p.name'
                )
            ).toEqual([
                ['Carrie', 2, 2, false],
                ['Keanu', 4, 4, true],
                ['Laurence', 2, 2, true]
            ]);
        });

        it('collect(DISTINCT) of dates keeps each once, as dates', async () => {
            // Not in the spec: what aggregatesFirst keeps of a collection is still of the kind collect gathered.
            const dates = "UNWIND [date('2020-01-01'), date('2020-01-01'), date('2021-05-01')] AS d";
            expect(await query(`${dates} WITH collect(DISTINCT d) AS ds RETURN [x IN ds | x.year]`)).toEqual([
                [2020, 2021]
            ]);
            expect(await query(`${dates} RETURN collect(DISTINCT d)[1].month`)).toEqual([5]);
        });

        it('a float that is a whole number, collected once each, stays a float', async () => {
            // The spec's case reads the floats back, which a JavaScript number does not tell from whole numbers, so toString
            // tells them apart: what aggregatesFirst keeps of a collection is the items collect gathered, not their text.
            expect(
                await query('UNWIND [1.0, 2.5, 1.0] AS x WITH collect(DISTINCT x) AS xs RETURN [x IN xs | toString(x)]')
            ).toEqual([['1.0', '2.5']]);
        });

        it('a walk read through a WITH, then sorted by toString in a second WITH, keeps that order', async () => {
            // Not in the spec yet: the walk is a query inside the one the second WITH sorts, and its term, carried out, is
            // bound in no subquery (liberation-data/drivine#252).
            await seed();
            expect(
                await query(
                    "MATCH (:Person {name: 'Laurence'})-[*]->(b) WITH b WITH b " +
                        'ORDER BY toString(coalesce(b.name, b.title)) RETURN coalesce(b.name, b.title)'
                )
            ).toEqual([
                'Carrie',
                'Johnny Mnemonic',
                'Keanu',
                'The Matrix',
                'The Matrix',
                'The Matrix',
                'The Matrix Reloaded',
                'The Matrix Reloaded'
            ]);
        });

        it("an item of a pattern comprehension's relationships is compared by its id", async () => {
            // Not in the spec: a pattern comprehension gathers their properties beside their ids, as collect does, but in a
            // subquery.
            await seed();
            expect(
                await query(
                    "MATCH (a:Person {name: 'Keanu'}) WITH [(a)-[r:ACTED_IN {role: 'Neo'}]->() | r] AS rs, a " +
                        "RETURN [[(a)-[r:ACTED_IN {role: 'Neo'}]->() | r][0] = [(a)-[r:ACTED_IN {role: 'Neo'}]->() | r][1], " +
                        "[(a)-[r:ACTED_IN {role: 'Neo'}]->() | r][1] IN rs, [(a)-[r:ACTED_IN {role: 'Neo'}]->() | r][0].role = 'Neo']"
                )
            ).toEqual([[false, true, true]]);
        });

        it('a list comprehension over nodes or relationships that keeps them gives a list of them, compared by id', async () => {
            // Not in the spec: what entityComprehension keeps, with no projection or one of the item, is still a list of nodes
            // or relationships.
            await seed();
            expect(
                await query(
                    "MATCH (:Person {name: 'Keanu'})-[r:ACTED_IN {role: 'Neo'}]->() WITH collect(r) AS rs " +
                        'RETURN [[x IN rs WHERE x <> rs[0]][0] = rs[1], [x IN rs | x][0] = rs[1], size([x IN rs WHERE x = rs[0] | x]), ' +
                        'rs[0] IN [x IN rs WHERE x <> rs[0]], [x IN rs | x.role]]'
                )
            ).toEqual([[true, false, 1, false, ['Neo', 'Neo']]]);
            expect(
                await query(
                    "MATCH p = (:Person {name: 'Laurence'})-[:KNOWS*2]->(b) " +
                        "RETURN [[n IN nodes(p) WHERE n.name <> 'Laurence'][0] = nodes(p)[1], b IN [n IN nodes(p) | n], [n IN nodes(p) WHERE n = b | n.name]]"
                )
            ).toEqual([[true, true, ['Carrie']]]);
        });

        it("a path's nodes or relationships added together are a list of them, and of no path, null", async () => {
            // Not in the spec: lists of nodes no collect gathers, added, indexed and iterated by id; over a null list, null.
            await seed();
            expect(
                await query(
                    "MATCH p = (:Person {name: 'Laurence'})-[:KNOWS*2]->() " +
                        'RETURN [size(nodes(p) + nodes(p)), (nodes(p) + nodes(p))[3] = nodes(p)[0], (nodes(p) + nodes(p))[3] = nodes(p)[1], ' +
                        '[n IN nodes(p) + nodes(p) | n.name], relationships(p)[1] IN relationships(p) + relationships(p), size(relationships(p) + relationships(p))]'
                )
            ).toEqual([[6, true, false, ['Laurence', 'Keanu', 'Carrie', 'Laurence', 'Keanu', 'Carrie'], true, 4]]);
            expect(
                await query(
                    'OPTIONAL MATCH p = (:Nope)-->() RETURN [[n IN nodes(p) | n.name], [n IN nodes(p) WHERE true], nodes(p)[0]]'
                )
            ).toEqual([[null, null, null]]);
        });

        it('CALLs that write, nested, give each row its own variables with the nodes they return', async () => {
            // Not in the spec: a caller row at each depth, merged with a node returned from below it.
            expect(
                await query(
                    'UNWIND [1, 2] AS x CALL { WITH x CREATE (a:CyWrite {x: x}) WITH a, x ' +
                        'CALL { WITH a, x CREATE (b:CyWrite {y: x * 10}) RETURN b } RETURN a, b } RETURN [x, a.x, b.y]'
                )
            ).toEqual([
                [1, 1, 10],
                [2, 2, 20]
            ]);
            expect(
                await query(
                    'UNWIND [1, 2] AS i CALL { WITH i CREATE (n:CyWrite {i: i}) RETURN n } SET n.j = i * 10 RETURN [i, n.i, n.j] ORDER BY i'
                )
            ).toEqual([
                [1, 1, 10],
                [2, 2, 20]
            ]);
            expect(
                await query(
                    "WITH date('2020-01-02') AS d CALL { CREATE (n:CyWrite) RETURN date('2021-03-04') AS e } RETURN [d.year, e.month]"
                )
            ).toEqual([[2020, 3]]);
        });

        it('a day and a moment are their ISO text', async () => {
            const [[day, moment]] = await query('RETURN [date(), localdatetime()]');
            expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(moment).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3}|\.\d{6})?$/);
        });

        it("datetime's epoch milliseconds and timestamp are the moment the statement runs", async () => {
            const before = Date.now() - 60_000;
            const [[millis, stamp]] = await query('CREATE (n:CyWrite) SET n.at = datetime().epochMillis RETURN [n.at, timestamp()]');
            const after = Date.now() + 60_000;
            expect(millis).toBeGreaterThanOrEqual(before);
            expect(millis).toBeLessThanOrEqual(after);
            expect(stamp).toBeGreaterThanOrEqual(before);
            expect(stamp).toBeLessThanOrEqual(after);
        });

        it('a parameter of a Date is a moment', async () => {
            expect(
                await query("RETURN {year: $at.year, later: $at > datetime('2024-01-01T00:00:00Z')}", {
                    at: new Date('2024-06-01T00:00:00Z')
                })
            ).toEqual([{ year: 2024, later: true }]);
        });

        it("a parameter of the Neo4j driver's Integer is the whole number it holds, as a value and as a count", async () => {
            // An app binds a whole number so for Neo4j, whose driver sends a JavaScript number as a float.
            expect(await query('CREATE (n:CyWrite {i: $i}) RETURN n.i', { i: neo4j.int(1) })).toEqual([1]);
            await query('CREATE (:CyWrite {i: 2}), (:CyWrite {i: 3})');
            expect(
                await query('MATCH (n:CyWrite) WHERE n.i >= $from RETURN n.i ORDER BY n.i LIMIT $n', {
                    from: neo4j.int(2),
                    n: neo4j.int(1)
                })
            ).toEqual([2]);
        });

        it("a parameter of a Buffer or an Int8Array, the Neo4j driver's bytes, is its base64 text, as drivine4j writes a byte array", async () => {
            expect(await query('RETURN $bytes', { bytes: Buffer.from([1, 2, 255]) })).toEqual(['AQL/']);
            expect(await query('RETURN $bytes', { bytes: new Int8Array([1, 2, -1]) })).toEqual(['AQL/']);
        });

        it('a parameter of a Set is the list of its items, as the Neo4j driver sends it', async () => {
            await query('CREATE (:CyWrite {i: 1}), (:CyWrite {i: 2})');
            expect(await query('MATCH (n:CyWrite) WHERE n.i IN $ids RETURN n.i', { ids: new Set([2]) })).toEqual([2]);
        });

        it('a write whose text holds the dollar quote of its Postgres function writes it whole', async () => {
            await query("CREATE (:CyWrite {s: 'a$cy$b', t: 'c$cy1$d'})");
            expect(await query('MATCH (n:CyWrite) RETURN [n.s, n.t]')).toEqual([['a$cy$b', 'c$cy1$d']]);
        });

        it('a parameter named past ASCII is bound, to a statement that reads and to one that writes', async () => {
            await query('CREATE (:CyWrite {größe: $größe, 名前: $名前})', { größe: 3, 名前: 'ada' });
            expect(
                await query('MATCH (n:CyWrite) WHERE n.größe = $größe RETURN [n.größe, n.名前]', { größe: 3 })
            ).toEqual([[3, 'ada']]);
        });

        it('a statement of hundreds of creates, each naming nodes made before it, makes them all', async () => {
            const clauses = Array.from({ length: 300 }, (__, i) => [
                `CREATE (n${i}:CyWrite {i: ${i}})`,
                ...(i > 0 ? [`CREATE (n${i - 1})-[:NEXT]->(n${i})`] : [])
            ]).flat();
            await query(clauses.join('\n'));
            expect(
                await query('MATCH (n:CyWrite) OPTIONAL MATCH (n)-[r:NEXT]->() RETURN [count(DISTINCT n), count(r)]')
            ).toEqual([[300, 299]]);
        });

        it("Drivine's stamp is written as a node's property is, and read back as one", async () => {
            const stamp = '`__drivine.stamp`';
            await query(`CREATE (:CyWrite {id: 1, ${stamp}: 'aaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbb'})`);
            expect(await query(`MATCH (n:CyWrite {id: 1}) RETURN n.${stamp}`)).toEqual(['aaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbb']);
            await query(`MATCH (n:CyWrite {id: 1}) SET ${Stamps.setClause('n')}`);
            const [token, links] = ((await query(`MATCH (n:CyWrite {id: 1}) RETURN n.${stamp}`))[0] as string).split(':');
            expect(token).toHaveLength(16);
            expect(token).not.toEqual('aaaaaaaaaaaaaaaa');
            expect(links).toEqual('bbbbbbbbbbbbbbbb');
            expect(await query('MATCH (n:CyWrite {id: 1}) RETURN properties(n)')).toEqual([
                { id: 1, [Stamps.PROPERTY]: `${token}:${links}` }
            ]);
            await query(`MATCH (n:CyWrite {id: 1}) REMOVE n.${stamp}`);
            expect(await query(`MATCH (n:CyWrite {id: 1}) RETURN n.${stamp}`)).toEqual([null]);
        });

        it('a text longer than a VARCHAR2 holds is bound whole, to a statement that reads and to one that writes', async () => {
            // 40,000 bytes in UTF-8, past the 32,767 a PL/SQL VARCHAR2 holds: drivine4j binds such a text as a CLOB.
            const text = 'é'.repeat(20_000);
            await query('CREATE (:CyWrite {id: 1, text: $text})', { text });
            expect(await query('MATCH (n:CyWrite {id: 1}) RETURN n.text')).toEqual([text]);
            expect(await query('RETURN $text', { text })).toEqual([text]);
        });

        it('a write in a transaction rolled back leaves nothing, and runs again after', async () => {
            const connection = await DatabaseRegistry.getInstance().connectionProvider(store.connection)!.connect();
            const run = async (cypher: string): Promise<any[]> =>
                connection.query(new QuerySpecification({ text: cypher, language: 'CYPHER' }));
            await connection.startTransaction();
            try {
                await run("CREATE (:CyWrite {name: 'Ada'})");
                expect(await run('MATCH (n:CyWrite) RETURN n.name')).toEqual(['Ada']);
            } finally {
                await connection.rollbackTransaction();
                await connection.release();
            }
            expect(await query('MATCH (n:CyWrite) RETURN count(n)')).toEqual([0]);
            // On Postgres, the function the write was compiled to went with the transaction, and is made again.
            await query("CREATE (:CyWrite {name: 'Ada'})");
            expect(await query('MATCH (n:CyWrite) RETURN count(n)')).toEqual([1]);
        });

        it("a list of a few thousand relationships is equal by identity to a map's or a list's", async () => {
            // Not in the spec: their identity is larger than Oracle's = compares (ORA-40180), so Oracle compares it by
            // JSON_EQUAL.
            expect(
                await query('CREATE (h:Hub) WITH h UNWIND range(1, 2500) AS i CREATE (h)-[:R]->(:Leaf) RETURN count(*)')
            ).toEqual([2500]);
            expect(
                await query(
                    'MATCH (:Hub)-[r:R]->() WITH collect(r) AS rs RETURN [[rs][0] = rs, {x: rs}.x = rs, rs IN [rs], size(rs)]'
                )
            ).toEqual([[true, true, true, 2500]]);
        }, 300_000);

        it('collect(DISTINCT) keeps a few thousand lists or maps holding a relationship once each in seconds, not a minute', async () => {
            // Not in the spec: each was compared with every one before it, which took 20 to 40 seconds on Oracle.
            expect(
                await query('CREATE (h:Hub) WITH h UNWIND range(1, 5000) AS i CREATE (h)-[:R]->(:Leaf) RETURN count(*)')
            ).toEqual([5000]);
            const started = Date.now();
            expect(
                await query(
                    'MATCH p = (:Hub)-[r:R]->() RETURN [size(collect(DISTINCT relationships(p))), size(collect(DISTINCT {x: r}))]'
                )
            ).toEqual([[5000, 5000]]);
            expect(Date.now() - started).toBeLessThan(15_000);
        }, 300_000);

        it('a whole float past 2^53 written in the statement or given equals the same float worked out', async () => {
            // Not in the spec: Postgres writes such a float out in full, by its shortest decimal, not the double's exact value.
            expect(
                await query("RETURN [toFloat('1e24') = 1e24, toFloat('1e300') = 1e300, toFloat('1e24') = $x]", { x: 1e24 })
            ).toEqual([[true, true, true]]);
        });

        it('a number or a text the statement gives, added to a text, is written as toString writes it', async () => {
            // Not in the spec: a side the statement gives is written out at compile time, and the other side as it is. A
            // JavaScript number past a whole number's range is a float, as the Neo4j driver sends it.
            expect(
                await query(
                    "RETURN ['a' + 1e7, 1e7 + 'a', 'a' + 2.0, 'a' + $f, $i + 'b', 'a' + $s, $s + 1.5e-7, 'x' + 10, $m.n + 'y', $j + 'b', 'a' + $big]",
                    { f: 1.0e-4, i: 3, s: 's', m: { n: 0.5 }, j: neo4j.int(4), big: 1e21 }
                )
            ).toEqual([['a1.0E7', '1.0E7a', 'a2.0', 'a1.0E-4', '3b', 'as', 's1.5E-7', 'x10', '0.5y', '4b', 'a1.0E21']]);
        });

        it('a quotient of floats is written without the zeros its scale leaves', async () => {
            // The spec's float arithmetic steps skip Postgres, which works a float out in exact decimal
            // (liberation-data/drivine4j#188): these it gives as a double does.
            expect(
                await query('RETURN [4.0 / 2, 7 / 2.0, 10.0 / 4, toString(4.0 / 2), toString(10.0 / 4), toString(7 / 2.0)]')
            ).toEqual([[2.0, 3.5, 2.5, '2.0', '2.5', '3.5']]);
        });

        it("toString of a double past Oracle's NUMBER range writes its shortest digits", async () => {
            // Not in the spec: Oracle writes such a double from its own text, not from TO_CHAR's 15 digits.
            expect(
                await query(
                    'RETURN [toString(1.7976931348623157e308), toString(1.5e300), toString(1.0e-310), toString($a)]',
                    { a: -2.5e-320 }
                )
            ).toEqual([['1.7976931348623157E308', '1.5E300', '1.0E-310', '-2.5E-320']]);
            expect(await query('RETURN toString(5e-324)')).toEqual(['4.9E-324']);
        });

        it('a UNION in CALL whose queries return a list with an identity beside one without compiles, as it did before identities', async () => {
            // Not in the spec: the queries are compiled again without identities, so their columns match.
            await seed();
            expect(
                await query(
                    "CALL { MATCH (:Person {name: 'Keanu'})-[r:ACTED_IN]->() RETURN collect([r]) AS l UNION RETURN [] AS l } RETURN size(l) ORDER BY size(l)"
                )
            ).toEqual([0, 3]);
            expect(
                await query(
                    "CALL { MATCH (:Person {name: 'Keanu'})-[r:KNOWS]->() RETURN {x: r} AS m UNION RETURN {x: 1} AS m } RETURN count(*)"
                )
            ).toEqual([2]);
        });

        it('a CASE that gives a list of relationships or of texts is read, and gathered on every store but Oracle, which refuses it', async () => {
            // Not in the spec: on Oracle the CASE's results are worked out first; gathered, it closes the session, so it is
            // refused (liberation-data/drivine4j#224).
            await seed();
            expect(
                await query(
                    "MATCH (:Person {name: 'Keanu'})-[r:ACTED_IN]->(m) WITH r, m ORDER BY m.title RETURN CASE WHEN m.released > 2000 THEN [r] ELSE [m.title] END"
                )
            ).toEqual([['Johnny Mnemonic'], ['The Matrix'], [{ role: 'Neo' }]]);
            // A CASE that reads an aggregate is worked out in the query that aggregates, where a subquery would group it again.
            expect(
                await query(
                    'MATCH (a:Person)-[r:ACTED_IN]->(m) RETURN a.name, size(CASE WHEN count(*) > 1 THEN collect(r) ELSE [] END) ORDER BY a.name'
                )
            ).toEqual([
                ['Carrie', 2],
                ['Keanu', 3],
                ['Laurence', 0]
            ]);
            // Counted, by count() or the size() of its collect, it is read on Oracle too, as it was before.
            expect(
                await query(
                    'MATCH (a:Person)-[r:ACTED_IN]->(m) RETURN a.name, size(collect(CASE WHEN m.released > 2000 THEN [r] ELSE [] END)), ' +
                        'count(CASE WHEN m.released > 2000 THEN [r] ELSE [] END) ORDER BY a.name'
                )
            ).toEqual([
                ['Carrie', 2, 2],
                ['Keanu', 3, 3],
                ['Laurence', 1, 1]
            ]);
            const gathered =
                'MATCH (a:Person)-[r:ACTED_IN]->(m) WITH a, r, m ORDER BY m.title ' +
                'RETURN a.name, [x IN collect(CASE WHEN m.released > 2000 THEN [r] ELSE [m.title] END) | x[0]] ORDER BY a.name';
            // With no ELSE, its null is the value of another kind.
            const unmatched =
                'MATCH (a:Person)-[r:ACTED_IN]->(m) WITH a, r, m ORDER BY m.title ' +
                'RETURN a.name, [x IN collect(CASE WHEN m.released > 2000 THEN [r] END) | x[0].role] ORDER BY a.name';
            if (store.type === DatabaseType.ORACLE) {
                for (const statement of [gathered, unmatched]) {
                    await expect(query(statement)).rejects.toThrow(
                        'On Oracle, an aggregate of a CASE that gives a list of nodes or relationships beside a value of another kind'
                    );
                }
                return;
            }
            expect(await query(unmatched)).toEqual([
                ['Carrie', ['Trinity']],
                ['Keanu', ['Neo']],
                ['Laurence', []]
            ]);
            expect(await query(gathered)).toEqual([
                ['Carrie', ['The Matrix', { role: 'Trinity' }]],
                ['Keanu', ['Johnny Mnemonic', 'The Matrix', { role: 'Neo' }]],
                ['Laurence', ['The Matrix']]
            ]);
        });

        it('min() and max() of lists the statement makes compare them item by item, whatever their lengths', async () => {
            // Not in the spec yet: a nested list (liberation-data/drivine#287). The spec holds DISTINCT and the grouping WITH.
            expect(await query('UNWIND [[[1, 2]], [[3]], [[1], [2]]] AS xs RETURN [min(xs), max(xs)]')).toEqual([
                [[[1], [2]], [[3]]]
            ]);
            // The least and the greatest moment still, whatever their offsets.
            expect(
                await query(
                    "UNWIND [datetime('2020-01-01T00:00+01:00'), datetime('2020-01-01T00:30+02:00')] AS x RETURN [toString(min(x)), toString(max(x))]"
                )
            ).toEqual([['2020-01-01T00:30:00+02:00', '2020-01-01T00:00:00+01:00']]);
            // Oracle puts a null item first and a number before a text (liberation-data/drivine4j#205).
            if (store.type === DatabaseType.ORACLE) {
                return;
            }
            expect(await query("UNWIND [[1, 'a'], ['a', 1], [true]] AS xs RETURN [min(xs), max(xs)]")).toEqual([
                [['a', 1], [1, 'a']]
            ]);
            expect(await query('UNWIND [[1, null], [1], [null], null] AS xs RETURN [min(xs), max(xs)]')).toEqual([
                [[1], [null]]
            ]);
        });
    }
);
