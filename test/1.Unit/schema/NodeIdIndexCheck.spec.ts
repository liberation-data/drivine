import {
    ConnectionProvider,
    ConstraintManager,
    DatabaseRegistry,
    DatabaseType,
    fullTextIndex,
    GraphObjectManagerFactory,
    GraphProperty,
    IndexManager,
    ModelRegistry,
    NodeFragment,
    NodeId,
    rangeIndex,
    RangeIndex,
    SchemaCatalog,
    SchemaManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';
import { ListedItem, NodeIdIndexCheck } from '@/schema/NodeIdIndexCheck';
import { PlanRequest } from '@/schema/SchemaPlan';

@NodeFragment({ labels: ['Order', 'Purchase'] })
class OrderFixture {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['Invoice'] })
class InvoiceFixture {
    @NodeId() @GraphProperty('invoice_no') number: string;
}

@NodeFragment({ labels: ['Note'] })
class NoteWithoutIdFixture {
    text: string;
}

const range = (label: string, ...properties: string[]): ListedItem => ({ kind: 'RANGE', label, properties });
const unique = (label: string, ...properties: string[]): ListedItem => ({ kind: 'UNIQUE', label, properties });

/** Builds the class's model in a registry of its own, as each object manager's registry does at a fragment's first use. */
const use = (type: Function): void => {
    new ModelRegistry().fragment(type as any);
};

const ORDER_WARNING =
    "@NodeId 'id' of OrderFixture has no index under :Order, so each save scans every :Order node. Its default index " +
    "is off (@NodeFragment({ nodeIdIndex: false }) / indexNodeIds: false, or OrderFixture isn't in a SchemaCatalog): " +
    "declare @RangeIndex or @Unique on it, or indexes.ensure(rangeIndex('Order', 'id')).";

/** The words a warning ends with where there is more than one database: the one it is said of (drivine4j#848). */
const on = (database: string): string => ` On database '${database}'.`;

