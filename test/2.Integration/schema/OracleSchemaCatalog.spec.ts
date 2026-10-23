import * as fs from 'fs';
import * as path from 'path';
import {
    backendFor,
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    DatabaseType,
    fullTextIndex,
    GraphObjectManagerFactory,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    rangeIndex,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    uniquenessConstraint,
    VectorIndex,
    vectorIndex
} from '@liberation-data/drivine';
import { OracleGraph } from '@/backend/oracle';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';

jest.setTimeout(120_000);

/** What drivine4j wrote of a store's schema on Oracle, graph `jvm`: each item, with the statements that make it. */
const DRIVINE4J: { items: { spec: { kind: string; label: string; properties: string[] }; statements: string[] }[] } =
    JSON.parse(fs.readFileSync(path.join(__dirname, '../../1.Unit/golden/drivine4j-oracle-schema.json'), 'utf8'));

const GRAPH = 'jvm';
const EARLIER_GRAPH = 'earlier';

@NodeFragment({ labels: ['Chunk'] })
class Chunk {
    @NodeId() id: string;
    @VectorIndex({ dimensions: 2 }) embedding?: number[];
}

const ranges = [rangeIndex('Session', ['lastActivityAt', 'sessionId']), rangeIndex('Person', 'name')];
const vectors = vectorIndex('Chunk', 'embedding', 2, 'COSINE');
const texts = fullTextIndex('Article', ['title', 'body']);
const uniques = [uniquenessConstraint('Person', 'uuid'), uniquenessConstraint('Person', ['email', 'tenant'])];

interface Row {
    kind: string;
    label: string;
    properties: string;
    name: string;
    object_name: string | null;
    details: Record<string, string>;
}

/**
 * A store on Oracle that drivine4j and this library share: the catalog of what was made of indexes and constraints
 * is one, so each library sees, uses and drops what the other made.
 */
