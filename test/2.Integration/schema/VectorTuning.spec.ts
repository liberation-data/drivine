import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    falkorDbVectorOptions,
    GraphObjectManagerFactory,
    ModelRegistry,
    neo4jVectorOptions,
    NodeFragment,
    NodeId,
    PersistenceManagerFactory,
    SchemaCatalog,
    SchemaManager,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    VectorIndex,
    vectorIndex
} from '@liberation-data/drivine';
import { allStores, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

jest.setTimeout(60_000);

@NodeFragment({ labels: ['TunedChunk'] })
class TunedChunk {
    @NodeId() id: string;
    @VectorIndex({ dimensions: 4, hnswM: 24 }) embedding?: number[];
}

describe.each(allStores())('vector index tuning on $type', (engine) => {
    let gom: StatelessGraphObjectManager;
    const supportsHnsw = engine.type === DatabaseType.NEO4J || engine.type === DatabaseType.FALKORDB;
    const tuned = vectorIndex('TunedChunk', 'embedding', 4, 'COSINE', {
        hnswM: 24,
        hnswEfConstruction: 150,
        engineOptions: [neo4jVectorOptions({ quantizationEnabled: false }), falkorDbVectorOptions({ efRuntime: 20 })]
    });

    beforeAll(async () => {
        gom = new StatelessGraphObjectManager(
            persistenceManagerFor(engine),
            backendFor(engine.type),
            new ModelRegistry()
        );
        await gom.indexes.drop(tuned);
    });

    afterAll(async () => {
        await gom.indexes.drop(tuned);
        await closeGraphEngines();
    });

    it('should pin what the engine can express, read it back, and drift only on a pinned value it contradicts', async () => {
        expect((await gom.indexes.ensure(tuned)).status).toEqual('CREATED');
        const listed = (await gom.indexes.list('VECTOR')).find((it) => it.label === 'TunedChunk')!;
        if (engine.type === DatabaseType.NEO4J) {
            expect([listed.hnswM, listed.hnswEfConstruction, listed.quantizationEnabled]).toEqual([24, 150, false]);
        }
        if (engine.type === DatabaseType.FALKORDB) {
            expect([listed.hnswM, listed.hnswEfConstruction, listed.efRuntime]).toEqual([24, 150, 20]);
        }
        expect((await gom.indexes.ensure(tuned)).status).toEqual('ALREADY_MATCHING');
        if (engine.type === DatabaseType.NEO4J) {
            const quantized = vectorIndex('TunedChunk', 'embedding', 4, 'COSINE', {
                engineOptions: [neo4jVectorOptions({ quantizationEnabled: true })]
            });
            const drifted = await gom.indexes.ensure(quantized);
            expect([drifted.status, drifted.found?.quantizationEnabled]).toEqual(['DRIFT', false]);
        }
        // Unpinned is never drift.
        expect((await gom.indexes.ensure(vectorIndex('TunedChunk', 'embedding', 4))).status).toEqual(
            'ALREADY_MATCHING'
        );
        const otherM = vectorIndex('TunedChunk', 'embedding', 4, 'COSINE', { hnswM: 32 });
        const result = await gom.indexes.ensure(otherM);
        // Where the engine has no HNSW parameters, the pin is reported as unsupported, not drift for ever.
        expect(result.status).toEqual(supportsHnsw ? 'DRIFT' : 'ALREADY_MATCHING');
        if (supportsHnsw) {
            expect(result.found?.hnswM).toEqual(24);
            await gom.indexes.recreate(otherM);
            expect((await gom.indexes.ensure(otherM)).status).toEqual('ALREADY_MATCHING');
        }
    });

    it("should let a catalog spec's engine options win over the decorator's portable declaration", async () => {
        await gom.indexes.drop(tuned);
        const factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
        const quantized = vectorIndex('TunedChunk', 'embedding', 4, 'COSINE', {
            hnswM: 24,
            engineOptions: [neo4jVectorOptions({ quantizationEnabled: false })]
        });
        await new SchemaManager(factory, {
            catalogs: [
                SchemaCatalog.fromFragments(undefined, TunedChunk).forDatabase(engine.name),
                SchemaCatalog.of(quantized).forDatabase(engine.name)
            ]
        }).enforce();
        const listed = (await gom.indexes.list('VECTOR')).find((it) => it.label === 'TunedChunk')!;
        if (engine.type === DatabaseType.NEO4J) {
            expect(listed.quantizationEnabled).toBe(false);
        }
        expect(listed.dimensions).toEqual(4);
        const clashing = vectorIndex('TunedChunk', 'embedding', 4, 'COSINE', {
            hnswM: 24,
            engineOptions: [neo4jVectorOptions({ quantizationEnabled: true })]
        });
        await expect(
            new SchemaManager(factory, {
                catalogs: [
                    SchemaCatalog.of(quantized).forDatabase(engine.name),
                    SchemaCatalog.of(clashing).forDatabase(engine.name)
                ]
            }).enforce()
        ).rejects.toThrow(/differently/);
        await expect(
            new SchemaManager(factory, {
                catalogs: [
                    SchemaCatalog.fromFragments(undefined, TunedChunk).forDatabase(engine.name),
                    SchemaCatalog.of(vectorIndex('TunedChunk', 'embedding', 4, 'COSINE', { hnswM: 16 })).forDatabase(
                        engine.name
                    )
                ]
            }).enforce()
        ).rejects.toThrow(/differently/);
    });
});