/** The warning of a fragment whose @NodeId no index serves (#800, drivine4j#828): once per fragment and database. */
describe('NodeIdIndexCheck', () => {
    let warnings: string[];

    beforeEach(() => {
        NodeIdIndexCheck.reset();
        warnings = [];
        jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation((message: any) => {
            warnings.push(String(message));
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
        NodeIdIndexCheck.reset();
    });

    it('should check a fragment some catalog names only on the databases whose catalogs name it, naming the database', () => {
        NodeIdIndexCheck.managed();
        use(OrderFixture);
        use(InvoiceFixture);
        // Order's catalog is for a alone, Invoice's for b alone; neither has its id indexed.
        NodeIdIndexCheck.catalogued(
            new Map([
                ['a', ['Order']],
                ['b', ['Invoice']]
            ])
        );
        NodeIdIndexCheck.listed('a', []);
        NodeIdIndexCheck.listed('b', []);
        expect(warnings.filter((it) => it.includes('OrderFixture'))).toEqual([ORDER_WARNING + on('a')]);
        expect(warnings.filter((it) => it.includes('InvoiceFixture') && it.endsWith(on('b')))).toHaveLength(1);
        // Neither is warned of on the other's database.
        expect(warnings).toHaveLength(2);
    });

    it('should check a fragment first used after the enforce only where it belongs, and where a later ensure names it', () => {
        NodeIdIndexCheck.managed();
        NodeIdIndexCheck.catalogued(
            new Map([
                ['a', ['Purchase']],
                ['b', ['Invoice']]
            ])
        );
        NodeIdIndexCheck.listed('a', []);
        NodeIdIndexCheck.listed('b', []);
        use(OrderFixture);
        // Named on a under its other label, Purchase.
        expect(warnings).toEqual([ORDER_WARNING + on('a')]);
        // A catalog ensured on b at runtime names Order there, and b is listed again.
        NodeIdIndexCheck.cataloguedToo('b', ['Order']);
        NodeIdIndexCheck.listed('b', []);
        expect(warnings).toEqual([ORDER_WARNING + on('a'), ORDER_WARNING + on('b')]);
        // What b's catalogs named before is kept beside it: Invoice is still checked on b alone.
        use(InvoiceFixture);
        expect(warnings.slice(2)).toHaveLength(1);
        expect(warnings[2]).toContain('InvoiceFixture');
        expect(warnings[2].endsWith(on('b'))).toBe(true);
    });

    it('should check a fragment no catalog names on every database listed', () => {
        NodeIdIndexCheck.managed();
        use(OrderFixture);
        NodeIdIndexCheck.catalogued(
            new Map([
                ['a', ['Customer']],
                ['b', []]
            ])
        );
        NodeIdIndexCheck.listed('a', []);
        NodeIdIndexCheck.listed('b', []);
        expect(warnings).toEqual([ORDER_WARNING + on('a'), ORDER_WARNING + on('b')]);
    });

    it("should warn of a fragment no index serves once per database, in drivine4j's words", () => {
        NodeIdIndexCheck.managed();
        use(OrderFixture);
        NodeIdIndexCheck.listed('default', []);
        NodeIdIndexCheck.listed('default', []);
        use(OrderFixture);
        expect(warnings).toEqual([ORDER_WARNING]);
        NodeIdIndexCheck.listed('users', [range('Customer', 'id')]);
        // Another database, whose index is under a label the fragment hasn't: named, as there are two.
        expect(warnings).toEqual([ORDER_WARNING, ORDER_WARNING + on('users')]);
        // An index under any of the fragment's labels serves it: a save matches all of them.
        NodeIdIndexCheck.listed('archive', [range('Purchase', 'id')]);
        expect(warnings).toHaveLength(2);
    });

    it('should take a range index or a uniqueness constraint over the id alone, under one of its labels, as serving it', () => {
        NodeIdIndexCheck.managed();
        use(OrderFixture);
        NodeIdIndexCheck.listed('a', [range('Order', 'id')]);
        NodeIdIndexCheck.listed('b', [unique('Order', 'id')]);
        expect(warnings).toEqual([]);
        // An item over more properties serves no lookup by the id alone.
        NodeIdIndexCheck.listed('c', [range('Order', 'id', 'placedAt'), unique('Order', 'id', 'line')]);
        expect(warnings).toEqual([ORDER_WARNING + on('c')]);
    });

    it("should take a label's range properties listed as one item as serving, where the engine indexes each alone", () => {
        NodeIdIndexCheck.managed();
        use(OrderFixture);
        // FalkorDB: one item of every range property of the label, each its own index.
        NodeIdIndexCheck.listed('falkor', [range('Order', 'placedAt', 'id')], true);
        expect(warnings).toEqual([]);
        NodeIdIndexCheck.listed('neo', [range('Order', 'placedAt', 'id')]);
        expect(warnings).toEqual([ORDER_WARNING + on('neo')]);
        // A constraint over more properties is still one over them all.
        NodeIdIndexCheck.listed('falkor2', [unique('Order', 'id', 'line')], true);
        expect(warnings).toHaveLength(2);
    });

    it('should check a fragment first used after an enforce listed against it, by the property its id is stored under', () => {
        NodeIdIndexCheck.managed();
        NodeIdIndexCheck.listed('default', [range('Invoice', 'number')]);
        use(InvoiceFixture);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/^@NodeId 'invoice_no' of InvoiceFixture has no index under :Invoice/);
        NodeIdIndexCheck.reset();
        warnings.length = 0;
        NodeIdIndexCheck.managed();
        NodeIdIndexCheck.listed('default', [range('Invoice', 'invoice_no')]);
        use(InvoiceFixture);
        expect(warnings).toEqual([]);
    });

    it('should take an index or a constraint ensured after an enforce listed as serving a fragment first used later', () => {
        NodeIdIndexCheck.managed();
        NodeIdIndexCheck.listed('default', []);
        NodeIdIndexCheck.ensured('default', rangeIndex('Order', 'id'), {
            status: 'CREATED',
            spec: rangeIndex('Order', 'id')
        });
        use(OrderFixture);
        const invoice = uniquenessConstraint('Invoice', 'invoice_no');
        NodeIdIndexCheck.ensured('default', invoice, { status: 'ALREADY_MATCHING', spec: invoice });
        use(InvoiceFixture);
        expect(warnings).toEqual([]);

        // A recreate that ends a drift.
        NodeIdIndexCheck.reset();
        NodeIdIndexCheck.managed();
        NodeIdIndexCheck.listed('default', [unique('Order', 'id', 'line')]);
        const order = uniquenessConstraint('Order', 'id');
        NodeIdIndexCheck.ensured('default', order, { status: 'RECREATED', spec: order });
        use(OrderFixture);
        expect(warnings).toEqual([]);

        // One that ignores case, of another kind, over more properties, not made, or on a database no enforce listed.
        NodeIdIndexCheck.reset();
        NodeIdIndexCheck.managed();
        NodeIdIndexCheck.listed('default', []);
        const folded = rangeIndex('Order', 'id', { ignoreCase: true });
        NodeIdIndexCheck.ensured('default', folded, { status: 'CREATED', spec: folded });
        const searched = fullTextIndex('Order', 'id');
        NodeIdIndexCheck.ensured('default', searched, { status: 'CREATED', spec: searched });
        const wider = rangeIndex('Order', ['id', 'placedAt']);
        NodeIdIndexCheck.ensured('default', wider, { status: 'CREATED', spec: wider });
        NodeIdIndexCheck.ensured('default', order, { status: 'DRIFT', spec: order });
        NodeIdIndexCheck.ensured('other', rangeIndex('Order', 'id'), {
            status: 'CREATED',
            spec: rangeIndex('Order', 'id')
        });
        use(OrderFixture);
        expect(warnings).toEqual([ORDER_WARNING]);
    });

    it("should take an item ensured through 'default' as ensured on the database it names", () => {
        // SchemaManager lists a database under its registered name; `factory.get()`'s manager is of 'default'.
        DatabaseRegistry.getInstance().register({ name: 'primary', type: DatabaseType.NEO4J } as ConnectionProvider);
        try {
            NodeIdIndexCheck.managed();
            NodeIdIndexCheck.listed('primary', []);
            NodeIdIndexCheck.ensured('default', rangeIndex('Order', 'id'), {
                status: 'CREATED',
                spec: rangeIndex('Order', 'id')
            });
            use(OrderFixture);
        } finally {
            DatabaseRegistry.tearDown();
        }
        expect(warnings).toEqual([]);
    });

    it('should warn of a fragment later with no schema manager, and not where one was built by then', () => {
        jest.useFakeTimers();
        use(OrderFixture);
        // Not at its first use: a manager may yet be built.
        expect(warnings).toEqual([]);
        jest.advanceTimersByTime(NodeIdIndexCheck.UNMANAGED_DELAY_MILLIS);
        expect(warnings).toEqual([ORDER_WARNING]);

        NodeIdIndexCheck.reset();
        warnings.length = 0;
        use(OrderFixture);
        NodeIdIndexCheck.managed();
        jest.advanceTimersByTime(NodeIdIndexCheck.UNMANAGED_DELAY_MILLIS);
        expect(warnings).toEqual([]);

        // A timer set before a reset does nothing after it, though the class is admitted again and no manager built.
        NodeIdIndexCheck.reset();
        const half = NodeIdIndexCheck.UNMANAGED_DELAY_MILLIS / 2;
        use(OrderFixture);
        jest.advanceTimersByTime(half);
        NodeIdIndexCheck.reset();
        use(OrderFixture);
        jest.advanceTimersByTime(half);
        expect(warnings).toEqual([]);
        // The timer set after it warns.
        jest.advanceTimersByTime(half);
        expect(warnings).toEqual([ORDER_WARNING]);
    });

    it('should never warn of a fragment with no @NodeId', () => {
        NodeIdIndexCheck.managed();
        use(NoteWithoutIdFixture);
        NodeIdIndexCheck.listed('default', []);
        expect(warnings).toEqual([]);
    });

    it('should pass over a check that fails, so the model is still built', () => {
        NodeIdIndexCheck.managed();
        NodeIdIndexCheck.listed('default', []);
        jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => {
            throw new Error('no log');
        });
        expect(() => use(OrderFixture)).not.toThrow();
    });
});

