import {
    CypherBackend,
    cypherGrammarFor,
    DatabaseType,
    fullTextIndex,
    ModelRegistry,
    PersistenceManager,
    StatelessGraphObjectManager,
    vectorIndex
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

describe.each(graphEngines())('vector and full-text indexes on $type', (engine) => {
    let gom: StatelessGraphObjectManager;
    const vector = vectorIndex('SchemaChunk', 'embedding', 3, 'COSINE');
    const text = fullTextIndex('SchemaChunk', ['title', 'body']);

    const tidy = async (): Promise<void> => {
        await gom.indexes.drop(vector);
        await gom.indexes.drop(text);
        await gom.indexes.drop(fullTextIndex('SchemaChunk', 'title'));
    };

    beforeAll(async () => {
        const pm: PersistenceManager = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
        await tidy();
    });

    afterAll(async () => {
        await tidy();
        await closeGraphEngines();
    });

    it('should make a vector index once, and report drift in its shape without changing it', async () => {
        expect((await gom.indexes.ensure(vector)).status).toEqual('CREATED');
        expect((await gom.indexes.ensure(vector)).status).toEqual('ALREADY_MATCHING');
        const listed = (await gom.indexes.list('VECTOR')).find((it) => it.label === 'SchemaChunk');
        expect([listed?.properties, listed?.dimensions, listed?.similarity]).toEqual([['embedding'], 3, 'COSINE']);

        const wider = vectorIndex('SchemaChunk', 'embedding', 4, 'COSINE');
        const drift = await gom.indexes.ensure(wider);
        expect(drift.status).toEqual('DRIFT');
        expect(drift.found?.dimensions).toEqual(3);
        expect((await gom.indexes.ensure(vectorIndex('SchemaChunk', 'embedding', 3, 'EUCLIDEAN'))).status).toEqual(
            'DRIFT'
        );

        expect((await gom.indexes.recreate(wider)).status).toEqual('RECREATED');
        expect((await gom.indexes.ensure(wider)).status).toEqual('ALREADY_MATCHING');
        await gom.indexes.recreate(vector);
    });

    it('should make a full-text index once; another over other properties is drift on FalkorDB, a second index elsewhere', async () => {
        expect((await gom.indexes.ensure(text)).status).toEqual('CREATED');
        expect((await gom.indexes.ensure(fullTextIndex('SchemaChunk', ['body', 'title']))).status).toEqual(
            'ALREADY_MATCHING'
        );
        const narrower = fullTextIndex('SchemaChunk', 'title');
        // FalkorDB holds one full-text index to a label; Neo4j and Memgraph name each, by its label and properties.
        expect((await gom.indexes.ensure(narrower)).status).toEqual(
            engine.type === DatabaseType.FALKORDB ? 'DRIFT' : 'CREATED'
        );
        expect((await gom.indexes.recreate(narrower)).status).toEqual('RECREATED');
        expect((await gom.indexes.ensure(narrower)).status).toEqual('ALREADY_MATCHING');
    });
});
