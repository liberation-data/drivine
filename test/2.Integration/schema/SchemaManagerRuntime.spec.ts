import {
    DatabaseRegistry,
    DatabaseType,
    EnsureResult,
    GraphObjectManagerFactory,
    NodeFragment,
    neo4jVectorOptions,
    NodeId,
    PersistenceManagerFactory,
    QuerySpecification,
    rangeIndex,
    SchemaCatalog,
    SchemaManager,
    SchemaSpec,
    TransactionContextHolder,
    uniquenessConstraint,
    vectorIndex
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';
import { inventoryEntries, readInventory } from '@/schema/SchemaInventory';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(60_000);

/**
 * Schema known only at runtime, ensured under an owner with SchemaManager.ensure. A second SchemaManager over the same
 * database stands for the next process.
 */
describe.each(allStores())('SchemaManager.ensure on $type', (engine) => {
    let factory: GraphObjectManagerFactory;
    let warn: jest.SpyInstance;

    const LABELS = ['RtProp', 'RtTenant', 'RtShared', 'RtDoc', 'RtTag', 'RtMember', 'RtAnon', 'RtNamed', 'RtLost'];
    const startup = rangeIndex('RtProp', 'contextId');
    const vector = (dimensions: number) => vectorIndex('RtProp', 'embedding', dimensions);
    const dice = SchemaCatalog.of(startup).named('dice');

    const manager = (
        catalogs: SchemaCatalog[],
        options: Partial<ConstructorParameters<typeof SchemaManager>[1]> = {}
    ) => new SchemaManager(factory, { catalogs: catalogs.map((it) => it.forDatabase(engine.name)), ...options });
    const statuses = (report: Map<string, EnsureResult<SchemaSpec>[]>): string[] =>
        [...report.values()].flat().map((it) => `${it.spec.kind}:${it.status}`);
    const gom = () => factory.get(engine.name);
    const read = async (owner: string, property: 'version' | 'items') =>
        gom().persistenceManager.maybeGetOne<string | null>(
            gom().backend.schemaMarker(property).spec({ scope: owner })
        );
    const record = async (owner: string) => readInventory(gom().backend.markerItems(await read(owner, 'items')));
    const dimensions = async (label: string) =>
        (await gom().indexes.list('VECTOR')).find((it) => it.label === label)?.dimensions;
    const hasRange = async (label: string) => (await gom().indexes.list('RANGE')).some((it) => it.label === label);
    const orphanWarnings = (): string[] =>
        warn.mock.calls.map(([it]) => String(it)).filter((it) => it.includes('no longer declares'));

    const tidy = async (): Promise<void> => {
        const g = gom();
        for (const it of await g.constraints.list()) {
            if (LABELS.includes(it.label)) {
                await g.constraints.drop(uniquenessConstraint(it.label, it.properties));
            }
        }
        for (const kind of ['RANGE', 'VECTOR'] as const) {
            for (const it of await g.indexes.list(kind)) {
                if (LABELS.includes(it.label)) {
                    await g.indexes.drop(
                        kind === 'VECTOR'
                            ? vectorIndex(it.label, it.properties[0], it.dimensions ?? 1)
                            : rangeIndex(it.label, it.properties)
                    );
                }
            }
        }
        await clearLabels(g.persistenceManager, engine, '_DrivineSchema', ...LABELS);
    };

    beforeAll(() => {
        persistenceManagerFor(engine);
        factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
    });

    beforeEach(async () => {
        await tidy();
        warn = jest.spyOn(DrivineLogger.prototype, 'warn');
    });

    afterEach(() => warn.mockRestore());

    afterAll(async () => {
        await tidy();
        await closeGraphEngines();
    });

    it("should add an item to the owner's inventory, and a later enforce should keep it", async () => {
        const schema = manager([dice.withVersion('d-1')]);
        await schema.enforce();

        expect(statuses(await schema.ensure('dice', vector(3)))).toEqual(['VECTOR:CREATED']);

        expect(await dimensions('RtProp')).toEqual(3);
        const keys = [
            'RANGE_INDEX:RtProp:contextId:RtProp_contextId_range',
            'VECTOR_INDEX:RtProp:embedding:RtProp_embedding_vector'
        ];
        expect(await record('dice')).toEqual({ keys, runtime: new Set([keys[1]]), stale: new Set() });
        expect(await read('dice', 'version')).toEqual('d-1');

        expect(statuses(await schema.enforce())).toEqual(['RANGE:ALREADY_MATCHING', 'VECTOR:ALREADY_MATCHING']);
        expect((await record('dice'))!.keys).toEqual(keys);
        expect(orphanWarnings()).toEqual([]);
    });

    it("should apply only the items given, leaving the owner's others as they are", async () => {
        const schema = manager([dice]);
        await schema.enforce();
        await gom().indexes.drop(startup);
        const log = jest.spyOn(DrivineLogger.prototype, 'log');

        try {
            expect(statuses(await schema.ensure('dice', vector(3)))).toEqual(['VECTOR:CREATED']);
            expect(log).toHaveBeenCalledWith(
                `Ensuring schema for owner 'dice' on ${engine.name}: 1 runtime items, 2 declared in all`
            );
        } finally {
            log.mockRestore();
        }
        expect(await hasRange('RtProp')).toBe(false);
    });

    it("should record an item the owner's startup catalogs declare too as declared, not ensured at runtime", async () => {
        const schema = manager([dice]);
        await schema.enforce();

        expect(statuses(await schema.ensure('dice', startup))).toEqual(['RANGE:ALREADY_MATCHING']);
        expect(await record('dice')).toEqual({
            keys: ['RANGE_INDEX:RtProp:contextId:RtProp_contextId_range'],
            runtime: new Set(),
            stale: new Set()
        });
    });

    it('should keep, in a manager built later, what an earlier one ensured, without calling it an orphan', async () => {
        const first = manager([dice]);
        await first.enforce();
        await first.ensure('dice', vector(3));

        expect(statuses(await manager([dice]).enforce())).toEqual(['RANGE:ALREADY_MATCHING']);

        const key = 'VECTOR_INDEX:RtProp:embedding:RtProp_embedding_vector';
        expect(orphanWarnings()).toEqual([]);
        expect((await record('dice'))!.runtime).toEqual(new Set([key]));
        expect(await dimensions('RtProp')).toEqual(3);
    });

    it('should leave an owner ensured at runtime alone when an enforce does not know it', async () => {
        await manager([]).ensure('tenants', rangeIndex('RtTenant', 'slug'));
        await manager([dice]).enforce();
        expect((await record('tenants'))!.runtime).toEqual(new Set(['RANGE_INDEX:RtTenant:slug:RtTenant_slug_range']));
        expect(await hasRange('RtTenant')).toBe(true);
    });

    it('should apply what it was ensured on enforce with no catalog, under the unnamed owner too', async () => {
        const schema = manager([]);
        await schema.ensure('schema', rangeIndex('RtAnon', 'slug'));
        await gom().indexes.drop(rangeIndex('RtAnon', 'slug'));

        expect(statuses(await schema.enforce())).toEqual(['RANGE:CREATED']);
        expect((await record('schema'))!.runtime).toEqual(new Set(['RANGE_INDEX:RtAnon:slug:RtAnon_slug_range']));
    });

    it('should apply what it was ensured when its catalogs are all empty, and not say there is nothing to apply', async () => {
        const schema = manager([SchemaCatalog.of().named('dice')]);
        await schema.ensure('dice', rangeIndex('RtAnon', 'slug'));
        await gom().indexes.drop(rangeIndex('RtAnon', 'slug'));
        const log = jest.spyOn(DrivineLogger.prototype, 'log');
        try {
            expect(statuses(await schema.enforce())).toEqual(['RANGE:CREATED']);
            expect(statuses(await schema.recreateAll())).toEqual(['RANGE:RECREATED']);
            const said = log.mock.calls.map(([it]) => String(it));
            expect(said.filter((it) => it.includes('nothing to apply'))).toEqual([]);
        } finally {
            log.mockRestore();
        }
        expect((await record('dice'))!.runtime).toEqual(new Set(['RANGE_INDEX:RtAnon:slug:RtAnon_slug_range']));
    });

    it('should mark a runtime item on a version change that has no spec for it, and recreate it when next ensured', async () => {
        const first = manager([dice.withVersion('model-a')], { mode: 'WARN' });
        await first.enforce();
        await first.ensure('dice', vector(3));

        const next = manager([dice.withVersion('model-b')], { mode: 'WARN' });
        await next.enforce();
        const key = 'VECTOR_INDEX:RtProp:embedding:RtProp_embedding_vector';
        expect((await record('dice'))!.stale).toEqual(new Set([key]));
        expect(await dimensions('RtProp')).toEqual(3);

        expect(statuses(await next.ensure('dice', vector(4)))).toEqual(['VECTOR:RECREATED']);
        expect(await dimensions('RtProp')).toEqual(4);
        expect((await record('dice'))!.stale).toEqual(new Set());
    });

    it('should neither act on a version change nor recreate on startup', async () => {
        const first = manager([dice.withVersion('d-1')]);
        await first.enforce();
        await first.ensure('dice', vector(3));

        expect(statuses(await manager([dice.withVersion('d-2')]).ensure('dice', vector(3)))).toEqual([
            'VECTOR:ALREADY_MATCHING'
        ]);
        expect(await read('dice', 'version')).toEqual('d-1');
        const always = manager([dice.withVersion('d-1')], { recreateOnStartup: true });
        expect(statuses(await always.ensure('dice', vector(3)))).toEqual(['VECTOR:ALREADY_MATCHING']);
    });

    it('should spare a runtime item it has no spec for on a version change when another owner declares it', async () => {
        const shared = rangeIndex('RtShared', 'slug');
        const first = manager([dice.withVersion('model-a')]);
        await first.enforce();
        await first.ensure('dice', shared);

        await manager([dice.withVersion('model-b'), SchemaCatalog.of(shared).named('app')]).enforce();

        expect(await record('dice')).toMatchObject({
            runtime: new Set(['RANGE_INDEX:RtShared:slug:RtShared_slug_range']),
            stale: new Set()
        });
    });

    it('should mark a runtime item on a later recreateAll, and keep the mark through a later enforce', async () => {
        const first = manager([dice]);
        await first.enforce();
        await first.ensure('dice', vector(3));

        const next = manager([dice]);
        await next.recreateAll();
        const key = 'VECTOR_INDEX:RtProp:embedding:RtProp_embedding_vector';
        expect((await record('dice'))!.stale).toEqual(new Set([key]));

        await next.enforce();
        expect((await record('dice'))!.stale).toEqual(new Set([key]));
        expect(orphanWarnings()).toEqual([]);
    });

    it('should mark a runtime item it has no spec for on recreateOnStartup', async () => {
        const first = manager([dice]);
        await first.enforce();
        await first.ensure('dice', vector(3));

        await manager([dice], { recreateOnStartup: true }).enforce();
        expect((await record('dice'))!.stale).toEqual(
            new Set(['VECTOR_INDEX:RtProp:embedding:RtProp_embedding_vector'])
        );
    });

    it('should keep the mark of an item its manager holds until that manager applies it', async () => {
        const schema = manager([dice]);
        await schema.enforce();
        await schema.ensure('dice', vector(3));

        // Another process recreates the owner without the vector's spec.
        await manager([dice]).recreateAll();
        const key = 'VECTOR_INDEX:RtProp:embedding:RtProp_embedding_vector';
        expect((await record('dice'))!.stale).toEqual(new Set([key]));

        await schema.ensure('dice', rangeIndex('RtTag', 'name'));
        expect((await record('dice'))!.stale).toEqual(new Set([key]));

        expect(statuses(await schema.enforce())).toEqual([
            'RANGE:ALREADY_MATCHING',
            'VECTOR:RECREATED',
            'RANGE:ALREADY_MATCHING'
        ]);
        expect((await record('dice'))!.stale).toEqual(new Set());
    });

    it('should take a runtime item of another shape, with no version change, as drift, handled per the policy', async () => {
        const first = manager([dice]);
        await first.enforce();
        await first.ensure('dice', vector(3));

        expect(statuses(await manager([dice], { mode: 'WARN' }).ensure('dice', vector(4)))).toEqual(['VECTOR:DRIFT']);
        expect(await dimensions('RtProp')).toEqual(3);
        await expect(manager([dice]).ensure('dice', vector(4))).rejects.toThrow(/DRIFT for the VECTOR on RtProp/);
        expect(statuses(await manager([dice], { recreateOnDrift: true }).ensure('dice', vector(4)))).toEqual([
            'VECTOR:RECREATED'
        ]);
        expect(await dimensions('RtProp')).toEqual(4);
    });

    it('should replace an item ensured again with the same identity', async () => {
        const schema = manager([dice], { recreateOnDrift: true });
        await schema.ensure('dice', vector(3));
        await schema.ensure('dice', vector(4));

        // Were both kept, the merge would refuse them as a conflict.
        expect(statuses(await schema.enforce())).toEqual(['RANGE:CREATED', 'VECTOR:ALREADY_MATCHING']);
        expect(await dimensions('RtProp')).toEqual(4);
    });

    it('should record every item of ensures made at once', async () => {
        const schema = manager([dice]);
        await Promise.all([
            schema.ensure('dice', rangeIndex('RtTag', 'name')),
            schema.ensure('dice', vector(3)),
            schema.enforce()
        ]);
        expect((await record('dice'))!.runtime).toEqual(
            new Set([
                'RANGE_INDEX:RtTag:name:RtTag_name_range',
                'VECTOR_INDEX:RtProp:embedding:RtProp_embedding_vector'
            ])
        );
    });

    it('should apply nothing, and record nothing, when given no items', async () => {
        expect(await manager([dice]).ensure('dice')).toEqual(new Map());
        expect(await read('dice', 'items')).toBeUndefined();
    });

    it('should rebuild the runtime items on recreateAll', async () => {
        const schema = manager([dice]);
        await schema.enforce();
        await schema.ensure('dice', vector(3));
        expect(statuses(await schema.recreateAll())).toEqual(['RANGE:RECREATED', 'VECTOR:RECREATED']);
    });

    it("should refuse a runtime item that conflicts with another owner's, naming both, and keep nothing", async () => {
        const schema = manager([SchemaCatalog.of(vectorIndex('RtDoc', 'embedding', 3)).named('app')]);
        await schema.enforce();

        await expect(schema.ensure('rag', vectorIndex('RtDoc', 'embedding', 4))).rejects.toThrow(
            /declare the VECTOR on RtDoc\(embedding\) .* differently, owned by 'app' and 'rag'/
        );

        await schema.enforce(); // would fail, were the conflicting item kept
        expect(await dimensions('RtDoc')).toEqual(3);
        expect(await read('rag', 'items')).toBeUndefined();
    });

    it("should refuse a runtime item that conflicts with the owner's own declaration, and keep nothing", async () => {
        const schema = manager([SchemaCatalog.of(vector(3)).named('dice')]);
        await schema.enforce();

        await expect(schema.ensure('dice', vector(4))).rejects.toThrow(/differently, both owned by 'dice'/);
        await schema.enforce();
        expect(await dimensions('RtProp')).toEqual(3);
    });

    it('should refuse two items of one identity given at once that differ, and keep nothing', async () => {
        const schema = manager([]);

        await expect(schema.ensure('dice', vector(3), vector(4))).rejects.toThrow(/differently, both owned by 'dice'/);
        await schema.enforce();
        expect(await dimensions('RtProp')).toBeUndefined();
        expect(await read('dice', 'items')).toBeUndefined();
    });

    it('should keep one of two items of one identity given at once, the one that pins engine options', async () => {
        const schema = manager([]);
        const tuned = vectorIndex('RtProp', 'embedding', 3, 'COSINE', {
            engineOptions: [neo4jVectorOptions({ quantizationEnabled: false })]
        });

        const report = [...(await schema.ensure('dice', vector(3), tuned, vector(3))).values()].flat();
        expect(report.map((it) => `${it.spec.kind}:${it.status}`)).toEqual(['VECTOR:CREATED']);
        expect(report[0].spec).toEqual(tuned);
        expect((await record('dice'))!.keys).toEqual(['VECTOR_INDEX:RtProp:embedding:RtProp_embedding_vector']);
    });

    it("should co-own a runtime item identical to another owner's", async () => {
        const shared = rangeIndex('RtShared', 'slug');
        const schema = manager([SchemaCatalog.of(shared).named('app')]);
        await schema.enforce();

        expect(statuses(await schema.ensure('rag', shared))).toEqual(['RANGE:ALREADY_MATCHING']);
        expect((await record('rag'))!.keys).toEqual(['RANGE_INDEX:RtShared:slug:RtShared_slug_range']);
    });

    it('should report a runtime item recorded under another name as an orphan of its owner', async () => {
        // drivine4j names items as asked: the marker holds the one it ensured at runtime under its own name.
        await gom().persistenceManager.execute(
            gom()
                .backend.recordSchemaMarker()
                .spec({
                    scope: 'dice',
                    version: null,
                    items: inventoryEntries(
                        ['RANGE_INDEX:RtTag:name:tag_one'],
                        new Set(['RANGE_INDEX:RtTag:name:tag_one'])
                    )
                })
        );

        await manager([dice], { mode: 'WARN' }).ensure('dice', rangeIndex('RtTag', 'name'));

        expect(orphanWarnings()).toEqual([expect.stringMatching(/Owner 'dice' .* applied 1 item\(s\).*tag_one/)]);
        expect((await record('dice'))!.keys).toEqual([
            'RANGE_INDEX:RtProp:contextId:RtProp_contextId_range',
            'RANGE_INDEX:RtTag:name:RtTag_name_range'
        ]);
    });

    it('should fail on a violation found by ensure under FAIL_FAST, and write no marker', async () => {
        await gom().saveAll(['x', 'x'].map((email, i) => Object.assign(new RtMember(), { key: `m${i}`, email })));

        await expect(manager([]).ensure('dice', uniquenessConstraint('RtMember', 'email'))).rejects.toThrow(
            /VIOLATION/
        );
        expect(await read('dice', 'items')).toBeUndefined();
    });

    it('should take a catalog that names its database, which must be registered, and no version', async () => {
        const schema = manager([]);
        await schema.ensure(SchemaCatalog.of(rangeIndex('RtNamed', 'slug')).named('dice').forDatabase(engine.name));
        expect(await hasRange('RtNamed')).toBe(true);

        await expect(
            schema.ensure(SchemaCatalog.of(rangeIndex('RtLost', 'slug')).named('dice').forDatabase('nowhere'))
        ).rejects.toThrow(/names nowhere, which is not a registered graph database/);
        await expect(
            schema.ensure(SchemaCatalog.of(rangeIndex('RtLost', 'slug')).named('dice').withVersion('v1'))
        ).rejects.toThrow(/cannot carry a version/);

        await schema.enforce(); // neither refused catalog was kept
        expect(await hasRange('RtLost')).toBe(false);
    });
});

describe.each(allStores().filter((it) => it.type === DatabaseType.NEO4J))(
    'SchemaManager.ensure over two databases on $type',
    (engine) => {
        let factory: GraphObjectManagerFactory;

        beforeAll(() => {
            persistenceManagerFor(engine);
            DatabaseRegistry.buildOrResolveFromEnv('TRAFFIC');
            factory = new GraphObjectManagerFactory(
                new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
            );
        });

        afterAll(async () => {
            await factory.get(engine.name).indexes.drop(vectorIndex('RtDoc', 'embedding', 3));
            await factory.get(engine.name).indexes.drop(vectorIndex('RtOrder', 'embedding', 4));
            await clearLabels(factory.get(engine.name).persistenceManager, engine, '_DrivineSchema');
            await closeGraphEngines();
        });

        it('should apply nothing on any database when a runtime item conflicts on one', async () => {
            // Two names for the one Neo4j: the conflict is on the second only, which is planned after the first.
            const app = SchemaCatalog.of(vectorIndex('RtDoc', 'embedding', 3))
                .named('app')
                .forDatabase('TRAFFIC');
            const schema = new SchemaManager(factory, { catalogs: [app] });

            await expect(
                schema.ensure('rag', rangeIndex('RtFresh', 'slug'), vectorIndex('RtDoc', 'embedding', 4))
            ).rejects.toThrow(/differently, owned by 'app' and 'rag'/);

            const gom = factory.get(engine.name);
            expect((await gom.indexes.list('RANGE')).some((it) => it.label === 'RtFresh')).toBe(false);
            expect(
                await gom.persistenceManager.maybeGetOne(
                    new QuerySpecification(`MATCH (m:_DrivineSchema {scope: 'rag'}) RETURN m.items`)
                )
            ).toBeUndefined();
        });

        it('should replace an item ensured again on the same databases named in another order', async () => {
            const schema = new SchemaManager(factory, { catalogs: [], recreateOnDrift: true });
            const on = (dimensions: number, ...databases: string[]) =>
                SchemaCatalog.of(vectorIndex('RtOrder', 'embedding', dimensions))
                    .named('rag')
                    .forDatabases(...databases);

            await schema.ensure(on(3, engine.name, 'TRAFFIC'));
            await schema.ensure(on(4, 'TRAFFIC', engine.name));

            // Were both kept, the merge would refuse them as a conflict.
            await schema.enforce();
            const vectors = await factory.get(engine.name).indexes.list('VECTOR');
            expect(vectors.find((it) => it.label === 'RtOrder')?.dimensions).toEqual(4);
        });
    }
);

@NodeFragment({ labels: ['RtMember'] })
class RtMember {
    @NodeId() key: string;
    email: string;
}