@NodeFragment({ labels: ['Session'] })
class SessionFixture {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['Session'] })
class RangedSessionFixture {
    @NodeId() @RangeIndex() id: string;
}

@NodeFragment({ labels: ['UnindexedSession'], nodeIdIndex: false })
class UnindexedSessionFixture {
    @NodeId() id: string;
}

/** What SchemaManager gives the planner of a fragment's @NodeId's default index, and lists for the check. */
describe("SchemaManager and a fragment's @NodeId's default index (#800)", () => {
    const requests: PlanRequest[] = [];
    const planning = {
        plan: {
            run: async (request: PlanRequest) => {
                requests.push(request);
                return Promise.resolve({ owners: [] });
            },
            validate: () => undefined
        },
        database: 'graph',
        host: {}
    };
    const factory = { get: () => ({ schemaPlanning: () => planning }) } as unknown as GraphObjectManagerFactory;
    const itemsOf = (request: PlanRequest) =>
        request.catalogs.map((it) => it.items.map((item: any) => `${item.kind}:${item.label}:${item.properties}`));

    beforeAll(() => {
        DatabaseRegistry.getInstance().register({ name: 'graph', type: DatabaseType.NEO4J } as ConnectionProvider);
    });

    afterAll(() => DatabaseRegistry.tearDown());

    beforeEach(() => {
        requests.length = 0;
        NodeIdIndexCheck.reset();
        jest.spyOn(IndexManager.prototype, 'list').mockResolvedValue([]);
        jest.spyOn(ConstraintManager.prototype, 'list').mockResolvedValue([]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        NodeIdIndexCheck.reset();
    });

    it("should leave out a default another catalog's item serves, and keep it beside one that doesn't", async () => {
        const fragments = SchemaCatalog.fromFragments(undefined, SessionFixture);
        await new SchemaManager(factory, {
            catalogs: [fragments, SchemaCatalog.of(uniquenessConstraint('Session', 'id')).named('app')]
        }).enforce();
        expect(itemsOf(requests[0])).toEqual([[], ['UNIQUENESS_CONSTRAINT:Session:id']]);

        await new SchemaManager(factory, {
            catalogs: [fragments, SchemaCatalog.of(rangeIndex('Session', ['id', 'at']))]
        }).enforce();
        expect(itemsOf(requests[1])).toEqual([['RANGE_INDEX:Session:id'], ['RANGE_INDEX:Session:id,at']]);

        // Two catalogs of fragments of the label each keep their default: one item, co-owned.
        await new SchemaManager(factory, {
            catalogs: [fragments, SchemaCatalog.fromFragments(undefined, SessionFixture).named('app')]
        }).enforce();
        expect(itemsOf(requests[2])).toEqual([['RANGE_INDEX:Session:id'], ['RANGE_INDEX:Session:id']]);
    });

    it('should leave out a default an item ensured at runtime serves', async () => {
        const manager = new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, SessionFixture)]
        });
        await manager.ensure('app', uniquenessConstraint('Session', 'id'));
        await manager.enforce();
        expect(itemsOf(requests[requests.length - 1])).toEqual([[]]);
    });

    it('should leave out a default only on the databases the item that serves it is declared or ensured on', async () => {
        DatabaseRegistry.getInstance().register({ name: 'other', type: DatabaseType.NEO4J } as ConnectionProvider);
        try {
            const fragments = SchemaCatalog.fromFragments(undefined, SessionFixture);
            const served = SchemaCatalog.of(uniquenessConstraint('Session', 'id')).named('app').forDatabase('other');
            await new SchemaManager(factory, { catalogs: [fragments, served] }).enforce();
            // In order of database name: 'graph', then 'other'.
            expect(requests.map(itemsOf)).toEqual([
                [['RANGE_INDEX:Session:id']],
                [[], ['UNIQUENESS_CONSTRAINT:Session:id']]
            ]);
            requests.length = 0;
            const manager = new SchemaManager(factory, { catalogs: [fragments] });
            await manager.ensure(served);
            await manager.enforce();
            expect(requests.slice(1).map(itemsOf)).toEqual([[['RANGE_INDEX:Session:id']], [[]]]);
        } finally {
            DatabaseRegistry.tearDown();
            DatabaseRegistry.getInstance().register({ name: 'graph', type: DatabaseType.NEO4J } as ConnectionProvider);
        }
    });

    it("should give the check each database's catalogued labels before it lists, and an ensured catalog's after", async () => {
        DatabaseRegistry.getInstance().register({ name: 'other', type: DatabaseType.NEO4J } as ConnectionProvider);
        try {
            const catalogued = jest.spyOn(NodeIdIndexCheck, 'catalogued');
            const listed = jest.spyOn(NodeIdIndexCheck, 'listed');
            const manager = new SchemaManager(factory, {
                catalogs: [
                    // 'default' is the first registered, graph: its labels are graph's.
                    SchemaCatalog.of(rangeIndex('Person', 'name')).forDefaultDatabase(),
                    // A fragment read with its default off declares nothing: it belongs on 'other' all the same.
                    SchemaCatalog.fromFragments(undefined, UnindexedSessionFixture).forDatabase('other'),
                    SchemaCatalog.of(rangeIndex('Customer', 'id'))
                ]
            });
            await manager.enforce();
            expect(catalogued).toHaveBeenCalledTimes(1);
            expect(catalogued.mock.invocationCallOrder[0]).toBeLessThan(listed.mock.invocationCallOrder[0]);
            const labels = [...catalogued.mock.calls[0][0]].map(([database, named]) => [database, [...named].sort()]);
            expect(labels).toEqual([
                ['graph', ['Customer', 'Person']],
                ['other', ['Customer', 'UnindexedSession']]
            ]);
            const too = jest.spyOn(NodeIdIndexCheck, 'cataloguedToo');
            await manager.ensure(SchemaCatalog.of(rangeIndex('Order', 'at')).named('app').forDatabase('other'));
            expect(too.mock.calls).toEqual([['other', ['Order']]]);
            expect(too.mock.invocationCallOrder[0]).toBeLessThan(
                listed.mock.invocationCallOrder[listed.mock.calls.length - 1]
            );
            // An ensured fragment catalog names its fragments' labels too, not only its items'.
            too.mockClear();
            await manager.ensure(
                SchemaCatalog.fromFragments(undefined, OrderFixture).named('orders').forDatabase('other')
            );
            expect(too.mock.calls).toEqual([['other', ['Order', 'Order', 'Purchase']]]);
            // A later enforce names what was ensured among the rest, on the databases it was ensured on.
            await manager.enforce();
            const again = [...catalogued.mock.calls[1][0]].map(([database, named]) => [
                database,
                [...new Set(named)].sort()
            ]);
            expect(again).toEqual([
                ['graph', ['Customer', 'Person']],
                ['other', ['Customer', 'Order', 'UnindexedSession']]
            ]);
        } finally {
            DatabaseRegistry.tearDown();
            DatabaseRegistry.getInstance().register({ name: 'graph', type: DatabaseType.NEO4J } as ConnectionProvider);
        }
    });

    it('should not catalogue an ensured catalog on a database no enforce listed', async () => {
        DatabaseRegistry.getInstance().register({ name: 'other', type: DatabaseType.NEO4J } as ConnectionProvider);
        try {
            const manager = new SchemaManager(factory, {
                catalogs: [SchemaCatalog.of(rangeIndex('Person', 'name')).forDatabase('graph')]
            });
            await manager.enforce();
            const too = jest.spyOn(NodeIdIndexCheck, 'cataloguedToo');
            // 'other' was never listed: naming Order there would stop it being checked on 'graph', where it is used.
            await manager.ensure(SchemaCatalog.of(rangeIndex('Order', 'at')).named('app').forDatabase('other'));
            expect(too).not.toHaveBeenCalled();
        } finally {
            DatabaseRegistry.tearDown();
            DatabaseRegistry.getInstance().register({ name: 'graph', type: DatabaseType.NEO4J } as ConnectionProvider);
        }
    });

    it('should apply the catalogs without their defaults where indexNodeIds is false', async () => {
        await new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, SessionFixture, RangedSessionFixture)],
            indexNodeIds: false
        }).enforce();
        // RangedSessionFixture's own declaration is kept: it is declared, not a default.
        expect(itemsOf(requests[0])).toEqual([['RANGE_INDEX:Session:id']]);
        requests.length = 0;
        // Nothing then left to apply: the manager says so, and plans nothing.
        await new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, SessionFixture)],
            indexNodeIds: false
        }).enforce();
        expect(requests).toEqual([]);
    });

    it('should list what serves an id after an enforce and a recreateAll, and after an ensure once one listed', async () => {
        const listed = jest.spyOn(NodeIdIndexCheck, 'listed');
        const manager = new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, SessionFixture)]
        });
        await manager.ensure('app', rangeIndex('Session', 'name'));
        // No enforce has listed the database yet: the ensure lists nothing.
        expect(listed).not.toHaveBeenCalled();
        await manager.enforce();
        await manager.recreateAll();
        await manager.ensure('app', rangeIndex('Session', 'at'));
        expect(listed.mock.calls.map(([database, , perProperty]) => [database, perProperty])).toEqual([
            ['graph', false],
            ['graph', false],
            ['graph', false]
        ]);
    });

    it("should list a label's range properties as one item each its own index where the engine indexes so", async () => {
        const listed = jest.spyOn(NodeIdIndexCheck, 'listed');
        DatabaseRegistry.tearDown();
        DatabaseRegistry.getInstance().register({ name: 'falkor', type: DatabaseType.FALKORDB } as ConnectionProvider);
        try {
            await new SchemaManager(factory, {
                catalogs: [SchemaCatalog.fromFragments(undefined, SessionFixture)]
            }).enforce();
        } finally {
            DatabaseRegistry.tearDown();
            DatabaseRegistry.getInstance().register({ name: 'graph', type: DatabaseType.NEO4J } as ConnectionProvider);
        }
        expect(listed.mock.calls.map(([database, , perProperty]) => [database, perProperty])).toEqual([
            ['falkor', true]
        ]);
    });

    it("should give the check the store's range indexes and uniqueness constraints, each of its kind", async () => {
        const listed = jest.spyOn(NodeIdIndexCheck, 'listed');
        const ranges = jest
            .spyOn(IndexManager.prototype, 'list')
            .mockResolvedValue([{ label: 'Session', properties: ['id'] }]);
        jest.spyOn(ConstraintManager.prototype, 'list').mockResolvedValue([
            { label: 'Session', properties: ['id', 'at'] }
        ]);
        await new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, SessionFixture)]
        }).enforce();
        expect(ranges).toHaveBeenCalledWith('RANGE');
        expect(listed.mock.calls.map(([database, items]) => [database, items])).toEqual([
            [
                'graph',
                [
                    { kind: 'RANGE', label: 'Session', properties: ['id'] },
                    { kind: 'UNIQUE', label: 'Session', properties: ['id', 'at'] }
                ]
            ]
        ]);
    });

    it('should keep what an enforce listed current from an index or a constraint ensured or recreated by hand', async () => {
        const ensured = jest.spyOn(NodeIdIndexCheck, 'ensured');
        const made = (written: Record<string, any>) => ({
            ...planning,
            plan: { ...planning.plan, run: async () => Promise.resolve({ item: { result: written, dropped: null } }) }
        });
        const order = rangeIndex('Order', 'id');
        const invoice = uniquenessConstraint('Invoice', 'invoice_no');
        await new IndexManager(made({ created: {} }) as any).ensure(order);
        await new IndexManager(made({ recreated: {} }) as any).recreate(order);
        await new ConstraintManager(made({ alreadyMatching: {} }) as any).ensure(invoice);
        await new ConstraintManager(made({ recreated: {} }) as any).recreate(invoice);
        expect(ensured.mock.calls.map(([database, spec, result]) => [database, spec, result.status])).toEqual([
            ['graph', order, 'CREATED'],
            ['graph', order, 'RECREATED'],
            ['graph', invoice, 'ALREADY_MATCHING'],
            ['graph', invoice, 'RECREATED']
        ]);
    });

    it('should pass over a listing that fails, so the enforce still succeeds', async () => {
        jest.spyOn(IndexManager.prototype, 'list').mockRejectedValue(new Error('no listing'));
        const listed = jest.spyOn(NodeIdIndexCheck, 'listed');
        await expect(
            new SchemaManager(factory, { catalogs: [SchemaCatalog.fromFragments(undefined, SessionFixture)] }).enforce()
        ).resolves.toBeInstanceOf(Map);
        expect(listed).not.toHaveBeenCalled();
    });

    it('should count as managed only with an item to apply', () => {
        const managed = jest.spyOn(NodeIdIndexCheck, 'managed');
        new SchemaManager(factory, { catalogs: [SchemaCatalog.of()] });
        new SchemaManager(factory, {
            catalogs: [SchemaCatalog.fromFragments(undefined, SessionFixture)],
            indexNodeIds: false
        });
        expect(managed).not.toHaveBeenCalled();
        new SchemaManager(factory, { catalogs: [SchemaCatalog.fromFragments(undefined, SessionFixture)] });
        expect(managed).toHaveBeenCalledTimes(1);
    });
});
