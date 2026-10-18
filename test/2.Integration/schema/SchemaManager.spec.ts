import {
    DatabaseRegistry,
    GraphObjectManagerFactory,
    PersistenceManagerFactory,
    QuerySpecification,
    rangeIndex,
    SchemaCatalog,
    SchemaManager,
    TransactionContextHolder,
    uniquenessConstraint,
    vectorIndex
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

describe.each(graphEngines())('SchemaManager on $type', (engine) => {
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
        await gom.persistenceManager.execute(new QuerySpecification('MATCH (m:_DrivineSchema) DETACH DELETE m'));
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
});
