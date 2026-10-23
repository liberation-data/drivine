import {
    DatabaseRegistry,
    DatabaseType,
    QuerySpecification,
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
import { DrivineLogger } from '@/logger';
import { inventoryEntries, readInventory } from '@/schema/SchemaInventory';
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
        // An item ensured at runtime is kept behind drivine4j's prefixes, in the same property.
        await gom.persistenceManager.execute(
            gom.backend.recordSchemaMarker().spec({
                scope: 'rag',
                version: null,
                items: inventoryEntries(['a', 'b', 'c'], new Set(['b', 'c']), new Set(['c']))
            })
        );
        expect(await read('rag', 'items')).toEqual(['a', 'runtime:b', 'runtime-stale:c']);
        expect(readInventory((await read('rag', 'items')) as string[])).toEqual({
            keys: ['a', 'b', 'c'],
            runtime: new Set(['b', 'c']),
            stale: new Set(['c'])
        });
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

    describe('with an index in the way of a uniqueness constraint', () => {
        const ledger = uniquenessConstraint('Ledger', 'ref');
        const neo4j = engine.type === DatabaseType.NEO4J;
        const gom = () => factory.get(engine.name);
        const rangeNames = async (label: string) =>
            (await gom().indexes.list('RANGE')).filter((it) => it.label === label).map((it) => it.name);
        /** A plain index made by hand, as Drivine wouldn't name it, on Neo4j; Drivine's own elsewhere. */
        const plainIndex = async (label: string, property: string): Promise<void> => {
            if (neo4j) {
                await gom().persistenceManager.execute(
                    new QuerySpecification(
                        `CREATE INDEX ${label.toLowerCase()}_lookup FOR (n:${label}) ON (n.${property})`
                    )
                );
            } else {
                await gom().indexes.ensure(rangeIndex(label, property));
            }
        };
        const tidyLedger = async (): Promise<void> => {
            await gom().constraints.drop(ledger);
            await gom().constraints.drop(uniquenessConstraint('_DrivineSchema', 'scope'));
            for (const label of ['Ledger', '_DrivineSchema']) {
                for (const it of (await gom().indexes.list('RANGE')).filter((index) => index.label === label)) {
                    if (neo4j && it.name) {
                        await gom().persistenceManager.execute(
                            new QuerySpecification(`DROP INDEX ${it.name} IF EXISTS`)
                        );
                    } else {
                        await gom().indexes.drop(rangeIndex(label, it.properties));
                    }
                }
            }
            await clearLabels(gom().persistenceManager, engine, '_DrivineSchema', 'Ledger');
        };

        beforeEach(async () => {
            await tidyLedger();
            await plainIndex('Ledger', 'ref');
        });

        afterAll(async () => tidyLedger());

        it(`should ${
            neo4j ? 'report the index by name, and replace it when asked' : 'make the constraint beside it'
        }`, async () => {
            const result = await gom().constraints.ensure(ledger);
            if (neo4j) {
                expect([result.status, result.index?.name]).toEqual(['BLOCKED_BY_INDEX', 'ledger_lookup']);
                expect(await gom().constraints.list()).not.toContainEqual(expect.objectContaining({ label: 'Ledger' }));
                expect((await gom().constraints.ensure(ledger, undefined, true)).status).toEqual('CREATED');
                expect(await rangeNames('Ledger')).toEqual([]);
            } else {
                expect(result.status).toEqual('CREATED');
                expect(await rangeNames('Ledger')).toHaveLength(1);
            }
        });

        it('should keep the range index made first beside the constraint, asked to replace one in the way', async () => {
            await tidyLedger();
            await gom().indexes.ensure(rangeIndex('Ledger', 'ref'));
            expect((await gom().constraints.ensure(ledger, undefined, true)).status).toEqual('CREATED');
            expect(await rangeNames('Ledger')).toHaveLength(neo4j ? 0 : 1);
        });

        it('should fail enforce under FAIL_FAST naming the index, continue under WARN, and replace it when asked', async () => {
            const catalog = SchemaCatalog.of(ledger);
            if (neo4j) {
                await expect(manager([catalog]).enforce()).rejects.toThrow(
                    /BLOCKED_BY_INDEX for the UNIQUE on Ledger\(ref\): index ledger_lookup is in the way of it/
                );
                expect(await statuses(manager([catalog], { mode: 'WARN' }))).toEqual(['UNIQUE:BLOCKED_BY_INDEX']);
                expect(await rangeNames('Ledger')).toEqual(['ledger_lookup']);
            }
            expect(await statuses(manager([catalog], { replaceBlockingIndex: true }))).toEqual(['UNIQUE:CREATED']);
            expect(await statuses(manager([catalog], { replaceBlockingIndex: true }), 'recreateAll')).toEqual([
                'UNIQUE:CREATED'
            ]);
        });

        it('should fail ensure under FAIL_FAST naming the index, warn of it under WARN, and replace it when asked', async () => {
            const ensured = async (m: SchemaManager): Promise<string[]> =>
                [...(await m.ensure(SchemaCatalog.of(ledger).named('ledger').forDatabase(engine.name))).values()]
                    .flat()
                    .map((it) => `${it.spec.kind}:${it.status}`);
            if (neo4j) {
                await expect(ensured(manager([]))).rejects.toThrow(
                    /BLOCKED_BY_INDEX for the UNIQUE on Ledger\(ref\): index ledger_lookup is in the way of it/
                );
                const warn = jest.spyOn(DrivineLogger.prototype, 'warn');
                try {
                    expect(await ensured(manager([], { mode: 'WARN' }))).toEqual(['UNIQUE:BLOCKED_BY_INDEX']);
                    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/index ledger_lookup is in the way of it/));
                } finally {
                    warn.mockRestore();
                }
                expect(await rangeNames('Ledger')).toEqual(['ledger_lookup']);
            }
            expect(await ensured(manager([], { replaceBlockingIndex: true }))).toEqual(['UNIQUE:CREATED']);
            expect(await rangeNames('Ledger')).toHaveLength(neo4j ? 0 : 1);
        });

        it('should apply a catalog declaring a range index and a constraint over the same properties, each time', async () => {
            await tidyLedger();
            const both = SchemaCatalog.of(rangeIndex('Ledger', 'ref'), ledger);
            const first = await statuses(manager([both], { replaceBlockingIndex: true }));
            const again = await statuses(manager([both], { replaceBlockingIndex: true }));
            expect(first).toEqual(['RANGE:CREATED', 'UNIQUE:CREATED']);
            // Neo4j lists only the range indexes no constraint owns, so its range index reads as made again.
            expect(again).toEqual([neo4j ? 'RANGE:CREATED' : 'RANGE:ALREADY_MATCHING', 'UNIQUE:ALREADY_MATCHING']);
        });

        it('should keep the index and fail enforce for a repeated value, asked to replace it with no sample', async () => {
            if (!neo4j) {
                return;
            }
            await gom().persistenceManager.execute(
                new QuerySpecification("CREATE (:Ledger {ref: 'r1'}), (:Ledger {ref: 'r1'})")
            );
            const enforced = manager([SchemaCatalog.of(ledger)], {
                replaceBlockingIndex: true,
                violationSampleSize: 0
            }).enforce();
            await expect(enforced).rejects.toThrow(/^VIOLATION for the UNIQUE on Ledger\(ref\)$/);
            expect(await rangeNames('Ledger')).toEqual(['ledger_lookup']);
        });

        it("should replace a plain index on the marker's key, the label being Drivine's", async () => {
            await plainIndex('_DrivineSchema', 'scope');
            await manager([SchemaCatalog.of(rangeIndex('Ledger', 'ref')).withVersion('v1')]).enforce();
            expect(
                (await gom().constraints.list()).some(
                    (it) => it.label === '_DrivineSchema' && it.properties[0] === 'scope'
                )
            ).toBe(true);
        });
    });
});

@NodeFragment({ labels: ['ManagedDoc'] })
class ManagedDoc {
    @NodeId() key: string;
    id: string;
}
