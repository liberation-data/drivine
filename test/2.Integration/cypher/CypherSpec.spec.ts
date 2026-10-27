import neo4j from 'neo4j-driver';
import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    PersistenceManager,
    PersistenceManagerFactory,
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
    // The connection makes the graph's tables on Postgres and Oracle alike, on its first statement.
    return new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance()).get(
        store.connection,
        'NON_TRANSACTIONAL'
    );
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
     * liberation-data/drivine4j#225, ported for liberation-data/drivine#290, less the steps the spec holds since v0.6.6.
     */
    describe('lists and maps that hold a null', () => {
        const seed = async (): Promise<void> => {
            await clear();
            await query(loadSpec('queries.yaml').graph!);
        };

        it('compare item by item, null where no pair differs', async () => {
            // Cypher compares a list or a map item by item, so a null it holds makes the comparison null.
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
            // Of a node with no name, a quantifier whose condition no item decides is null, so the WHERE drops it (#333).
            expect(await query("MATCH (n:CyTest) WHERE all(x IN [1] WHERE n.name IN ['Keanu']) RETURN count(*)")).toEqual([
                1
            ]);
            expect(
                await query(
                    'RETURN [null IN [null], [null] IN [[null]], 1 IN [null], 1 IN [1, null], 2 IN [1, null], null IN [], [null] IN [[1, 2]], ' +
                        '[null] IN [[1]], [1, null] IN [[2, null]], [1] IN [[1], null], {x: null} IN [{x: null}], [1] IN [[2], null], [1] IN [[null]], null IN [1]]'
                )
            ).toEqual([[null, null, null, true, null, false, false, null, false, true, null, null, null, null]]);
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

        it("texts past 32 KB in a parameter's lists that hold a null compare as texts", async () => {
            // A parameter's list with such a text is walked, not written in the statement item by item, past the literal
            // Oracle takes (ORA-01704) (#351).
            const text = 'x'.repeat(40_000);
            const given = { a: [text, null], b: [text, null], c: [text + 'y', null] };
            expect(await query('RETURN [$a = $b, $a = $c, $a IN [$b], $a IN [$c]]', given)).toEqual([
                [null, false, null, false]
            ]);
            expect(await query('WITH $a AS a, $b AS b, $c AS c RETURN [a = b, a = c, {k: a} = {k: b}]', given)).toEqual(
                [[null, false, null]]
            );
        });

        it('compare item by item in a statement that writes', async () => {
            // On Oracle a procedure calls no function of its own, so the store's walks them (#367).
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
        });

        it('are null where written alike only when one holds one, and walked where written otherwise', async () => {
            // Not in the spec yet (#270): on Oracle two written as the same JSON text are null with no walk, so the text
            // must be written alike only where one holds a null.
            await clear();
            expect(
                await query(
                    'CREATE (n:CyWrite) WITH n, CASE WHEN n.x IS NULL THEN [1, 2] ELSE [null] END AS a, CASE WHEN n.x IS NULL THEN [1, null] ELSE [2] END AS c ' +
                        "RETURN [a = [1, 2], c = [1, null], c = [1.0, null], {a: 1, b: c[1]} = {b: null, a: 1}, ['é', c[1]] = ['\\u00e9', null], " +
                        '[[1, 2], c] = [[1, 2], [1, null]]]'
                )
            ).toEqual([[true, null, null, null, null, null]]);
            // And in a read, where the same text is null and any other is walked.
            expect(
                await query(
                    "WITH [1, null] AS c RETURN [c = [1, null], c = [1.0, null], c = [2, null], {a: 1, b: null} = {b: null, a: 1}, ['é', null] = ['\\u00e9', null]]"
                )
            ).toEqual([[null, null, false, null, null]]);
        });
    });

    /**
     * all(), any(), none() and single() three-valued, as Cypher's are, beyond the spec's cases of liberation-data/drivine#333:
     * drivine-python's own tests of it (drivine-python#159), ported.
     */
    describe('quantifiers', () => {
        beforeEach(async () => {
            await clear();
            await query(loadSpec('queries.yaml').graph!);
        });

        it('are three-valued over parameters, nodes, relationships and empty lists, and in each WHERE', async () => {
            // A list given, an empty or null one of nodes or relationships, one of them that holds a null, quantifiers nested and
            // under an aggregate, and a WHERE of a comprehension or a subquery, which keeps what a quantifier is true of, read
            // through a NOT that keeps no more where it is null.
            const quantified =
                'RETURN [any(x IN $xs WHERE x = 2), all(x IN $xs WHERE x = 1), none(x IN $xs WHERE x = 2), single(x IN $xs WHERE x = 1)]';
            expect(await query(quantified, { xs: [1, null] })).toEqual([[null, null, null, null]]);
            expect(await query(quantified, { xs: null })).toEqual([[null, null, null, null]]);
            expect(await query(quantified, { xs: [] })).toEqual([[false, true, true, false]]);
            expect(
                await query(
                    "MATCH (p:Person {name: 'Nope'}) WITH collect(p) AS ps RETURN [any(x IN ps WHERE x.born > 1), " +
                        'all(x IN ps WHERE x.born > 1), none(x IN ps WHERE x.born > 1), single(x IN ps WHERE x.born > 1)]'
                )
            ).toEqual([[false, true, true, false]]);
            expect(
                await query(
                    "MATCH (k:Person {name: 'Keanu'}), (h:Person {name: 'Hugo'}) RETURN [any(x IN [k, h] WHERE x.born > 1960), " +
                        'all(x IN [k, h] WHERE x.born > 1960), none(x IN [k, h] WHERE x.born < 1960), ' +
                        'single(x IN [k, h] WHERE x.born > 1960), all(x IN [k, null] WHERE x.born > 1960), ' +
                        'any(x IN [h, null] WHERE x.born > 1960)]'
                )
            ).toEqual([[true, null, null, null, null, null]]);
            // Keanu's KNOWS have no role.
            expect(
                await query(
                    "MATCH (k:Person {name: 'Keanu'}) WITH [(k)-[r]-() | r] AS rs RETURN [any(r IN rs WHERE r.role = 'Neo'), " +
                        "all(r IN rs WHERE r.role STARTS WITH 'N'), single(r IN rs WHERE r.role = 'Johnny'), " +
                        "none(r IN rs WHERE r.role = 'X')]"
                )
            ).toEqual([[true, false, null, null]]);
            expect(
                await query(
                    'RETURN [any(y IN [1, 2] WHERE all(x IN [y, null] WHERE x > 0)), ' +
                        'any(y IN [1, 2] WHERE single(x IN [1, 2, null] WHERE x = y)), all(y IN [1, 2] WHERE none(x IN [3, y] WHERE ' +
                        'x = y + 1)), [y IN [1, 2, 3] WHERE NOT any(x IN [null, 2] WHERE x = y) | y], ' +
                        '[y IN [1, 2, 3] WHERE any(x IN [null, 2] WHERE x = y) OR y = 1 | y]]'
                )
            ).toEqual([[null, null, false, [], [1, 2]]]);
            expect(
                await query(
                    "MATCH (k:Person {name: 'Keanu'}) RETURN [[(k)-[:ACTED_IN]->(m) WHERE NOT any(x IN [1] WHERE m.nope > 1) | " +
                        "m.title], [(k)-[:ACTED_IN]->(m) WHERE NOT all(x IN [null, 1] WHERE x = 1) OR m.title = 'X' | m.title], " +
                        '[(k)-[:ACTED_IN]->(m) WHERE none(x IN [m.nope] WHERE x = 1) | m.title]]'
                )
            ).toEqual([[[], [], []]]);
            expect(
                await query(
                    "MATCH (p:Person) WHERE EXISTS { MATCH (p)-[r]->() WHERE NOT all(x IN [1] WHERE r.role > 'N') } " +
                        'RETURN p.name ORDER BY p.name'
                )
            ).toEqual(['Keanu', 'Laurence']);
            expect(
                await query(
                    'MATCH (p:Person) WHERE any(x IN $xs WHERE x = 2) IS NULL AND NOT none(x IN $xs WHERE x = 1) ' +
                        'RETURN p.name ORDER BY p.name',
                    { xs: [1, null] }
                )
            ).toEqual(['Carrie', 'Hugo', 'Keanu', 'Laurence']);
            expect(
                await query(
                    "MATCH (p:Person) WHERE NOT (any(x IN [1] WHERE p.born > 1966) OR p.name = 'Laurence') RETURN p.name"
                )
            ).toEqual(['Keanu']);
            expect(
                await query(
                    'MATCH (p:Person) RETURN [any(x IN collect(p.born) WHERE x > 1966), all(x IN collect(p.born) WHERE x > 1960), ' +
                        'none(x IN [n IN collect(p) | n.born] WHERE x > 1970)]'
                )
            ).toEqual([[true, true, null]]);
        });

        it('are three-valued in a projection, a comparison, an order and a CASE, and over long texts', async () => {
            // Quantifiers read for their value, not by a WHERE, over lists and maps that hold a null, keys and labels, a path's
            // relationships, and texts past Oracle's 4000 bytes, for a value and in a WHERE.
            expect(
                await query(
                    'RETURN [l IN [[1, null], [2], [3], null] | [any(x IN l WHERE x = 2), all(x IN l WHERE x = 3), ' +
                        'none(x IN l WHERE x = 2), single(x IN l WHERE x > 1)]]'
                )
            ).toEqual([
                [
                    [null, false, null, null],
                    [true, false, false, true],
                    [false, true, true, true],
                    [null, null, null, null]
                ]
            ]);
            expect(
                await query(
                    'RETURN [any(x IN [[1], null] WHERE x[0] = 1), all(x IN [[1], null] WHERE x[0] = 1), ' +
                        'none(x IN [[2], null] WHERE x[0] = 1), single(x IN [[1], [1], null] WHERE x[0] = 1), ' +
                        'single(x IN [[1], null] WHERE x[0] = 1), any(x IN [{a: 1}, {a: null}, null] WHERE x.a = 2), ' +
                        'single(m IN [{a: 1}, {a: 1}, {a: null}] WHERE m.a = 1)]'
                )
            ).toEqual([[true, null, null, false, null, null, false]]);
            expect(
                await query(
                    'RETURN [any(x IN [1, null] WHERE x = 2) = false, any(x IN [1, null] WHERE x = 2) IS NULL, ' +
                        "all(x IN [] WHERE x = 1) = true, any(x IN [1, 'a'] WHERE x > 0), all(x IN [1, 'a'] WHERE x > 0)]"
                )
            ).toEqual([[null, true, true, true, null]]);
            expect(
                await query(
                    'UNWIND [[1, null], [2], [3], null, []] AS l WITH l ORDER BY all(x IN l WHERE x > 1), size(l) RETURN collect(l)'
                )
            ).toEqual([[[1, null], [], [2], [3]]]);
            expect(
                await query(
                    "UNWIND [[1, null], [2], [3]] AS l RETURN CASE WHEN any(x IN l WHERE x = 2) THEN 'y' " +
                        "WHEN all(x IN l WHERE x = 1) IS NULL THEN 'n' ELSE 'e' END"
                )
            ).toEqual(['n', 'y', 'e']);
            expect(
                await query(
                    "MATCH (k:Person {name: 'Keanu'}) RETURN [any(x IN keys(k) WHERE x = 'born'), " +
                        "all(x IN keys(k) WHERE x = 'name'), single(x IN labels(k) WHERE x = 'Person')]"
                )
            ).toEqual([[true, false, true]]);
            expect(
                await query(
                    "MATCH p = (:Person {name: 'Laurence'})-[:KNOWS*]->(b) RETURN [b.name, any(r IN relationships(p) WHERE " +
                        "r.role = 'x'), none(r IN relationships(p) WHERE r.role = 'x')] ORDER BY b.name"
                )
            ).toEqual([
                ['Carrie', null, null],
                ['Keanu', null, null]
            ]);
            const texts = { t: 'a'.repeat(5000) + 'b', u: 'a'.repeat(5000) };
            expect(
                await query(
                    'UNWIND [$t, $u] AS t WITH collect(t) AS ts RETURN [any(x IN ts WHERE x = $t), all(x IN ts WHERE x = $t), ' +
                        'single(x IN ts + [null] WHERE x = $u), single(x IN ts + ts WHERE x = $u)]',
                    texts
                )
            ).toEqual([[true, false, null, false]]);
            // Compared by equality: STARTS WITH reads a text past 4000 bytes as null on Oracle, as size() does (drivine-python#168).
            expect(
                await query(
                    'UNWIND [$t, $u] AS t WITH collect(t) AS ts WITH ts WHERE any(x IN ts WHERE x = $t) ' +
                        "AND none(x IN ts WHERE x = 'c') AND all(x IN ts WHERE x <> 'c') RETURN size(ts)",
                    texts
                )
            ).toEqual([2]);
            // A list long enough to be bound once in a subquery, of values and of nodes, read for a value and in a WHERE.
            const comprehended = '[y IN l WHERE y > 0 | y * 2]';
            expect(
                await query(
                    'UNWIND [[1, null], [2], [3], null] AS l ' +
                        `RETURN [any(x IN ${comprehended} WHERE x = 4), all(x IN ${comprehended} WHERE x = 4)]`
                )
            ).toEqual([
                [false, false],
                [true, true],
                [false, false],
                [null, null]
            ]);
            expect(
                await query(
                    `UNWIND [[1, null], [2], [3], null] AS l WITH l WHERE any(x IN ${comprehended} WHERE x = 4) ` +
                        `OR NOT all(x IN ${comprehended} WHERE x = 6) RETURN collect(l)`
                )
            ).toEqual([[[1, null], [2]]]);
            expect(
                await query(
                    'MATCH (p:Person) WITH collect(p) AS ps WHERE all(x IN [n IN ps WHERE n.born > 0] WHERE x.born > 1960) ' +
                        'RETURN [size(ps), any(x IN [n IN ps WHERE n.born > 0] WHERE x.born > 1966)]'
                )
            ).toEqual([[4, true]]);
        });

        it('are three-valued in a statement that writes, over a list of mixed values, and past a thousand items', async () => {
            // On Oracle a statement that writes runs as a procedure, which reads its parameters apart from a query's.
            const xs = [...Array.from({ length: 3000 }, (_, i) => i), null];
            expect(
                await query(
                    'CREATE (n:QZ {a: any(x IN $xs WHERE x = 2999), b: all(x IN $xs WHERE x >= 0), ' +
                        'c: single(x IN [1, 2] WHERE x = 1), d: none(x IN $xs WHERE x = -1)}) RETURN [n.a, n.b, n.c, n.d]',
                    { xs }
                )
            ).toEqual([[true, null, true, null]]);
            expect(
                await query(
                    'MATCH (n:QZ) SET n.e = any(x IN [n.c, null] WHERE x), n.f = all(x IN [n.c, null] WHERE x) RETURN [n.e, n.f]'
                )
            ).toEqual([[true, null]]);
            expect(await query('MATCH (n:QZ) WHERE none(x IN [1, null] WHERE x = 2) SET n.g = 1 RETURN count(*)')).toEqual([
                0
            ]);
            expect(
                await query(
                    "RETURN [any(x IN $m WHERE x = 'a'), all(x IN $m WHERE x IS NOT NULL), none(x IN $m WHERE x = true), " +
                        'single(x IN $m WHERE x = 2.5), single(x IN $m WHERE x = [1]), any(x IN $m WHERE x = {a: 1})]',
                    { m: [1, 'a', true, null, 2.5, [1], { a: 1 }] }
                )
            ).toEqual([[true, false, false, null, null, true]]);
            expect(
                await query('RETURN [single(x IN range(0, 5000) + [null] WHERE x = 4999), single(x IN $xs WHERE x = 5)]', {
                    xs: xs.slice(0, -1)
                })
            ).toEqual([[null, true]]);
        });

        it('are null over a list of nodes or relationships that is null, and keep no row in a WHERE', async () => {
            // A path OPTIONAL MATCH finds none of, a CASE or a coalesce() that gives no list, and a node that is null in one.
            expect(
                await query(
                    'OPTIONAL MATCH p = (:NopeX)-[*]->() RETURN [any(r IN relationships(p) WHERE r.x = 1), all(n IN nodes(p) WHERE n.x = 1), single(n IN nodes(p) WHERE n.x = 1)]'
                )
            ).toEqual([[null, null, null]]);
            expect(
                await query(
                    'OPTIONAL MATCH (a:NopeX)-[r]->() RETURN [any(x IN CASE WHEN a IS NULL THEN null ELSE [r] END WHERE x.y = 1), none(x IN [r, r] WHERE x.y = 1), any(x IN coalesce(null, [r]) WHERE x IS NULL)]'
                )
            ).toEqual([[null, null, true]]);
            expect(
                await query(
                    'OPTIONAL MATCH (a:NopeX) WITH a RETURN [any(x IN [a] WHERE x.y = 1), any(x IN [a] WHERE x IS NULL), all(x IN [a][0..0] WHERE x.y = 1)]'
                )
            ).toEqual([[null, true, true]]);
            expect(
                await query(
                    'OPTIONAL MATCH p = (:NopeX)-[*]->() WITH p WHERE NOT any(r IN relationships(p) WHERE r.x = 1) OR all(n IN nodes(p) WHERE n.x = 1) RETURN count(*)'
                )
            ).toEqual([0]);
        });
    });

    /**
     * Texts in a list sorted by their code points: what drivine4j's tests of liberation-data/drivine4j#273 (#339) give
     * beyond the spec's cases, whose texts are made in the statement, not given or written out in it.
     */
    describe('texts in code point order', () => {
        it('a text given in a list sorts by its code points across its 500th character', async () => {
            // Postgres keys the first 500 characters of a text in a list by their code points.
            const [a499, a600] = ['a'.repeat(499), 'a'.repeat(600)];
            expect(
                await query('UNWIND $ls AS g WITH [g[0], g[1]] AS l RETURN l[1] ORDER BY l', {
                    ls: [
                        [a499 + 'b', '3'],
                        [a499 + 'B', '2'],
                        [a499, '1'],
                        [a600 + 'b', '5'],
                        [a600, '4']
                    ]
                })
            ).toEqual(['1', '2', '4', '5', '3']);
        });

        it('a text written in a list sorts by its code points up to and across its 500th character', async () => {
            // Postgres keys a text in a list by the bits of its first 500 characters, then by the rest. 500 characters
            // of four bytes are 16,000 bits, near the 16,383 places Postgres holds; the 500th may be of 1 to 4 bytes.
            const smile = '😀';
            const [s499, s500] = [smile.repeat(499), smile.repeat(500)];
            const texts = [s499, s499 + 'a', s499 + '～', s500, s500 + 'a', s500 + 'b'];
            const written = [...texts]
                .reverse()
                .map((it) => `['${it}']`)
                .join(', ');
            expect(await query(`UNWIND [${written}] AS l RETURN l ORDER BY l`)).toEqual(texts.map((it) => [it]));
            expect(await query(`UNWIND [${written}] AS l RETURN l ORDER BY l DESC`)).toEqual(
                [...texts].reverse().map((it) => [it])
            );
            const [a499, a500] = ['a'.repeat(499), 'a'.repeat(500)];
            expect(
                await query(
                    `UNWIND [['${a500}B'], ['${a500}'], ['${a499}é'], ['${a499}b'], ['${a499}B']] AS l RETURN l ORDER BY l`
                )
            ).toEqual([[a499 + 'B'], [a500], [a500 + 'B'], [a499 + 'b'], [a499 + 'é']]);
        });
    });

    /**
     * Texts past 4,000 bytes measured, cut, changed, searched and added to whole, on every store: drivine4j's tests of
     * liberation-data/drivine4j#298, ported for #347. Oracle read a text from JSON as a `VARCHAR2`, which holds 4,000
     * bytes, and a longer one as null.
     */
    describe('texts past 4,000 bytes', () => {
        const oracle = store.type === DatabaseType.ORACLE;

        /** Each function of the text `t`, `length` characters long, and what it gives. */
        const functions = (t: string, length: number): [string, unknown][] => [
            ['size(t)', length],
            ['toUpper(t)', t.toUpperCase()],
            ['toLower(t)', t.toLowerCase()],
            ['trim(t)', t.trim()],
            ['ltrim(t)', t.trimStart()],
            ['rtrim(t)', t.trimEnd()],
            ['substring(t, 1, size(t) - 2)', t.substring(1, length - 1)],
            ['substring(t, 2)', t.substring(2)],
            ['left(t, size(t) - 1)', t.slice(0, -1)],
            ['right(t, size(t) - 1)', t.slice(1)],
            ["replace(t, 'B', 'bb')", t.split('B').join('bb')],
            ["split(t, 'B')", t.split('B')],
            // A separator past 4,000 bytes, too, but within 32 KB, past which Oracle's REPLACE looks for none.
            ["split('x' + t + 'y', left(t, 4100))", `x${t}y`.split(t.slice(0, 4100))],
            ["split('x', left(t, 4100))", ['x']],
            [`t STARTS WITH '${t.slice(0, 3)}'`, true],
            ["t STARTS WITH 'x'", false],
            ['t STARTS WITH t', true],
            ["t ENDS WITH 'B '", true],
            ['t ENDS WITH t', true],
            ['left(t, 10) STARTS WITH t', false],
            ['left(t, 10) ENDS WITH t', false],
            // INSTR looks for no text past 32 KB on Oracle.
            [`t CONTAINS '${t.slice(2, 5)}'`, true],
            ["t CONTAINS 'z'", false],
            ['t CONTAINS left(t, 4100)', true],
            [`t =~ ' (${t.slice(1, 3)})+ '`, true],
            ["t + 'z'", `${t}z`],
            ["'z' + t", `z${t}`],
            ['t + t', t + t],
            ['t + 1', `${t}1`],
            ['toString(t)', t],
            ['isEmpty(t)', false]
        ];

        it('a text past 4,000 bytes is measured, cut, changed, searched and added to whole, as a short one is', async () => {
            // One function a statement. Past 32 KB, given only: Oracle closes the session (ORA-03113) after statements that
            // read such a text from a property and from a parameter in turn, much as it does for one read over two rows
            // (#320), and its sessions hold more of its memory for each statement that reads one the statement makes, up to
            // the instance's limit (ORA-04036), as drivine4j found. The text of '€', three bytes, is 3,000 characters and
            // 5,998 bytes: under 4,000 characters, past 4,000 bytes.
            const texts: [string, number][] = [
                [` ${'aB'.repeat(2_499)} `, 5_000],
                [` ${'€B'.repeat(1_499)} `, 3_000],
                [` ${'aB'.repeat(19_999)} `, 40_000]
            ];
            for (const [t, length] of texts) {
                await clear();
                const short = length < 32_000;
                if (short) {
                    await query('CREATE (n:CyLongText {t: $t})', { t });
                }
                const parts = { a: t.substring(0, length / 2), b: t.substring(length / 2) };
                for (const [fn, expected] of functions(t, length)) {
                    // Given, and stored and read in one row, and made by the statement.
                    expect([fn, 'given', length, await query(`WITH $t AS t RETURN ${fn}`, { t })]).toEqual([
                        fn,
                        'given',
                        length,
                        [expected]
                    ]);
                    if (short) {
                        expect([
                            fn,
                            'stored',
                            length,
                            await query(`MATCH (n:CyLongText) WITH n.t AS t RETURN ${fn}`)
                        ]).toEqual([fn, 'stored', length, [expected]]);
                        expect([fn, 'made', length, await query(`WITH $a + $b AS t RETURN ${fn}`, parts)]).toEqual([
                            fn,
                            'made',
                            length,
                            [expected]
                        ]);
                    }
                }
            }
            await clear();
        });

        it('two short texts summed past 4,000 bytes, and texts replaced past it, are whole', async () => {
            // Two short texts whose sum is past 4,000 bytes failed on Oracle with ORA-01489.
            expect(await query('WITH $a AS a RETURN size(a + a)', { a: 'é'.repeat(3_000) })).toEqual([6_000]);
            // Sums at and around 4,000 bytes, of texts of two-byte characters and of a float, put together short on Oracle
            // only where they fit.
            const sides: [string, string | number][] = [
                ['é'.repeat(1_000), 'é'.repeat(1_000)],
                ['a'.repeat(1_968), 'a'.repeat(1_968)],
                ['a'.repeat(1_969), 'a'.repeat(1_968)],
                ['a'.repeat(2_000), 'a'.repeat(2_001)],
                ['a'.repeat(3_999), 1.5]
            ];
            for (const [a, b] of sides) {
                expect([a.length, b, await query('WITH $a AS a, $b AS b RETURN a + b', { a, b })]).toEqual([
                    a.length,
                    b,
                    [`${a}${b}`]
                ]);
            }
            // What to replace, and what with, made by the statement, so their lengths are measured for each row: a short
            // text made past 4,000 bytes, made shorter, and made no longer. A short text a given replacement makes past
            // 4,000 bytes was cut off at 4,000 on Oracle.
            expect(
                await query(
                    'WITH $a AS a RETURN replace(a, left(a, 1), left(a, 2)), replace(a, left(a, 2), left(a, 1)), replace(a, left(a, 1), right(a, 1))',
                    { a: 'é'.repeat(1_500) }
                )
            ).toEqual([['é'.repeat(3_000), 'é'.repeat(750), 'é'.repeat(1_500)]]);
            expect(await query("WITH $a AS a RETURN size(replace(a, 'é', 'éé'))", { a: 'é'.repeat(1_500) })).toEqual([
                3_000
            ]);
            // A short text whose split list is written past 4,000 bytes was cut off on Oracle.
            expect(await query("WITH $a AS a RETURN size(split(a, ','))", { a: '\u0001,'.repeat(1_000) })).toEqual([
                1_001
            ]);
        });

        it('a null text, or a short one a function makes empty, is not read again as a long one', async () => {
            for (const fn of [
                'toUpper(n)',
                'trim(n)',
                'substring(n, 1)',
                "replace(n, 'a', 'b')",
                "split(n, ',')",
                'size(n)',
                'toString(n)',
                "n + 'a'",
                "n STARTS WITH 'a'",
                "n ENDS WITH 'a'",
                "n CONTAINS 'a'",
                "n =~ 'a'"
            ]) {
                expect([fn, await query(`WITH $n AS n RETURN ${fn}`, { n: null })]).toEqual([fn, [null]]);
            }
            // Oracle's empty text is null.
            const empty = oracle ? null : '';
            expect(
                await query('WITH $s AS s, $w AS w RETURN substring(s, 5), left(s, 0), replace(s, $s, $e), trim(w)', {
                    s: 'abc',
                    w: '   ',
                    e: ''
                })
            ).toEqual([[empty, empty, empty, empty]]);
            // Two empty texts put together are empty: on Oracle null, as its empty text is, and not read as a long one.
            expect(await query('WITH $e AS e RETURN e + e', { e: '' })).toEqual([empty]);
        });

        it('a stored text past 32 KB, read in one row, is measured and changed whole, passed on by a WITH or read where it is used', async () => {
            // On Oracle a WITH passes a property on read through its text (#320), and a function reads a text past 4,000
            // bytes as a CLOB (#347): the two together. One node: Oracle crashes on a long property read from two rows.
            await clear();
            const t = 'aB'.repeat(20_000);
            await query('CREATE (n:CyLongText {t: $t})', { t });
            const checks: [string, unknown][] = [
                ['size(#)', 40_000],
                ['toUpper(#)', t.toUpperCase()],
                ['substring(#, 2)', t.substring(2)],
                ["replace(#, 'B', 'b')", t.toLowerCase()],
                ["# ENDS WITH 'aB'", true],
                ["size(# + 'z')", 40_001],
                ['toString(#)', t]
            ];
            for (const [fn, expected] of checks) {
                const passed = await query(`MATCH (n:CyLongText) WITH n.t AS t RETURN ${fn.replace('#', 't')}`);
                expect([fn, 'passed on', passed]).toEqual([fn, 'passed on', [expected]]);
                const read = await query(`MATCH (n:CyLongText) RETURN ${fn.replace('#', 'n.t')}`);
                expect([fn, 'read where used', read]).toEqual([fn, 'read where used', [expected]]);
            }
            await clear();
        });
    });

    /**
     * Values of several kinds sorted as Cypher orders their kinds, a map, a list, a text, a truth value, a number, then
     * null: drivine4j's tests of liberation-data/drivine4j#299, ported for #355, beside the spec's cases since v0.6.16 (#299). Postgres takes
     * `jsonb`'s order for every kind but a text: a number before a truth value, a map and a list last
     * (liberation-data/drivine4j#307).
     */
    describe('values of several kinds in Cypher order', () => {
        const sorts = store.type !== DatabaseType.POSTGRES;

        (sorts ? it : it.skip)(
            'values of several kinds sort as Cypher orders their kinds, a map, a list, a text, a truth value, a number, then null',
            async () => {
                // Beside the spec's case since v0.6.16 (#299): Oracle sorts first by where a value's kind comes, then by
                // the value.
                const values = "[1, {a: 1}, 'b', true, [2], 2.5, null, false, 'A', [1, 2], -1]";
                const ascending = [{ a: 1 }, [1, 2], [2], 'A', 'b', false, true, -1, 1, 2.5, null];
                // Carried out of a CALL { … }, grouped by, kept distinct by another name, and sorted by when it is not returned.
                expect(await query(`CALL { UNWIND ${values} AS t RETURN t ORDER BY t LIMIT 4 } RETURN t`)).toEqual([
                    { a: 1 },
                    [1, 2],
                    [2],
                    'A'
                ]);
                expect(await query("UNWIND [2, 'b', true, 2, 'b', [1]] AS t RETURN t, count(*) ORDER BY t")).toEqual([
                    [[1], 1],
                    ['b', 2],
                    [true, 1],
                    [2, 2]
                ]);
                expect(await query("UNWIND [2, 'b', true, 2] AS t RETURN DISTINCT t AS u ORDER BY u DESC")).toEqual([
                    2,
                    true,
                    'b'
                ]);
                expect(await query("UNWIND [2, 'b', true] AS t RETURN toString(t) AS s ORDER BY t")).toEqual([
                    'b',
                    'true',
                    '2'
                ]);
                // Among their own kind: texts by their code points, and whole and floating-point numbers as numbers.
                expect(await query("UNWIND ['😀', '～', 1, 'a'] AS t RETURN t ORDER BY t")).toEqual([
                    'a',
                    '～',
                    '😀',
                    1
                ]);
                expect(await query('UNWIND [1, 0.5, true, 1.5, 0] AS t RETURN t ORDER BY t')).toEqual([
                    true,
                    0,
                    0.5,
                    1,
                    1.5
                ]);
                // Paged by the query that returns them, and nulls first descending, carried out of a CALL { … }.
                expect(await query(`UNWIND ${values} AS t RETURN t ORDER BY t SKIP 2 LIMIT 5`)).toEqual([
                    [2],
                    'A',
                    'b',
                    false,
                    true
                ]);
                expect(await query(`UNWIND ${values} AS t RETURN t ORDER BY t DESC SKIP 1 LIMIT 4`)).toEqual([
                    2.5,
                    1,
                    -1,
                    true
                ]);
                expect(
                    await query(
                        "CALL { UNWIND [1, null, 'a', true, null, [1]] AS t RETURN t ORDER BY t DESC LIMIT 3 } RETURN t"
                    )
                ).toEqual([null, null, 1]);
                // Collected in the order a WITH gives them, and indexed or iterated there.
                expect(
                    await query(`UNWIND ${values} AS t WITH t ORDER BY t DESC WITH collect(t) AS xs RETURN xs`)
                ).toEqual([ascending.slice(0, -1).reverse()]);
                expect(
                    await query(`UNWIND ${values} AS t WITH t ORDER BY t RETURN [x IN collect(t) | x][0..3]`)
                ).toEqual([ascending.slice(0, 3)]);
                expect(await query(`UNWIND ${values} AS t WITH t ORDER BY t SKIP 2 LIMIT 5 RETURN collect(t)`)).toEqual(
                    [[[2], 'A', 'b', false, true]]
                );
                // The last query of a UNION sorted, and a UNION carried out of a CALL { … } sorted and paged.
                expect(
                    await query(
                        "UNWIND [2, 'b', true] AS t RETURN t UNION UNWIND [[1], {a: 1}, null, 'a'] AS t RETURN t ORDER BY t"
                    )
                ).toEqual([2, 'b', true, { a: 1 }, [1], 'a', null]);
                expect(
                    await query(
                        "CALL { UNWIND [2, 'b'] AS t RETURN t UNION UNWIND [true, [1], null] AS t RETURN t } RETURN t ORDER BY t"
                    )
                ).toEqual([[1], 'b', true, 2, null]);
                expect(
                    await query(
                        "CALL { UNWIND [2, 'b'] AS t RETURN t UNION UNWIND [true, [1], null] AS t RETURN t } WITH t ORDER BY t DESC SKIP 1 LIMIT 3 RETURN t"
                    )
                ).toEqual([2, true, 'b']);
            }
        );

        (sorts ? it : it.skip)('a property stored as several kinds sorts as Cypher orders their kinds', async () => {
            // Beside the spec's case since v0.6.16 (#299): a property read from the store may be of any kind, so its kind
            // is ranked first.
            await clear();
            await query(
                "CREATE (:Kind {v: 2}), (:Kind {v: 'b'}), (:Kind {v: true}), (:Kind {v: [1]}), (:Kind {v: 1.5}), (:Kind {v: 'B'}), (:Kind {v: false}), (:Kind)"
            );
            const ascending = [[1], 'B', 'b', false, true, 1.5, 2, null];
            expect(await query('CALL { MATCH (k:Kind) RETURN k.v AS v ORDER BY v DESC LIMIT 2 } RETURN v')).toEqual([
                null,
                2
            ]);
            expect(await query('MATCH (k:Kind) WITH k ORDER BY k.v WITH collect(k.v) AS vs RETURN vs')).toEqual([
                ascending.slice(0, -1)
            ]);
            expect(await query('MATCH (k:Kind) RETURN k.v ORDER BY k.v DESC SKIP 1 LIMIT 3')).toEqual([2, 1.5, true]);
        });

        // Oracle puts a number before a text and a null first within a list (liberation-data/drivine4j#205).
        (sorts && store.type !== DatabaseType.ORACLE ? it : it.skip)(
            'lists of several kinds of item, nested, sort item by item among values of other kinds',
            async () => {
                // Not in the spec yet (#299): a list sorts first among values of other kinds, and among lists item by
                // item, the items of each as Cypher orders their kinds at any depth.
                const values = "[[1, 'a'], 'x', [[2], 1], [[2], 'b'], [1, null], 3, [1], [[2], [1]], [{a: 1}], [true]]";
                const ascending = [
                    [{ a: 1 }],
                    [[2], [1]],
                    [[2], 'b'],
                    [[2], 1],
                    [true],
                    [1],
                    [1, 'a'],
                    [1, null],
                    'x',
                    3
                ];
                expect(await query(`UNWIND ${values} AS t RETURN t ORDER BY t`)).toEqual(ascending);
                expect(await query(`UNWIND ${values} AS t RETURN t ORDER BY t DESC`)).toEqual([...ascending].reverse());
                expect(await query(`CALL { UNWIND ${values} AS t RETURN t ORDER BY t LIMIT 4 } RETURN t`)).toEqual(
                    ascending.slice(0, 4)
                );
            }
        );
    });

    /**
     * drivine4j's own test of liberation-data/drivine4j#304, ported for liberation-data/drivine#375: the cases whose
     * values differ, as a JavaScript number does not tell 2.0 from 2, and toString where only the kind does.
     */
    describe('aggregates of floats', () => {
        it('a sum of floats is summed as doubles, and a sum of integers is an integer', async () => {
            await clear();
            await query(
                "CREATE (:F {k: 'a', x: 0.5}), (:F {k: 'a', x: 1.0}), (:F {k: 'a', x: 0.5}), (:F {k: 'b', x: 1}), (:F {k: 'b', x: 2})"
            );
            // Postgres works a float out in exact decimal, by choice (liberation-data/drivine4j#327).
            const [tenths, tenthsText] =
                store.type === DatabaseType.POSTGRES ? [0.3, '0.3'] : [0.30000000000000004, '0.30000000000000004'];
            const cases: [string, Record<string, any>, any][] = [
                // As NUMBERs on Oracle, 1e300 was dropped, and 0.1 + 0.2 was 0.3.
                ['UNWIND [1e300, 1.0] AS x RETURN sum(x)', {}, 1e300],
                ['UNWIND [0.1, 0.2] AS x RETURN [sum(x), toString(sum(x))]', {}, [tenths, tenthsText]],
                // An integer among floats is summed as a double too, as Neo4j sums it, and a computed float is one.
                ['UNWIND [9223372036854775807, 0.5] AS x RETURN sum(x)', {}, 9.223372036854776e18],
                ['UNWIND [0.5, 2] AS x RETURN sum(x * 10)', {}, 25],
                ['UNWIND [1, 1.0] AS x RETURN toString(sum(x))', {}, '2.0'],
                ['UNWIND [1, 0.5, 0.5] AS x RETURN toString(sum(x))', {}, '2.0'],
                ['UNWIND [1, 2] AS x RETURN [sum(x), toString(sum(x))]', {}, [3, '3']],
                ['UNWIND [] AS x RETURN [sum(x), toString(sum(x))]', {}, [0, '0']],
                ['UNWIND [1.0, 1.0] AS x RETURN toString(sum(DISTINCT x))', {}, '1.0'],
                ['UNWIND [1, 1, 2] AS x RETURN [sum(DISTINCT x), toString(sum(DISTINCT x))]', {}, [3, '3']],
                ['UNWIND [0.5, 1.0, 0.5] AS x RETURN [toString(sum(x)), sum(x) + 1, sum(x) * 2]', {}, ['2.0', 3, 4]],
                [
                    "UNWIND [['a', 0.1], ['a', 0.2], ['b', 1e300], ['b', 1.0], ['c', 1], ['c', 2], ['d', 1], ['d', 1.0]] AS r WITH r[0] AS k, sum(r[1]) AS s ORDER BY k RETURN collect([s, toString(s)])",
                    {},
                    [
                        [tenths, tenthsText],
                        [1e300, '1.0E300'],
                        [3, '3'],
                        [2, '2.0']
                    ]
                ],
                ['MATCH (n:F) WITH n.k AS k, sum(n.x) AS s ORDER BY k RETURN collect(toString(s))', {}, ['2.0', '3']],
                ["MATCH (n:F) WHERE n.k = 'a' AND n.x = 1.0 RETURN toString(sum(n.x))", {}, '1.0'],
                [
                    "UNWIND [['a', 0.5], ['a', 1.5], ['b', 1], ['b', 1]] AS r WITH r[0] AS k, r[1] AS x WITH k, [sum(x), avg(x), min(x), max(x)] AS a ORDER BY k RETURN collect([y IN a | toString(y)])",
                    {},
                    [
                        ['2.0', '1.0', '0.5', '1.5'],
                        ['2', '1.0', '1', '1']
                    ]
                ],
                [
                    "UNWIND range(0, 2999) AS i WITH toFloat(i % 3) * 0.5 AS x RETURN [toString(sum(round(x, 400))), toString(sum(round(x, 0))), toString(sum(round(x, 0, 'UP'))), toString(count(*))]",
                    {},
                    ['1500.0', '2000.0', '2000.0', '3000']
                ],
                // Parameters, bound as JSON on a SQL store: Oracle writes a fraction of more than 40 digits with an
                // exponent and no point. drivine4j's `[1.0]` is no case here: a JavaScript 1.0 is 1, which the Neo4j
                // driver sends as a float and a SQL store binds as an integer.
                ['UNWIND $xs AS x RETURN sum(x)', { xs: [0.1, 0.2] }, tenths],
                ['UNWIND $xs AS x RETURN sum(x)', { xs: [1e300, 1.5] }, 1e300],
                ['UNWIND $xs AS x RETURN sum(x)', { xs: [1e300, 1e300] }, 2e300],
                ['UNWIND $xs AS x RETURN toString(sum(x))', { xs: [0.5, 1, 0.5] }, '2.0'],
                ['UNWIND $xs AS x RETURN toString(sum(x))', { xs: [0.5, 0.5] }, '1.0'],
                ['UNWIND $xs AS x RETURN sum(x)', { xs: [1e-41, -1e-41] }, 0],
                ['UNWIND $xs AS x RETURN sum(x)', { xs: [1e-41, 1e-41] }, 2e-41],
                // A bigint is bound as an integer, as the spec's whole numbers are: see parametersFor.
                ['UNWIND $xs AS x RETURN sum(x)', { xs: [BigInt(2), BigInt(3)] }, 5]
            ];
            // Each that differs, so a store's every difference shows at once.
            const differing: string[] = [];
            for (const [statement, parameters, value] of cases) {
                const [given] = await query(statement, parameters);
                const [was, is] = [given, value].map((it) => JSON.stringify(it));
                if (was !== is) {
                    differing.push(`${statement} ${String(parameters.xs ?? '')}: ${was}, not ${is}`);
                }
            }
            expect(differing).toEqual([]);
            // Oracle reads a text that is a number, '0.5', as that number where it is asked for one, so a sum reads no
            // text: Cypher refuses one, and a SQL store sums the numbers alone.
            const text = "UNWIND ['0.5', 2] AS x RETURN toString(sum(x))";
            if (store.type === DatabaseType.NEO4J) {
                await expect(query(text)).rejects.toThrow('can only handle numerical values');
            } else {
                expect(await query(text)).toEqual(['2']);
            }
            // Not compiled to SQL yet, so they give no integer for a float.
            const uncompiled: [string, any][] = [
                ['UNWIND [2.0, 3.0] AS x RETURN toString(percentileDisc(x, 0.5))', '2.0'],
                ['UNWIND [1.0, 3.0] AS x RETURN toString(percentileCont(x, 0.5))', '2.0'],
                ['UNWIND [1.0, 3.0] AS x RETURN toString(stDevP(x))', '1.0'],
                ['UNWIND [1.0, 3.0] AS x RETURN stDev(x)', 1.4142135623730951],
                ['UNWIND [1, 3] AS x RETURN toString(percentileDisc(x, 0.5))', '1']
            ];
            for (const [statement, value] of uncompiled) {
                if (store.type === DatabaseType.NEO4J) {
                    expect(await query(statement)).toEqual([value]);
                } else {
                    await expect(query(statement)).rejects.toThrow('is Cypher, and is not compiled to SQL yet.');
                }
            }
        });
    });

    /**
     * A list of zoned values, and a list of lists of them, sorted and compared item by item as the moments they are:
     * drivine4j's tests of liberation-data/drivine4j#199, ported for #361. Not in the spec yet (#199). Oracle sorts such a
     * list as its JSON (liberation-data/drivine4j#331): see OracleZonedListSort.spec.ts.
     */
    describe('lists of zoned values by their moments', () => {
        const sorts = store.type !== DatabaseType.ORACLE;
        // As text, 10:00+02:00 (08:00 UTC) sorts after 09:00Z, and 08:30Z before both.
        const [a, b, c] = [
            "datetime('2024-03-15T10:00:00+02:00')",
            "datetime('2024-03-15T09:00:00Z')",
            "datetime('2024-03-15T08:30:00Z')"
        ];
        const hours = [10, 8, 9];

        (sorts ? it : it.skip)(
            'a list of zoned values, and a list of lists of them, sort and compare item by item as the moments they are, whatever their offsets',
            async () => {
                // Not in the spec yet (#199).
                expect(await query(`UNWIND [${b}, ${a}, ${c}] AS t WITH [t] AS ts RETURN ts[0].hour ORDER BY ts`)).toEqual(
                    hours
                );
                expect(
                    await query(`UNWIND [${b}, ${a}, ${c}] AS t WITH [t] AS ts RETURN ts[0].hour ORDER BY ts DESC`)
                ).toEqual([...hours].reverse());
                expect(
                    await query(`UNWIND [${b}, ${a}, ${c}] AS t WITH t.hour AS h, collect(t) AS ts RETURN h ORDER BY ts`)
                ).toEqual(hours);
                expect(await query(`UNWIND [[${b}], [${a}], [${c}]] AS ts RETURN ts[0].hour ORDER BY ts`)).toEqual(hours);
                expect(
                    await query(`UNWIND [${b}, ${a}, ${c}] AS t WITH [[t]] AS l RETURN l[0][0].hour ORDER BY l`)
                ).toEqual(hours);
                expect(
                    await query(`UNWIND [${b}, ${a}, ${c}] AS t WITH t.hour AS h, collect([t]) AS l RETURN h ORDER BY l`)
                ).toEqual(hours);
                // A list that starts another comes first; a null item after any moment.
                expect(
                    await query(`WITH [${a}] AS x, [${a}, ${b}] AS y UNWIND [y, x] AS l RETURN size(l) ORDER BY l`)
                ).toEqual([1, 2]);
                expect(
                    await query(
                        `WITH [${a}, null] AS x, [${a}, ${b}] AS y UNWIND [x, y] AS l RETURN size([i IN l WHERE i IS NULL]) ORDER BY l`
                    )
                ).toEqual([0, 1]);
                // A long list, and lists worked out with temporal arithmetic, by a comprehension or collect(): k = 0's start
                // at 08:00 UTC.
                const at = `CASE k WHEN 0 THEN ${a} ELSE ${b} END`;
                expect(
                    await query(
                        `UNWIND [0, 1] AS k WITH k, [x IN range(1, 200) | ${at} + duration({minutes: x})] AS l RETURN k ORDER BY l`
                    )
                ).toEqual([0, 1]);
                expect(
                    await query(
                        `UNWIND [0, 1] AS k UNWIND range(1, 3) AS x WITH k, ${at} + duration({minutes: x}) AS t WITH k, collect(t) AS l RETURN k ORDER BY l`
                    )
                ).toEqual([0, 1]);
                // min() and max() of them.
                expect(
                    await query(`UNWIND [[${b}], [${a}], [${c}]] AS l RETURN [min(l)[0].hour, max(l)[0].hour]`)
                ).toEqual([[10, 9]]);
                expect(
                    await query(
                        `UNWIND [${b}, ${a}, ${c}] AS t WITH [[t]] AS l RETURN [min(l)[0][0].hour, max(l)[0][0].hour]`
                    )
                ).toEqual([[10, 9]]);
                // A time of day with an offset, as a moment.
                const times = "[time('10:00:00+02:00'), time('09:00:00Z'), time('08:30:00Z')]";
                expect(await query(`UNWIND ${times} AS t WITH [t] AS ts RETURN ts[0].hour ORDER BY ts`)).toEqual(hours);
                expect(
                    await query(`UNWIND ${times} AS t WITH [t] AS l RETURN [min(l)[0].hour, max(l)[0].hour]`)
                ).toEqual([[10, 9]]);
                // Taken from a list kept in order, by head() and last().
                expect(
                    await query(
                        `UNWIND [${b}, ${a}, ${c}] AS t WITH t ORDER BY t WITH collect(t) AS ts RETURN [head(ts).hour, last(ts).hour]`
                    )
                ).toEqual([[10, 9]]);
            }
        );

        (sorts ? it : it.skip)(
            'a list of zoned values sorts as their moments however it was made, and an empty list or a null item sorts as Cypher puts it',
            async () => {
                // Not in the spec yet (#199). By moment 10:00+02:00, 08:30Z, 09:00Z; as text 08:30Z, 09:00Z, 10:00+02:00.
                const sorted = async (by: string, list: string = '[[t]]'): Promise<any[]> =>
                    query(`UNWIND [${b}, ${a}, ${c}] AS t WITH t, ${list} AS l RETURN t.hour ORDER BY ${by}`);
                // Taken from a list of lists, by an index, head(), last(), a slice, reverse(), tail() and a comprehension.
                for (const by of [
                    'l[0]',
                    'head(l)',
                    'last(l)',
                    'l[0..1]',
                    'reverse(l)',
                    '[x IN l WHERE x IS NOT NULL]',
                    '[x IN l | x]'
                ]) {
                    expect([by, await sorted(by)]).toEqual([by, hours]);
                }
                expect(await sorted('tail(l)', '[[t], [t]]')).toEqual(hours);
                // Made by a CASE, collect(DISTINCT), a UNION, and a comprehension over nodes or a pattern.
                expect(await sorted('CASE WHEN t IS NOT NULL THEN [t] END')).toEqual(hours);
                expect(
                    await query(
                        `UNWIND [${b}, ${a}, ${c}] AS t WITH t.hour AS h, collect(DISTINCT [t]) AS l RETURN h ORDER BY l`
                    )
                ).toEqual(hours);
                expect(
                    await query(
                        `CALL { UNWIND [${b}] AS t RETURN [[t]] AS l UNION UNWIND [${a}, ${c}] AS t RETURN [[t]] AS l } RETURN l[0][0].hour ORDER BY l`
                    )
                ).toEqual(hours);
                await clear();
                await query(
                    "CREATE (:CyZoned {h: 10})-[:AT]->(:CyZonedAt {at: '2024-03-15T10:00:00+02:00'}), " +
                        "(:CyZoned {h: 9})-[:AT]->(:CyZonedAt {at: '2024-03-15T09:00:00Z'}), " +
                        "(:CyZoned {h: 8})-[:AT]->(:CyZonedAt {at: '2024-03-15T08:30:00Z'})"
                );
                expect(
                    await query('MATCH (z:CyZoned) RETURN z.h ORDER BY [(z)-[:AT]->(w) | [datetime(w.at)]]')
                ).toEqual(hours);
                expect(
                    await query(
                        'MATCH (z:CyZoned)-[:AT]->(w) WITH z, collect(w) AS ws RETURN z.h ORDER BY [n IN ws | [datetime(n.at)]]'
                    )
                ).toEqual(hours);
                // The empty list first, then a list of a moment, then a null item or no list; as items of a list too.
                const ordered = [2, 1, 3];
                const empty = `[i IN [${a}] WHERE false]`;
                const cased = `CASE k WHEN 1 THEN [${a}] WHEN 2 THEN ${empty} END`;
                expect(await query(`UNWIND [1, 2, 3] AS k WITH k, ${cased} AS l RETURN k ORDER BY l`)).toEqual(ordered);
                expect(await query(`UNWIND [1, 2, 3] AS k WITH k, ${cased} AS l RETURN k ORDER BY l DESC`)).toEqual(
                    [...ordered].reverse()
                );
                expect(await query(`UNWIND [1, 2, 3] AS k WITH k, [${cased}] AS l RETURN k ORDER BY l`)).toEqual(ordered);
                expect(await query(`UNWIND [1, 2, 3] AS k WITH k, [${cased}] AS l RETURN k ORDER BY l DESC`)).toEqual(
                    [...ordered].reverse()
                );
                // Two lists of lists of them put together, and min() or max() of lists of them, grouped.
                expect(await sorted('l + l')).toEqual(hours);
                expect(
                    await query(`UNWIND [${b}, ${a}, ${c}] AS t WITH t.hour AS h, min([t]) AS m RETURN h ORDER BY m`)
                ).toEqual(hours);
                expect(
                    await query(`UNWIND [${b}, ${a}, ${c}] AS t WITH t.hour AS h, max([[t]]) AS m RETURN h ORDER BY m`)
                ).toEqual(hours);
                // Carried past a write, as a list and as a list of lists.
                expect(
                    await query(
                        `UNWIND [${b}, ${a}, ${c}] AS t WITH t, [t] AS l CREATE (:CyZonedWrite) RETURN t.hour ORDER BY l`
                    )
                ).toEqual(hours);
                expect(
                    await query(
                        `UNWIND [${b}, ${a}, ${c}] AS t WITH t, [[t]] AS l CREATE (:CyZonedWrite) RETURN t.hour ORDER BY l`
                    )
                ).toEqual(hours);
                // Read from the row a write works its value out of (rowKeys), in a subquery that sorts them.
                expect(
                    await query(
                        `UNWIND [${b}, ${a}, ${c}] AS t WITH collect([t]) AS ls CREATE (n:CyZonedWrite) ` +
                            'SET n.first = COUNT { UNWIND ls AS l WITH l ORDER BY l LIMIT 1 WITH l WHERE l[0].hour = 10 RETURN l } RETURN n.first'
                    )
                ).toEqual([1]);
                // After a term whose kind is open, which sorts by its kind first (liberation-data/drivine4j#308): the text
                // before the numbers, then by moment.
                const open = `UNWIND [${b}, ${a}, ${c}] AS t WITH t, [t] AS l, CASE t.hour WHEN 8 THEN 'x' ELSE 1 END AS o RETURN t.hour`;
                expect(await query(`${open} ORDER BY o, l`)).toEqual([8, 10, 9]);
                expect(await query(`${open} ORDER BY o DESC, l DESC`)).toEqual([9, 10, 8]);
            }
        );
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
            await query('CREATE (:Round {p: 1.7, q: -0.5, w: 2.0, r: -2, z: 0.0, b: 400})');
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
                'round() takes a precision from 0 to 2147483647'
            );
            await expect(query('MATCH (n:Round) RETURN round(1234.5, n.r)')).rejects.toThrow(
                'round() takes a precision from 0 to 2147483647'
            );
            // Places past a number's digits give it back, where Oracle's NUMBER would overflow (#324); short of them, it
            // rounds.
            expect(
                await query("RETURN [round(2.5, 400), round(2.5, 400, 'HALF_UP'), round(2.5, 400, 'CEILING')]")
            ).toEqual([[2.5, 2.5, 2.5]]);
            // Read from data, and so far past the digits that writing them all out would not finish, where Postgres's
            // numeric would overflow.
            expect(await query("MATCH (n:Round) RETURN [round(2.5, n.b), round(2.5, n.b, 'FLOOR')]")).toEqual([
                [2.5, 2.5]
            ]);
            expect(await query("RETURN [round(2.5, 1000000000), round(2.5, 1000000000, 'HALF_UP')]")).toEqual([
                [2.5, 2.5]
            ]);
            expect(
                await query(
                    "RETURN [round(1.0E-100, 120), round(123.456, 200, 'HALF_UP'), round(1.0E100, 30), round(1.0 / 3, 20), round(1.0E-100, 99), round(-2.5, 300, 'FLOOR')]"
                )
            ).toEqual([[1.0e-100, 123.456, 1.0e100, 0.3333333333333333, 0.0, -2.5]]);
            // Zero, which has no digits to count, and a precision short of a tiny number's digits
            // but past NUMBER's range.
            expect(
                await query(
                    "MATCH (n:Round) RETURN [round(0.0, 400), round(0, 400, 'HALF_UP'), round(n.z, 2), round(n.z, 400), round(n.z, 2, 'UP'), round(1.0E-120, 130), round(1.0E-120, 130, 'HALF_UP'), round(-1.0E-120, 136, 'CEILING')]"
                )
            ).toEqual([[0.0, 0.0, 0.0, 0.0, 0.0, 1.0e-120, 1.0e-120, -1.0e-120]]);
            // Near 10^17, whose digits all come before the point, and negatives past their digits.
            expect(
                await query(
                    "RETURN [round(123456789012345678, 2), round(99999999999999999.0, 1, 'UP'), round(12345678901234567.0, 1), round(-9.87654321E16, 3, 'FLOOR'), round(-1234.5678, 400), round(-1234.5678, 2)]"
                )
            ).toEqual([[1.2345678901234568e17, 1.0e17, 1.2345678901234568e16, -9.87654321e16, -1234.5678, -1234.57]]);
            // A null number past its digits, and numbers near NUMBER's least, whose digits Oracle's LOG cannot count.
            expect(
                await query(
                    "MATCH (n:Round) RETURN [round(null, 400), round(n.none, 400, 'UP'), round(n.none, n.b), round(1.0E-129, 2), round(-1.0E-129, 2, 'FLOOR'), round(1.0E-130, 140), round(-1.0E-125, 141, 'HALF_EVEN'), round(1.2345678901234567E-130, 145), round(5.5E-128, 128, 'HALF_EVEN')]"
                )
            ).toEqual([[null, null, null, 0.0, -0.01, 1.0e-130, -1.0e-125, 1.234567890123457e-130, 6.0e-128]]);
            // Over an aggregate, where no value is bound in a subquery, and so the number is written out where it is read.
            expect(
                await query(
                    "UNWIND [1.0, 2.0, 2.5] AS x RETURN [round(avg(x), 2), round(avg(x), 400), round(avg(x), 400, 'HALF_UP'), round(round(avg(x), 400), 1, 'DOWN')]"
                )
            ).toEqual([[1.83, 1.8333333333333333, 1.8333333333333333, 1.8]]);
            // Zero too, whose places Oracle gives back without rounding.
            await expect(query("MATCH (n:Round) RETURN round(n.z, n.r, 'HALF_UP')")).rejects.toThrow(
                'round() takes a precision from 0 to 2147483647'
            );
            await expect(query('MATCH (n:Round) RETURN round(n.z, n.r)')).rejects.toThrow(
                'round() takes a precision from 0 to 2147483647'
            );
            if (store.type !== DatabaseType.ORACLE) {
                // The least doubles, whose last digits are short of the 400 places Postgres holds a precision to.
                // Oracle's NUMBER holds none of them.
                expect(
                    await query(
                        "RETURN [round(2.2250738585072014E-308, 323), round(2.2250738585072014E-308, 400), round(4.9E-324, 324, 'UP'), round(4.9E-324, 323, 'UP')]"
                    )
                ).toEqual([[2.225073858507201e-308, 2.2250738585072014e-308, 4.9e-324, 9.9e-324]]);
            }
        });

        it('round() to 0 places rounds as round(x) does, half toward +infinity, and to more half away from zero', async () => {
            // Beyond the spec's steps for liberation-data/drivine#328: either side of 0, the first odd double past 2^52 and
            // numbers near NUMBER's greatest, to 0 places written, picked when compiling, and from an expression, by the CASE.
            for (const places of ['0', "toInteger('0')"]) {
                expect(
                    await query(
                        `RETURN [round(-0.0, ${places}), round(-0.4, ${places}), round(-0.49999999999999994, ${places}), round(-4503599627370497.0, ${places}), round(9.0E125, ${places}), round(-9.0E125, ${places})]`
                    )
                ).toEqual([[0.0, 0.0, 0.0, -4.503599627370497e15, 9.0e125, -9.0e125]]);
            }
            // An integer as a float, a huge or tiny number, a precision from data, and the doubles that a binary sum with
            // a half rounds up, the last below a half and the first odd past 2^52; round(x) likewise.
            await query('CREATE (:Round {q: 0, z: 0.0})');
            expect(
                await query(
                    'MATCH (n:Round) RETURN [round(3, 0), round(-3, 0), round(1.0E20, 0), round(-1.0E100, 0), round(1.0E-120, 0), round(-1.0E-120, 0), round(-2.5, n.q), round(-2.5, n.z), ' +
                        'round(0.49999999999999994, 0), round(4503599627370497.0, 0), round(0.49999999999999994), round(4503599627370497.0), round(-0.5), round(-2.5)]'
                )
            ).toEqual([
                [3.0, -3.0, 1.0e20, -1.0e100, 0.0, 0.0, -2.0, -2.0, 0.0, 4.503599627370497e15, 0.0, 4.503599627370497e15, 0.0, -2.0]
            ]);
            // Over an aggregate, where nothing is shared, with the precision written or read from a row; a negative one
            // still fails there, on zero too, as the WHEN for 0 places reads it first.
            expect(
                await query(
                    'UNWIND [-1.0, -1.5] AS x WITH x, 0 AS p RETURN p, [round(sum(x), 0), round(sum(x), p), round(sum(x), 1), round(avg(x) * 2, p)]'
                )
            ).toEqual([[0, [-2.0, -2.0, -2.5, -2.0]]]);
            await expect(query('UNWIND [0.0] AS x WITH x, -1 AS p RETURN p, round(sum(x), p)')).rejects.toThrow(
                'round() takes a precision from 0 to 2147483647'
            );
            // In a WHERE, a grouping key and an ORDER BY, and nested.
            expect(
                await query('UNWIND [-2.5, -0.5, 0.5, 2.5] AS x WITH x WHERE round(x, 0) >= 0 RETURN collect(x)')
            ).toEqual([[-0.5, 0.5, 2.5]]);
            expect(
                await query('UNWIND [-2.5, -0.5, 0.5, 2.5, 2.6] AS x RETURN round(x, 0) AS r, count(*) AS c ORDER BY r')
            ).toEqual([
                [-2.0, 1],
                [0.0, 1],
                [1.0, 1],
                [3.0, 2]
            ]);
            expect(await query('UNWIND [-2.5, 2.4, -0.5] AS x RETURN x ORDER BY round(x, 0), x')).toEqual([-2.5, -0.5, 2.4]);
            expect(await query('MATCH (n:Round) RETURN round(round(-2.5, n.q) - 0.5, n.z)')).toEqual([-2.0]);
            // Places a parameter or a parameter's key gives, picked when compiling: a fraction, -0.5, negated, or NaN is 0
            // places, as Neo4j casts NaN to 0, and 1.0 is 1; a mode rounds by it alone, to 0 places for NaN, given,
            // negated or a key (liberation-data/drivine#354). drivine-python's steps.
            expect(
                await query(
                    'RETURN [round(-2.5, $p), round(-2.5, $q), round(-2.5, -$r), round(-2.5, $z), round(-2.5, $n), ' +
                        "round(-2.5, $o), round(-2.55, $o), round(-2.5, 0.9999), round(-2.5, 1.0), round(-2.5, $p, 'HALF_UP'), " +
                        "round(-2.5, 0, 'HALF_UP'), round(-2.5, $m.z), round(-2.5, -0.5), round(-2.5, -0.9999), " +
                        "round(-2.5, $n, 'HALF_UP'), round(-2.55, $n, 'UP'), round(-2.5, $n, 'HALF_DOWN'), " +
                        "round(-2.5, -$n, 'HALF_UP'), round(-2.55, $m.n, 'UP')]",
                    { p: 0.7, q: -0.5, r: 0.5, z: 0, n: NaN, o: 1.0, m: { z: 0, n: NaN } }
                )
            ).toEqual([
                [-2.0, -2.0, -2.0, -2.0, -2.0, -2.5, -2.6, -2.0, -2.5, -3.0, -3.0, -2.0, -2.0, -2.0, -3.0, -3.0, -2.0, -3.0, -3.0]
            ]);
            // NaN's 0 places by each other mode, over an aggregate, and of a null value, as Neo4j gives them.
            expect(
                await query(
                    "UNWIND [1.25, -2.5] AS x RETURN [round(sum(x), $n, 'UP'), round(-2.5, $n, 'CEILING'), " +
                        "round(-2.5, $n, 'FLOOR'), round(-3.5, $n, 'HALF_EVEN'), round(-2.5, $n, 'DOWN'), round(null, $n, 'UP')]",
                    { n: NaN }
                )
            ).toEqual([[-2.0, -2.0, -3.0, -4.0, -2.0, null]]);
            // Below 0 places, given or written, negated or not, fails on the row that rounds a number by it, as in Neo4j.
            for (const [statement, parameters] of [
                ['RETURN round(-2.5, $n)', { n: -1 }],
                ['RETURN round(-2.5, -$n)', { n: 1 }],
                ['RETURN round(-2.5, -1)', {}]
            ] as [string, Record<string, any>][]) {
                await expect(query(statement, parameters)).rejects.toThrow(
                    'round() takes a precision from 0 to 2147483647'
                );
            }
        });

        it('round() of zero, which has no digits to count, gives zero, or null to a null precision, and fails on a negative one', async () => {
            // Zero, on which LOG fails (ORA-01428) were Oracle to count its digits by it, gives zero wherever it is read,
            // among rows that are not zero too.
            await query('UNWIND [0.0, 1.25, 0.0, -2.5] AS x CREATE (:Round {x: x})');
            expect(await query('MATCH (n:Round) WHERE round(n.x, 400) = 0 RETURN count(*)')).toEqual([2]);
            expect(
                await query("MATCH (n:Round) WHERE round(n.x, 2) = 0 AND round(n.x, 1, 'UP') = 0 RETURN count(*)")
            ).toEqual([2]);
            expect(
                await query('MATCH (n:Round) RETURN round(n.x, 1) AS r, count(*) AS c ORDER BY r')
            ).toEqual([[-2.5, 1], [0.0, 2], [1.3, 1]]);
            expect(await query("MATCH (n:Round) RETURN n.x ORDER BY round(n.x, 1, 'UP') DESC")).toEqual([
                1.25, 0.0, 0.0, -2.5
            ]);
            expect(
                await query(
                    "UNWIND [0.0, 0.0] AS x RETURN [round(sum(x), 2), round(avg(x), 400), round(min(x), 2, 'HALF_UP'), round(sum(x), 1, 'CEILING')]"
                )
            ).toEqual([[0.0, 0.0, 0.0, 0.0]]);
            expect(
                await query(
                    "MATCH (n:Round) WITH n.x AS x WHERE round(x, 2) = 0 RETURN [round(sum(x), 2), round(avg(x), 400), round(sum(x), 1, 'CEILING')]"
                )
            ).toEqual([[0.0, 0.0, 0.0]]);
            expect(
                await query(
                    "UNWIND range(0, 2999) AS i WITH toFloat(i % 3) * 0.5 AS x RETURN [sum(round(x, 400)), sum(round(x, 0)), sum(round(x, 0, 'UP')), count(*)]"
                )
            ).toEqual([[1500.0, 2000.0, 2000.0, 3000]]);
            expect(
                await query(
                    "UNWIND range(0, 2999) AS i WITH toFloat(i % 3) * 0.5 AS x WHERE round(x, 2) = 0 OR round(x, 400, 'UP') > 0 RETURN count(*)"
                )
            ).toEqual([3000]);
            expect(await query('RETURN [x IN [0.0, 1.55, 0.0] | round(x, 1)]')).toEqual([[0.0, 1.6, 0.0]]);
            expect(
                await query("RETURN [round($z, 2), round($z, 400, 'FLOOR'), round(0, 2), round(0.0, 2, 'UP')]", {
                    z: 0.0
                })
            ).toEqual([[0.0, 0.0, 0.0, 0.0]]);
            // The precision is read before zero is given back: a null one gives null, and a negative one from data
            // fails, under an aggregate too, where it is written out where it is read.
            expect(
                await query(
                    "MATCH (n:Round) WHERE n.x = 0 RETURN [round(0.0, null), round(0, null, 'HALF_UP'), round(n.x, n.none), round(n.x, n.none, 'UP')]"
                )
            ).toEqual([
                [null, null, null, null],
                [null, null, null, null]
            ]);
            await query('CREATE (:Round {x: 0.0, r: -2})');
            for (const statement of [
                'UNWIND [0.0, 0.0] AS x WITH x, -2 AS r RETURN r, round(sum(x), r)',
                "UNWIND [0.0, 0.0] AS x WITH x, -2 AS r RETURN r, round(sum(x), r, 'UP')",
                'MATCH (n:Round) WHERE n.r IS NOT NULL WITH n.x AS x, n.r AS r RETURN r, round(sum(x), r)',
                "MATCH (n:Round) WHERE n.r IS NOT NULL WITH n.x AS x, n.r AS r RETURN r, round(min(x), r, 'HALF_UP')"
            ]) {
                await expect(query(statement)).rejects.toThrow('round() takes a precision from 0 to 2147483647');
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
                await expect(query(statement)).rejects.toThrow(
                    'round() takes a precision from 0 to 2147483647, as in Neo4j.'
                );
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

        it('a null rounds to null by a negative precision from data, in an aggregate too, as in Neo4j', async () => {
            // liberation-data/drivine#336: Neo4j fails a negative precision only where there is a value to round.
            await query('CREATE (:Round {r: -2, k: 1, x: 1234.5, i: 1234}), (:Round {r: -2, k: 2})');
            expect(
                await query("MATCH (n:Round) WHERE n.k = 1 RETURN [round(n.none, n.r), round(n.none, n.r, 'HALF_UP')]")
            ).toEqual([[null, null]]);
            expect(await query('MATCH (n:Round) RETURN round(round(n.none, n.r), n.r)')).toEqual([null, null]);
            // Under an aggregate, where nothing is bound.
            expect(
                await query(
                    "MATCH (n:Round) WITH n.none AS x, n.r AS r WITH r, [round(min(x), r), round(max(x), r, 'HALF_UP')] AS v RETURN v"
                )
            ).toEqual([[null, null]]);
            expect(await query('MATCH (n:Round) RETURN collect(round(n.none, n.r))')).toEqual([[]]);
            // A null written in the statement, or a parameter's.
            expect(
                await query(
                    "MATCH (n:Round) WHERE n.k = 1 RETURN [round(null, n.r), round(null, n.r, 'UP'), round($v, n.r)]",
                    { v: null }
                )
            ).toEqual([[null, null, null]]);
            // A value there is still refused, -0.0 and a parameter's too.
            await expect(query('MATCH (n:Round) WHERE n.k = 1 RETURN round($v, n.r)', { v: 1.5 })).rejects.toThrow(
                'round() takes a precision from 0 to 2147483647, as in Neo4j.'
            );
            for (const statement of [
                'MATCH (n:Round) WHERE n.k = 1 RETURN round(-0.0, n.r)',
                'MATCH (n:Round) WHERE n.k = 1 RETURN round(n.x, n.r)',
                // An integer, which Oracle's JSON holds as a number of another kind than a float's.
                'MATCH (n:Round) WHERE n.k = 1 RETURN round(n.i, n.r)',
                "MATCH (n:Round) WHERE n.k = 1 RETURN round(n.x, n.r, 'HALF_UP')",
                'MATCH (n:Round) WITH n.x AS x, n.r AS r RETURN r, round(min(x), r)',
                "MATCH (n:Round) WITH n.x AS x, n.r AS r RETURN r, round(max(x), r, 'HALF_UP')",
                'MATCH (n:Round) RETURN collect(round(n.x, n.r))'
            ]) {
                await expect(query(statement)).rejects.toThrow(
                    'round() takes a precision from 0 to 2147483647, as in Neo4j.'
                );
            }
        });

        it('a precision written below 0 or past 2147483647 fails only on a row that rounds a number by it, with the compiler\'s message', async () => {
            // The spec's cases since liberation-data/drivine#364, here in a WHERE, an aggregate and a CASE, on rows filtered
            // out, and by a parameter no YAML holds.
            await query('CREATE (:Round {x: 1.5, k: 1}), (:Round {k: 2})');
            for (const [statement, parameters] of [
                ['MATCH (n:Round) WHERE n.k = 1 RETURN round(n.x, -2)', {}],
                ["MATCH (n:Round) WHERE round(n.x, 2147483648, 'UP') > 0 RETURN n.k", {}],
                ['MATCH (n:Round) RETURN sum(round(n.x, -$p))', { p: 2 }],
                ["MATCH (n:Round) RETURN collect(round(n.x, $p, 'HALF_UP'))", { p: 1.0e20 }],
                ['RETURN round(1.5, $p)', { p: Infinity }],
                ["RETURN round(1.5, $p, 'UP')", { p: -Infinity }],
                ['RETURN round(1.5, -9223372036854775808)', {}]
            ] as [string, Record<string, any>][]) {
                await expect(query(statement, parameters)).rejects.toThrow(
                    'round() takes a precision from 0 to 2147483647, as in Neo4j.'
                );
            }
            // A row that holds no number rounds to null, and a row the CASE does not round, or no row at all, fails nothing.
            expect(
                await query(
                    "MATCH (n:Round) WHERE n.k = 2 RETURN [round(n.x, -2), round(n.x, 2147483648, 'UP'), round(n.x, $p)]",
                    { p: 1.0e20 }
                )
            ).toEqual([[null, null, null]]);
            expect(
                await query("RETURN [round(null, $p), round(null, $p, 'FLOOR')]", { p: Infinity })
            ).toEqual([[null, null]]);
            expect(
                await query(
                    'MATCH (n:Round) RETURN CASE WHEN n.k > 0 THEN 0.0 ELSE round(1.5, -2) + round(n.x, 2147483648) END ORDER BY n.k'
                )
            ).toEqual([0.0, 0.0]);
            expect(
                await query(
                    "MATCH (n:Round) WHERE n.k = 1 RETURN collect(CASE WHEN n.k = 2 THEN round(n.x, -2, 'UP') END)"
                )
            ).toEqual([[]]);
            expect(
                await query("MATCH (n:Round) WHERE n.k = 3 RETURN [round(1.5, -2), round(1.5, $p, 'UP')]", {
                    p: 1.0e20
                })
            ).toEqual([]);
            expect(await query('UNWIND [] AS x RETURN round(1.5, -2)')).toEqual([]);
            // Nor in an ORDER BY whose round() reads nothing of the row. Not in a WHERE: Neo4j may test a condition that
            // reads nothing of a row before the rows' own, and Postgres does.
            expect(
                await query(
                    "MATCH (n:Round) WHERE n.k = 3 RETURN n.k ORDER BY round(1.5, -2), round(1.5, $p, 'UP')",
                    { p: 1.0e20 }
                )
            ).toEqual([]);
        });

        it("round() by a mode and sign() take the least positive numbers as positive, where Oracle's SIGN gives 0", async () => {
            // Oracle's SIGN gives 0 for a positive number from 1.0E-130 to under 1.0E-128 (liberation-data/drivine#342);
            // UP, DOWN and the HALF_ modes round by the sign.
            expect(
                await query(
                    "RETURN [round(1.0E-129, 2, 'UP'), round(1.0E-129, 0, 'UP'), round(-1.0E-129, 2, 'UP'), round(1.0E-129, 2, 'DOWN'), round(-1.0E-129, 2, 'DOWN'), round(1.0E-130, 2, 'UP'), round(1.0E-129, 2, 'CEILING'), round(1.0E-129, 129, 'UP')]"
                )
            ).toEqual([[0.01, 1.0, -0.01, 0.0, 0.0, 0.01, 0.01, 1.0e-129]]);
            expect(
                await query(
                    "RETURN [round(5.0E-130, 129, 'HALF_UP'), round(5.0E-130, 129, 'HALF_DOWN'), round(5.0E-130, 129, 'HALF_EVEN'), round(1.5E-129, 129, 'HALF_EVEN'), round(-5.0E-130, 129, 'HALF_UP'), round(9.0E-129, 128, 'HALF_UP')]"
                )
            ).toEqual([[1.0e-129, 0.0, 0.0, 2.0e-129, -1.0e-129, 1.0e-128]]);
            expect(
                await query(
                    'RETURN [sign(1.0E-129), sign(-1.0E-129), sign(0.0), sign(null), sign(1.0E-130), sign(9.99E-129), sign($x)]',
                    { x: 1.0e-129 }
                )
            ).toEqual([[1, -1, 0, null, 1, 1, 1]]);
            // Read from a row, beside 0, -0.0 and null, whose sign the rounding does not ask, and under an aggregate.
            expect(
                await query(
                    "UNWIND [1.0E-129, -1.0E-129, 0.0, -0.0, null] AS x RETURN [sign(x), round(x, 2, 'UP'), round(x, 129, 'HALF_EVEN'), round(x, 0, 'DOWN')]"
                )
            ).toEqual([
                [1, 0.01, 1.0e-129, 0.0],
                [-1, -0.01, -1.0e-129, 0.0],
                [0, 0.0, 0.0, 0.0],
                [0, 0.0, 0.0, 0.0],
                [null, null, null, null]
            ]);
            expect(
                await query(
                    "UNWIND [1.0E-129, 5.0E-130] AS x RETURN [sign(sum(x)), sum(sign(x)), sign(min(x)), round(max(x), 2, 'UP'), sign(sign(sign(min(x))))]"
                )
            ).toEqual([[1, 2, 1, 0.01, 1]]);
            // Numbers near NUMBER's greatest, which a sign told by a multiple of them would overflow.
            expect(
                await query('RETURN [sign(9.0E125), sign(-9.0E125), sign(7), sign(-0.5), sign(0.5)]')
            ).toEqual([[1, -1, 1, -1, 1]]);
        });

        /** The empty text, which Oracle reads as null. */
        const empty = store.type === DatabaseType.ORACLE ? null : '';

        /** What the compiler refuses a written float start or length `what` of `fn` with. */
        const float = (fn: string, what: string): string =>
            `${fn}() takes an integer for its ${what}, not a float, as in Neo4j.`;

        /** What the compiler refuses a start or length `what` of `fn` out of range with. */
        const outOfRange = (fn: string, what: string): string =>
            `${fn}() takes a ${what} from 0 to 2147483647, as in Neo4j.`;

        it('substring(), left() and right() refuse a written float, even a whole one, and a given start or length out of range, as Neo4j does', async () => {
            // Beyond the spec's steps for drivine4j's #263: a start or a length. Neo4j refuses a float it knows to be one
            // whatever the text; a bound one it cuts toward zero. It refuses one out of range only where the text is not null.
            for (const [statement, parameters, message] of [
                ["RETURN left('hello', 2.0)", {}, float('left', 'length')],
                ["RETURN right('hello', -0.5)", {}, float('right', 'length')],
                ["RETURN substring('hello', 1.0)", {}, float('substring', 'start')],
                ["RETURN right('hello', -1)", {}, outOfRange('right', 'length')],
                ["RETURN substring('hello', 1, -1)", {}, outOfRange('substring', 'length')],
                ["RETURN left('hello', 9223372036854775807)", {}, outOfRange('left', 'length')],
                ['RETURN substring($t, $s)', { t: 'hello', s: -1 }, outOfRange('substring', 'start')],
                // Bound, -1.5 is cut to -1, and 1.0E20 is past the greatest, as is an infinity.
                ["RETURN left('hello', $n)", { n: -1.5 }, outOfRange('left', 'length')],
                ["RETURN left('hello', $n)", { n: 1.0e20 }, outOfRange('left', 'length')],
                ["RETURN left('hello', $n)", { n: Infinity }, outOfRange('left', 'length')],
                ["RETURN left('hello', $n)", { n: -Infinity }, outOfRange('left', 'length')],
                // Negated, a bound number is negated before it is cut: -2.7 is -2.
                ["RETURN left('hello', -$n)", { n: 2.7 }, outOfRange('left', 'length')]
            ] as const) {
                await expect(query(statement, parameters)).rejects.toThrow(message);
            }
            expect(
                await query(
                    "RETURN [left('hello', 2), right('hello', 2), substring('hello', 1), substring('hello', 1, 2), left('hello', null), substring('hello', null), " +
                        "substring('hello', 1, null), left(null, -1), right(null, -1), substring(null, 1, -1), left('hello', 10), left('hello', 0), substring('hello', 10)]"
                )
            ).toEqual([['he', 'lo', 'ello', 'el', null, null, null, null, null, null, 'hello', empty, empty]]);
            expect(
                await query(
                    "RETURN [left($t, $m), left('hello', $i), left('hello', $f), substring('hello', $s, $l), left('hello', $q), right($t, $f), left('hello', $p.f), left($p.none, $m), left('hello', -$m), left('hello', -$q)]",
                    { t: null, m: -1, i: 2, f: 2.7, s: 1.7, l: 2.6, q: -0.5, p: { f: 2.7 } }
                )
            ).toEqual([[null, 'he', 'he', 'el', empty, null, 'he', null, 'h', empty]]);
            expect(await query("UNWIND $xs AS c RETURN left('hello', c)", { xs: [2.7, null] })).toEqual(['he', null]);
            // A bound NaN is 0, as Java casts a double to a long; a bigint and the Neo4j driver's Integer are the numbers they are.
            expect(
                await query("RETURN [left('hello', $n), substring('hello', $n), left('hello', $b), substring('hello', $i)]", {
                    n: NaN,
                    b: BigInt(2),
                    i: neo4j.int(1)
                })
            ).toEqual([[empty, 'hello', 'he', 'ello']]);
            // The greatest start or length is taken: a start past the text gives the empty text, written, bound or from a list.
            expect(
                await query(
                    "RETURN [substring('hello', 2147483647), left('hello', 2147483647), right('hello', 2147483647), substring('hello', 1, 2147483647), substring('hello', $m), " +
                        "substring('hello', 2147483647, 2147483647), substring('hello', $m, $m)]",
                    { m: 2147483647 }
                )
            ).toEqual([[empty, 'hello', 'hello', 'ello', empty, empty, empty]]);
            expect(await query("UNWIND $xs AS s RETURN substring('hello', s)", { xs: [2147483647] })).toEqual([empty]);
        });

        it('a start or length from data is cut toward zero, and one out of range fails only on a row that reads it, with the compiler\'s message', async () => {
            // Not in the spec yet (#263): a start or a length read from data, in a WHERE and an aggregate too, and on rows
            // filtered out.
            await query(
                "CREATE (:Count {k: 1, f: 2.7, w: 2.0, q: -0.5, r: -1.5, m: -1, h: 2147483647.9, hp: 2147483648.5, t: 'hello'}), " +
                    "(:Count {k: 2, m: 1, t: 'hello'}), (:Count {k: 3, m: -1, r: -1.5, hp: 2147483648.5})"
            );
            for (const [statement, message] of [
                ['MATCH (n:Count) RETURN left(n.t, n.m)', outOfRange('left', 'length')],
                ["MATCH (n:Count) WHERE left(n.t, n.m) = 'h' RETURN n.k", outOfRange('left', 'length')],
                ['MATCH (n:Count) RETURN collect(right(n.t, n.m))', outOfRange('right', 'length')],
                ['MATCH (n:Count) RETURN substring(n.t, n.m)', outOfRange('substring', 'start')],
                ['MATCH (n:Count) RETURN substring(n.t, 0, n.r)', outOfRange('substring', 'length')],
                // -1.5 is cut to -1, and 2147483648.5 to past the greatest.
                ['MATCH (n:Count) RETURN left(n.t, n.r)', outOfRange('left', 'length')],
                ['MATCH (n:Count) RETURN left(n.t, n.hp)', outOfRange('left', 'length')],
                // In an ORDER BY, and counted by an aggregate: three rows, less 5, is -2.
                ['MATCH (n:Count) RETURN n.k ORDER BY left(n.t, n.m)', outOfRange('left', 'length')],
                ['MATCH (n:Count) RETURN left(max(n.t), count(*) - 5)', outOfRange('left', 'length')],
                // Written, below 0, beside a text from data: it fails on the row whose text is not null.
                ['MATCH (n:Count) RETURN left(n.t, -1)', outOfRange('left', 'length')],
                // A constant the compiler does not read as given is worked out by the store, as one from data.
                ["RETURN left('hello', 1 - 3)", outOfRange('left', 'length')],
                ["RETURN substring('hello', toInteger('-2'))", outOfRange('substring', 'start')]
            ]) {
                await expect(query(statement)).rejects.toThrow(message);
            }
            // Bound past what a long holds, beside a text from data: cut to the greatest long, as Java casts a double.
            for (const n of [1.0e300, BigInt('1' + '0'.repeat(400)), -1.0e300]) {
                await expect(query('MATCH (n:Count) RETURN left(n.t, $n)', { n })).rejects.toThrow(
                    outOfRange('left', 'length')
                );
            }
            expect(
                await query(
                    'MATCH (n:Count) WHERE n.k = 1 RETURN [left(n.t, n.f), right(n.t, n.w), substring(n.t, n.f), substring(n.t, n.q, n.f), left(n.t, n.h), left(n.t, n.f * 1), left(n.none, n.f), left(n.t, n.q)]'
                )
            ).toEqual([['he', 'lo', 'llo', 'he', 'hello', 'he', null, empty]]);
            expect(
                await query('MATCH (n:Count) WHERE n.k = 1 RETURN [substring(n.t, n.h), substring(n.t, 0, n.h)]')
            ).toEqual([[empty, 'hello']]);
            expect(
                await query('MATCH (n:Count) RETURN [left(max(n.t), count(*)), substring(max(n.t), count(*) - 2, count(*))]')
            ).toEqual([['hel', 'ell']]);
            // Grouped by, as a key beside an aggregate.
            expect(await query('MATCH (n:Count) WHERE n.k = 2 RETURN substring(n.t, n.m), count(*)')).toEqual([
                ['ello', 1]
            ]);
            // Out of range beside a null text is null, as in Neo4j, and so is a null start or length.
            expect(
                await query(
                    'MATCH (n:Count) WHERE n.k = 3 RETURN [left(n.t, n.m), substring(n.t, n.m), left(n.t, -1), right(n.t, n.r)]'
                )
            ).toEqual([[null, null, null, null]]);
            // A constant out of range, which the compiler does not read as given, and one past SQL's integer: null beside a
            // null text, and not refused for the row filtered out.
            expect(
                await query(
                    'MATCH (n:Count) WHERE n.k = 3 RETURN [left(n.t, 1 - 3), substring(n.t, 0, 1 - 3), left(n.t, n.hp), left(n.t, 2147483647 + 1)]'
                )
            ).toEqual([[null, null, null, null]]);
            // Out of range beside a text of constants alone, on no row: the failure reads the text, so no store works it
            // out before a row, given or not.
            expect(
                await query(
                    "MATCH (n:Count) WHERE n.k = 99 RETURN [left(toUpper('hello'), -1), left('hello', 1 - 3), substring(toUpper('hello'), 0, 1 - 3)]"
                )
            ).toEqual([]);
            expect(
                await query(
                    'MATCH (n:Count) WHERE n.k = 2 RETURN [left(n.t, n.none), substring(n.t, n.none), substring(n.t, 1, n.none)]'
                )
            ).toEqual([[null, null, null]]);
            expect(
                await query(
                    "MATCH (n:Count) RETURN CASE WHEN n.m < 0 THEN 'none' ELSE left(n.t, n.m) END ORDER BY n.k"
                )
            ).toEqual(['none', 'h', 'none']);
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
            // Under 8 seconds on a laptop, and up to 17 on CI's runners: 30 leaves CI room and still catches the minute.
            expect(Date.now() - started).toBeLessThan(30_000);
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