describeOnOracle("Oracle's schema catalog, as drivine4j keeps it", () => {
    let pm: PersistenceManager;
    let factory: GraphObjectManagerFactory;
    const manager = (graph: string): StatelessGraphObjectManager => factory.get(`ORACLE_${graph.toUpperCase()}`);
    const run = async (statement: string): Promise<void> => {
        await pm.execute(new QuerySpecification(statement));
    };
    const rows = async (graph: string): Promise<Row[]> =>
        (
            await pm.query<any>(
                new QuerySpecification(
                    `SELECT JSON_OBJECT('kind' VALUE kind, 'label' VALUE label, 'properties' VALUE properties, ` +
                        `'name' VALUE name, 'object_name' VALUE object_name, 'details' VALUE details RETURNING JSON) ` +
                        `FROM ${graph}_schema ORDER BY kind, label, properties`
                )
            )
        ).map((it) => (typeof it === 'string' ? JSON.parse(it) : it));
    /** The indexes on the graph's tables, by name, as Oracle holds them. */
    const indexes = async (graph: string): Promise<string[]> => {
        const found = await pm.query<string>(
            new QuerySpecification(
                `SELECT index_name FROM user_indexes WHERE table_name LIKE '${graph.toUpperCase()}\\_%' ESCAPE '\\' ` +
                    `AND index_type <> 'LOB' ORDER BY index_name`
            )
        );
        return found;
    };
    /** Drops the graph's property graph and every table of its own: nodes, relationships, catalog, side tables. */
    const dropGraph = async (graph: string): Promise<void> =>
        run(`BEGIN
    EXECUTE IMMEDIATE 'DROP PROPERTY GRAPH IF EXISTS ${graph}';
    FOR it IN (SELECT table_name FROM user_tables WHERE table_name LIKE '${graph.toUpperCase()}\\_%' ESCAPE '\\') LOOP
        EXECUTE IMMEDIATE 'DROP TABLE ' || it.table_name || ' CASCADE CONSTRAINTS PURGE';
    END LOOP;
END;`);
    /** Makes the graph afresh, with none of its tables beside the nodes and nothing recorded of its schema. */
    const freshGraph = async (graph: string): Promise<StatelessGraphObjectManager> => {
        await dropGraph(graph);
        await run(new OracleGraph(graph).ensuring);
        return manager(graph);
    };
    const madeByDrivine4j = async (): Promise<void> => {
        for (const item of DRIVINE4J.items) {
            for (const statement of item.statements) {
                await run(statement);
            }
        }
    };

    beforeAll(() => {
        pm = oraclePersistenceManager();
        for (const graph of [GRAPH, EARLIER_GRAPH]) {
            DatabaseRegistry.getInstance()
                .builder()
                .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: graph })
                .register(`ORACLE_${graph.toUpperCase()}`);
        }
        factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
    });

    afterAll(async () => {
        await dropGraph(GRAPH);
        await dropGraph(EARLIER_GRAPH);
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('should list, use and drop the indexes and constraints drivine4j made, and make none beside them', async () => {
        const gom = await freshGraph(GRAPH);
        await madeByDrivine4j();
        const written = await rows(GRAPH);
        const made = await indexes(GRAPH);

        const listed = await gom.indexes.list('RANGE');
        expect(listed.map((it) => [it.label, it.properties])).toEqual([
            ['Person', ['email', 'tenant']],
            ['Person', ['name']],
            ['Person', ['uuid']],
            ['Session', ['lastActivityAt', 'sessionId']]
        ]);
        expect(listed.filter((it) => it.incomplete)).toEqual([]);
        expect((await gom.constraints.list()).map((it) => it.properties)).toEqual([['email', 'tenant'], ['uuid']]);
        expect(await gom.indexes.list('VECTOR')).toEqual([
            expect.objectContaining({ label: 'Chunk', properties: ['embedding'], dimensions: 2, similarity: 'COSINE' })
        ]);
        expect((await gom.indexes.list('FULLTEXT')).map((it) => it.properties)).toEqual([['title', 'body']]);

        for (const spec of [...ranges, vectors, texts]) {
            expect((await gom.indexes.ensure(spec)).status).toEqual('ALREADY_MATCHING');
        }
        for (const spec of uniques) {
            expect((await gom.constraints.ensure(spec)).status).toEqual('ALREADY_MATCHING');
        }
        expect(await rows(GRAPH)).toEqual(written);
        expect(await indexes(GRAPH)).toEqual(made);

        // A search goes through the table drivine4j made, which its trigger keeps in step with what this library saves.
        const backend = backendFor(DatabaseType.ORACLE, GRAPH);
        const tableOf = async (kind: 'VECTOR' | 'FULLTEXT', label: string, properties: string[]) =>
            pm.maybeGetOne<string>(backend.searchIndexTable!(kind, label, properties).spec());
        const graph = new OracleGraph(GRAPH);
        expect(await tableOf('VECTOR', 'Chunk', ['embedding'])).toEqual(graph.vectors('Chunk', 'embedding'));
        expect(await tableOf('FULLTEXT', 'Article', ['title', 'body'])).toEqual(
            graph.texts('Article', ['title', 'body'])
        );
        await gom.saveAll([
            Object.assign(new Chunk(), { id: 'c1', embedding: [1, 0] }),
            Object.assign(new Chunk(), { id: 'c2', embedding: [0, 1] })
        ]);
        expect(
            Number(
                await pm.getOne(new QuerySpecification(`SELECT COUNT(*) FROM ${graph.vectors('Chunk', 'embedding')}`))
            )
        ).toEqual(2);
        expect((await gom.loadNearest(Chunk, [0, 1], { topK: 1 })).map((it) => it.value.id)).toEqual(['c2']);

        for (const spec of uniques) {
            await gom.constraints.drop(spec);
        }
        for (const spec of [...ranges, uniques[0], uniques[1], vectors, texts]) {
            await gom.indexes.drop(spec.kind === 'UNIQUE' ? rangeIndex(spec.label, spec.properties) : spec);
        }
        expect(await rows(GRAPH)).toEqual([]);
        expect((await indexes(GRAPH)).filter((it) => /^JVM_(IX|LX|UQ|V|T)_/.test(it))).toEqual([]);
        expect(await tableOf('VECTOR', 'Chunk', ['embedding'])).toBeUndefined();
    });

    it('should record what drivine4j records, to the object names', async () => {
        await freshGraph(GRAPH);
        await madeByDrivine4j();
        const theirs = await rows(GRAPH);

        const gom = await freshGraph(GRAPH);
        for (const spec of [...ranges, vectors, texts]) {
            expect((await gom.indexes.ensure(spec)).status).toEqual('CREATED');
        }
        for (const spec of uniques) {
            expect((await gom.constraints.ensure(spec)).status).toEqual('CREATED');
        }
        const ours = await rows(GRAPH);
        // drivine4j's unique index over several properties is of another expression than its labelled index, and it
        // makes both. This library's is of the labelled index's own, which Oracle would not make twice, so it stands for
        // the labelled index, as over one property.
        const pair = (it: Row): boolean => it.kind === 'RANGE_INDEX' && it.properties === '["email","tenant"]';
        expect(ours.filter((it) => !pair(it))).toEqual(theirs.filter((it) => !pair(it)));
        expect(ours.filter(pair)).toEqual(
            theirs.filter(pair).map((it) => ({
                ...it,
                details: { unique: new OracleGraph(GRAPH).objectName('uq', ['Person', 'email', 'tenant']) }
            }))
        );
    });

    it('should complete a range index that lost the uniqueness constraint standing for its labelled index', async () => {
        const gom = await freshGraph(GRAPH);
        const [unique] = uniques;
        const range = rangeIndex(unique.label, unique.properties);
        expect((await gom.indexes.ensure(range)).status).toEqual('CREATED');
        expect((await gom.constraints.ensure(unique)).status).toEqual('CREATED');
        expect((await gom.indexes.list('RANGE')).find((it) => it.label === 'Person')?.incomplete).toBeUndefined();

        await gom.constraints.drop(unique);
        expect((await gom.indexes.list('RANGE')).find((it) => it.label === 'Person')?.incomplete).toBe(true);
        expect((await gom.indexes.ensure(range)).status).toEqual('CREATED');
        expect((await gom.indexes.list('RANGE')).find((it) => it.label === 'Person')?.incomplete).toBeUndefined();
        expect(await indexes(GRAPH)).toContain(
            new OracleGraph(GRAPH).objectName('lx', ['Person', 'uuid']).toUpperCase()
        );
    });

    it('should keep the index two labels share over a property until the last range index over it is dropped', async () => {
        const gom = await freshGraph(GRAPH);
        const graph = new OracleGraph(GRAPH);
        const shared = graph.objectName('ix', ['name']).toUpperCase();
        const [person, company] = [rangeIndex('Person', 'name'), rangeIndex('Company', 'name')];
        expect((await gom.indexes.ensure(person)).status).toEqual('CREATED');
        expect((await gom.indexes.ensure(company)).status).toEqual('CREATED');
        expect((await indexes(GRAPH)).filter((it) => it === shared)).toEqual([shared]);

        await gom.indexes.drop(person);
        expect(await indexes(GRAPH)).toContain(shared);
        expect(await indexes(GRAPH)).not.toContain(graph.objectName('lx', ['Person', 'name']).toUpperCase());
        expect((await gom.indexes.list('RANGE')).map((it) => [it.label, it.incomplete])).toEqual([
            ['Company', undefined]
        ]);

        await gom.indexes.drop(company);
        expect(await indexes(GRAPH)).not.toContain(shared);
        expect(await rows(GRAPH)).toEqual([]);
    });

    it('should leave the range index incomplete where the data refuses its constraint, for an ensure to complete', async () => {
        const gom = await freshGraph(GRAPH);
        const graph = new OracleGraph(GRAPH);
        const [unique] = uniques;
        const range = rangeIndex(unique.label, unique.properties);
        expect((await gom.indexes.ensure(range)).status).toEqual('CREATED');
        for (let i = 0; i < 2; i++) {
            await run(`INSERT INTO ${graph.nodes} (labels, props) VALUES (JSON('["Person"]'), JSON('{"uuid": "u1"}'))`);
        }

        // Unchecked, the unique index is refused (ORA-01452) after the labelled index it would stand for was dropped.
        await expect(gom.constraints.ensure(unique, 0)).rejects.toThrow(/ORA-01452/);
        expect(await gom.constraints.list()).toEqual([]);
        expect((await gom.indexes.list('RANGE')).find((it) => it.label === 'Person')?.incomplete).toBe(true);

        expect((await gom.indexes.ensure(range)).status).toEqual('CREATED');
        expect((await gom.indexes.list('RANGE')).find((it) => it.label === 'Person')?.incomplete).toBeUndefined();
        expect(await indexes(GRAPH)).toContain(graph.objectName('lx', ['Person', 'uuid']).toUpperCase());
    });

    it('should understand a store this library wrote before it recorded what drivine4j records', async () => {
        const gom = await freshGraph(EARLIER_GRAPH);
        const graph = new OracleGraph(EARLIER_GRAPH);
        const catalog = graph.catalog;
        // As this library made a range index and a uniqueness constraint: one labelled index each, named by a hash.
        const labelled = (property: string): string =>
            `CASE WHEN JSON_EXISTS(n.labels, '$?(@ == "Person")') THEN JSON_VALUE(n.props, '$."${property}"' ` +
            `RETURNING VARCHAR2(4000) NULL ON ERROR) END`;
        await run(`CREATE INDEX EARLIER_R_0123456789AB ON ${graph.nodes} n (${labelled('name')})`);
        await run(`CREATE UNIQUE INDEX EARLIER_U_0123456789AB ON ${graph.nodes} n (${labelled('uuid')})`);
        await run(
            `INSERT INTO ${catalog} (kind, label, properties, name, object_name, details) VALUES ` +
                `('RANGE', 'Person', '["name"]', 'Person_name_range', 'EARLIER_R_0123456789AB', JSON('{}'))`
        );
        await run(
            `INSERT INTO ${catalog} (kind, label, properties, name, object_name, details) VALUES ` +
                `('UNIQUE', 'Person', '["uuid"]', 'Person_uuid_unique', 'EARLIER_U_0123456789AB', JSON('{}'))`
        );
        // And a vector index: its table as it is named now, recorded under the kind it was recorded as then.
        await gom.indexes.ensure(vectors);
        await run(`UPDATE ${catalog} SET kind = 'VECTOR' WHERE kind = 'VECTOR_INDEX'`);

        expect((await gom.indexes.list('RANGE')).map((it) => [it.properties, it.incomplete])).toEqual([
            [['name'], undefined]
        ]);
        expect((await gom.constraints.list()).map((it) => it.properties)).toEqual([['uuid']]);
        expect((await gom.indexes.ensure(rangeIndex('Person', 'name'))).status).toEqual('ALREADY_MATCHING');
        expect((await gom.constraints.ensure(uniques[0])).status).toEqual('ALREADY_MATCHING');
        expect((await gom.indexes.ensure(vectors)).status).toEqual('ALREADY_MATCHING');
        const backend = backendFor(DatabaseType.ORACLE, EARLIER_GRAPH);
        expect(
            await pm.maybeGetOne<string>(backend.searchIndexTable!('VECTOR', 'Chunk', ['embedding']).spec())
        ).toEqual(graph.vectors('Chunk', 'embedding'));

        // A range index over the unique property is served by the earlier constraint's index, as by one made now.
        expect((await gom.indexes.ensure(rangeIndex('Person', 'uuid'))).status).toEqual('CREATED');
        // A constraint over the earlier range index's property replaces that index, which Oracle won't hold twice.
        expect((await gom.constraints.ensure(uniquenessConstraint('Person', 'name'))).status).toEqual('CREATED');
        expect(await indexes(EARLIER_GRAPH)).not.toContain('EARLIER_R_0123456789AB');
        expect((await gom.indexes.list('RANGE')).map((it) => [it.properties, it.incomplete])).toEqual([
            [['name'], undefined],
            [['uuid'], undefined]
        ]);

        await gom.constraints.drop(uniques[0]);
        await gom.constraints.drop(uniquenessConstraint('Person', 'name'));
        for (const spec of [rangeIndex('Person', 'name'), rangeIndex('Person', 'uuid'), vectors]) {
            await gom.indexes.drop(spec);
        }
        expect(await rows(EARLIER_GRAPH)).toEqual([]);
        expect((await indexes(EARLIER_GRAPH)).filter((it) => /^EARLIER_(R|U|IX|LX|UQ|V)_/.test(it))).toEqual([]);
    });
});
