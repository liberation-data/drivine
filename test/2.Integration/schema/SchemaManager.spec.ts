import {
    DatabaseRegistry,
    NodeFragment,
    NodeId,
    GraphObjectManagerFactory,
    PersistenceManagerFactory,
    rangeIndex,
    SchemaCatalog,
    SchemaManager,
    TransactionContextHolder,
    uniquenessConstraint,
    vectorIndex
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

describe.each(allStores())('SchemaManager on $type', (engine) => {
    let factory: GraphObjectManagerFactory;
    const items = [
        rangeIndex('ManagedDoc', 'contextId'),
        uniquenessConstraint('ManagedDoc', 'id'),
        vectorIndex('ManagedDoc', 'embedding', 3)
    ];
    const manager = (
        catalogs: SchemaCatalog[],
        options: Partial<ConstructorParameters<typeof SchemaManager>[1]> = {}
    ) => new SchemaManager(factory, { catalogs: catalogs.map((it) => it.forDatabase(engine.name)), ...options });
    const statuses = async (m: SchemaManager, run: 'enforce' | 'recreateAll' = 'enforce'): Promise<string[]> =>
        [...(await m[run]()).values()].flat().map((it) => `${it.spec.kind}:${it.status}`);

    const tidy = async (): Promise<void> => {
        const gom = factory.get(engine.name);
        await gom.constraints.drop(uniquenessConstraint('ManagedDoc', 'id'));
        await gom.indexes.drop(rangeIndex('ManagedDoc', 'contextId'));
        await gom.indexes.drop(vectorIndex('ManagedDoc', 'embedding', 3));
        await clearLabels(gom.persistenceManager, engine, '_DrivineSchema', 'ManagedDoc');
    };

    beforeAll(async () => {
        persistenceManagerFor(engine);
        factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
        await tidy();
    });

    afterAll(async () => {
        await tidy();
        await closeGraphEngines();
    });

    it('should make what is missing, indexes before constraints, and nothing the second time', async () => {
        expect(await statuses(manager([SchemaCatalog.of(...items)]))).toEqual([
            'RANGE:CREATED',
            'VECTOR:CREATED',
            'UNIQUE:CREATED'
        ]);
        expect(await statuses(manager([SchemaCatalog.of(...items)]))).toEqual([
            'RANGE:ALREADY_MATCHING',
            'VECTOR:ALREADY_MATCHING',
            'UNIQUE:ALREADY_MATCHING'
        ]);
    });

    it('should fail on drift, warn about it, or recreate it, as asked', async () => {
        const drifted = SchemaCatalog.of(vectorIndex('ManagedDoc', 'embedding', 4));
        await expect(manager([drifted]).enforce()).rejects.toThrow(/DRIFT for the VECTOR on ManagedDoc/);
        expect(await statuses(manager([drifted], { mode: 'WARN' }))).toEqual(['VECTOR:DRIFT']);
        expect(await statuses(manager([drifted], { recreateOnDrift: true }))).toEqual(['VECTOR:RECREATED']);
        expect(await statuses(manager([SchemaCatalog.of(...items)], { recreateOnDrift: true }))).toContain(
            'VECTOR:RECREATED'
        );
    });

    it('should adopt a first version, and recreate the catalog once when it changes', async () => {
        const v1 = SchemaCatalog.of(...items).withVersion('model-1');
        expect(await statuses(manager([v1]))).not.toContain('RANGE:RECREATED');
        const v2 = SchemaCatalog.of(...items).withVersion('model-2');
        expect(await statuses(manager([v2]))).toEqual(['RANGE:RECREATED', 'VECTOR:RECREATED', 'UNIQUE:CREATED']);
        expect(await statuses(manager([v2]))).toEqual([
            'RANGE:ALREADY_MATCHING',
            'VECTOR:ALREADY_MATCHING',
            'UNIQUE:ALREADY_MATCHING'
        ]);
    });

    it('should refuse conflicting declarations of one item', async () => {
        const a = SchemaCatalog.of(vectorIndex('ManagedDoc', 'embedding', 3));
        const b = SchemaCatalog.of(vectorIndex('ManagedDoc', 'embedding', 5));
        await expect(manager([a, b]).enforce()).rejects.toThrow(/declare the VECTOR on ManagedDoc\(embedding\)/);
    });

    it("should keep a marker per owner in drivine4j's shape: version and inventory, under scope", async () => {
        await manager([
            SchemaCatalog.of(...items).withVersion('v1'),
            SchemaCatalog.of(items[0]).named('rag')
        ]).enforce();
        const gom = factory.get(engine.name);
        const read = async (scope: string, property: 'version' | 'items') => {
            const value = await gom.persistenceManager.maybeGetOne<string>(
                gom.backend.schemaMarker(property).spec({ scope })
            );
            return property === 'items' ? gom.backend.markerItems(value) : value;
        };
        expect(await read('schema', 'version')).toEqual('v1');
        expect(await read('schema', 'items')).toEqual([
            'RANGE_INDEX:ManagedDoc:contextId:ManagedDoc_contextId_range',
            'UNIQUENESS_CONSTRAINT:ManagedDoc:id:ManagedDoc_id_unique',
            'VECTOR_INDEX:ManagedDoc:embedding:ManagedDoc_embedding_vector'
        ]);
        expect(await read('rag', 'version')).toBeNull();
        expect(await read('rag', 'items')).toEqual(['RANGE_INDEX:ManagedDoc:contextId:ManagedDoc_contextId_range']);
        // The marker's key is guarded by a uniqueness constraint, made the first time an owner versions.
        expect(
            (await gom.constraints.list()).some((it) => it.label === '_DrivineSchema' && it.properties[0] === 'scope')
        ).toBe(true);
    });

    it("should not let one owner's version recreate an item another owner declares too", async () => {
        const shared = rangeIndex('ManagedDoc', 'contextId');
        await manager([SchemaCatalog.of(...items).withVersion('a1'), SchemaCatalog.of(shared).named('rag')]).enforce();
        const results = await statuses(
            manager([SchemaCatalog.of(...items).withVersion('a2'), SchemaCatalog.of(shared).named('rag')])
        );
        expect(results.filter((it) => it.startsWith('RANGE'))).toEqual([
            'RANGE:ALREADY_MATCHING',
            'RANGE:ALREADY_MATCHING'
        ]);
        expect(results).toContain('VECTOR:RECREATED');
    });

    it('should recreate every item on startup when told to', async () => {
        await manager([SchemaCatalog.of(...items)]).enforce();
        expect(await statuses(manager([SchemaCatalog.of(...items)], { recreateOnStartup: true }))).toEqual([
            'RANGE:RECREATED',
            'VECTOR:RECREATED',
            'UNIQUE:CREATED'
        ]);
    });

    it('should report as many violating values as asked, or leave the engine to refuse when asked for none', async () => {
        const gom = factory.get(engine.name);
        const unique = uniquenessConstraint('ManagedDoc', 'id');
        await gom.constraints.drop(unique);
        await gom.saveAll(
            ['a', 'a', 'b', 'b', 'c', 'c'].map((id, i) => Object.assign(new ManagedDoc(), { key: `k${i}`, id }))
        );
        const one = await manager([SchemaCatalog.of(unique)], { mode: 'WARN', violationSampleSize: 1 }).enforce();
        const result = [...one.values()].flat()[0];
        expect([result.status, result.sample?.length]).toEqual(['VIOLATION', 1]);
        await expect(manager([SchemaCatalog.of(unique)], { violationSampleSize: 0 }).enforce()).rejects.toThrow();
        await clearLabels(gom.persistenceManager, engine, 'ManagedDoc');
    });
});

@NodeFragment({ labels: ['ManagedDoc'] })
class ManagedDoc {
    @NodeId() key: string;
    id: string;
}
