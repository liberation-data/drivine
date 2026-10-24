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
 * 5, the other suites', refuses two of them (a date added to a text, and an order by an aggregate of a variable no
 * item names). `CYPHER_SPEC_NEO4J_IMAGE` picks another.
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
                if (runsOn(cypherCase.steps[i], store.name) && !skipped(file, cypherCase, i)) {
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
    }
);
