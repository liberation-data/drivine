import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    GraphObjectManagerFactory,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManagerFactory,
    RangeIndex,
    rangeIndex,
    SchemaCatalog,
    SchemaManager,
    StatelessGraphObjectManager,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';
import { NodeIdIndexCheck } from '@/schema/NodeIdIndexCheck';
import { allStores, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

jest.setTimeout(120_000);

@NodeFragment({ labels: ['IdxNote'] })
class IdxNote {
    @NodeId() id: string;
    // Beside the id's, so that FalkorDB lists the label's range properties as one item.
    @RangeIndex() name: string;
}

@NodeFragment({ labels: ['IdxBare'], nodeIdIndex: false })
class IdxBare {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['IdxBare'] })
class IdxBareLater {
    @NodeId() id: string;
}

/**
 * A fragment's @NodeId's default range index, made by an enforce on each store, and the warning of one no index serves,
 * read from what the store lists (#800, drivine4j#827 and #828).
 */
describe.each(allStores())("a fragment's @NodeId's range index on $type", (engine) => {
    let gom: StatelessGraphObjectManager;
    let warnings: string[];
    const made = [rangeIndex('IdxNote', 'id'), rangeIndex('IdxNote', 'name'), rangeIndex('IdxBare', 'id')];

    beforeAll(async () => {
        gom = new StatelessGraphObjectManager(
            persistenceManagerFor(engine),
            backendFor(engine.type),
            new ModelRegistry()
        );
        for (const it of made) {
            await gom.indexes.drop(it);
        }
    });

    afterAll(async () => {
        for (const it of made) {
            await gom.indexes.drop(it);
        }
        await closeGraphEngines();
    });

    beforeEach(() => {
        NodeIdIndexCheck.reset();
        warnings = [];
        jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation((message: any) => {
            warnings.push(String(message));
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        NodeIdIndexCheck.reset();
    });

    it('should make the index on an enforce, and warn of the fragment that opted out, once, until an index serves it', async () => {
        const factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
        // Both used before the enforce, as a fragment may be: each is checked when it lists.
        new ModelRegistry().fragment(IdxNote);
        new ModelRegistry().fragment(IdxBare);
        const manager = new SchemaManager(factory, {
            catalogs: [
                SchemaCatalog.fromFragments(undefined, IdxNote, IdxBare).named('node-id-index').forDatabase(engine.name)
            ]
        });
        const report = (await manager.enforce()).get(engine.name)!;
        expect(report.map((it) => [it.spec.label, it.spec.properties, it.status])).toEqual([
            ['IdxNote', ['name'], 'CREATED'],
            ['IdxNote', ['id'], 'CREATED']
        ]);
        const listed = (await gom.indexes.list('RANGE')).filter((it) => it.label === 'IdxNote');
        expect(listed.flatMap((it) => it.properties).sort()).toEqual(['id', 'name']);
        if (engine.type === DatabaseType.FALKORDB) {
            // The label's range properties listed as one item: the id is served all the same.
            expect(listed).toHaveLength(1);
        }
        expect(warnings.filter((it) => it.includes('@NodeId'))).toEqual([
            expect.stringMatching(/^@NodeId 'id' of IdxBare has no index under :IdxBare, /)
        ]);

        // Again: nothing new to warn of.
        await manager.enforce();
        expect(warnings.filter((it) => it.includes('@NodeId'))).toHaveLength(1);

        // An index ensured later serves a fragment of the label first used after it.
        await gom.indexes.ensure(rangeIndex('IdxBare', 'id'));
        new ModelRegistry().fragment(IdxBareLater);
        expect(warnings.filter((it) => it.includes('@NodeId'))).toHaveLength(1);
    });
});
