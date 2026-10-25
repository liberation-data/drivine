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
    }
);
