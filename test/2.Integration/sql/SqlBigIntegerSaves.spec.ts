import {
    BigIntProperty,
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    GraphRelationship,
    GraphView,
    JsonPacked,
    ModelRegistry,
    NodeFragment,
    NodeId,
    nodeRef,
    PersistenceManager,
    PropertyBag,
    QuerySpecification,
    RelationshipFragment,
    Root,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { SqlSeed, sqlPersistenceManager, sqlStores, SqlStore } from '../support/SqlStores';

jest.setTimeout(30_000);

@NodeFragment({ labels: ['SqlBigSave'] })
class Counter {
    @NodeId() id: string;
    value?: bigint | number;
    @PropertyBag() metadata: Record<string, any> = {};
    counts?: (bigint | number)[];
    @JsonPacked() packed?: Record<string, any>;
}

/** A node whose id is a bigint. */
@NodeFragment({ labels: ['SqlBigSave', 'Tally'] })
class Tally {
    @NodeId() id: bigint | number;
}

/** A node whose fields are declared bigints: by @BigIntProperty, and by its initializer. */
@NodeFragment({ labels: ['SqlBigSave', 'Gauge'] })
class Gauge {
    @NodeId() id: string;
    @BigIntProperty() value?: bigint | null;
    @BigIntProperty() counts?: (bigint | number)[];
    @BigIntProperty() @PropertyBag() metadata: Record<string, any> = {};
    @BigIntProperty() @JsonPacked() packed?: Record<string, any>;
    initialized: bigint = BigInt(0);
}

/** A node whose id TypeScript records as a bigint. */
@NodeFragment({ labels: ['SqlBigSave', 'Ticket'] })
class Ticket {
    @NodeId() id: bigint;
}

@RelationshipFragment()
class Holding {
    since: bigint | number;
    @TargetNode() counter: Counter;
}

@GraphView()
class Ledger {
    @Root() counter: Counter;
    @GraphRelationship({ type: 'SQL_BIG_HOLDS', target: () => Holding }) holdings: Holding[] = [];
}

/** A view of tallies, each id a bigint. */
@GraphView()
class Roll {
    @Root() tally: Tally;
    @GraphRelationship({ type: 'SQL_BIG_COUNTS', target: () => Tally }) tallies: Tally[] = [];
}

/** The text a node's properties are stored as, so a whole number's digits are read as they are, not as a number. */
function propsText(store: SqlStore, id: string): QuerySpecification<any> {
    if (store.type === DatabaseType.SQLITE) {
        return new QuerySpecification(
            `SELECT n.props AS "props" FROM drivine_node n WHERE instr(n.labels, '"SqlBigSave"') > 0 AND n.props ->> '$.id' = '${id}'`
        );
    }
    if (store.type === DatabaseType.ORACLE) {
        return new QuerySpecification(
            `SELECT JSON_SERIALIZE(n.props RETURNING VARCHAR2(4000)) AS "props" FROM drivine_node n ` +
                `WHERE JSON_EXISTS(n.labels, '$?(@ == "SqlBigSave")') AND JSON_VALUE(n.props, '$.id') = '${id}'`
        );
    }
    return new QuerySpecification(
        `SELECT n.props::text AS "props" FROM drivine_node n WHERE n.labels @> '["SqlBigSave"]' AND n.props ->> 'id' = '${id}'`
    );
}

/** The text of the properties of each relationship of the type, as the store holds them. */
function edgePropsText(store: SqlStore, type: string): QuerySpecification<any> {
    const props =
        store.type === DatabaseType.ORACLE
            ? 'JSON_SERIALIZE(e.props RETURNING VARCHAR2(4000))'
            : store.type === DatabaseType.SQLITE
            ? 'e.props'
            : 'e.props::text';
    return new QuerySpecification(`SELECT ${props} AS "props" FROM drivine_edge e WHERE e.type = '${type}'`);
}

const BIG = BigInt('9007199254740993');
const counter = (id: string, fields: Partial<Counter> = {}): Counter => Object.assign(new Counter(), { id, ...fields });

// A bigint property is saved as the whole number it is, with its digits (liberation-data/drivine#739): JSON.stringify
// refuses a bigint, so a save of one threw.
describe.each(sqlStores())('a bigint property saved on $name', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: SqlSeed;

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        seed = new SqlSeed(pm, store, 'SqlBigSave');
        await seed.prepare();
    });

    beforeEach(async () => {
        await seed.clear();
    });

    afterAll(async () => {
        await seed.clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    async function stored(id: string): Promise<string> {
        const [row] = await pm.query<any>(propsText(store, id));
        return String(row.props ?? row);
    }

    it('is written with its digits by save', async () => {
        await gom.save(Object.assign(new Counter(), { id: 'a', value: BIG }));
        expect(await stored('a')).toContain('9007199254740993');
    });

    it('is written with its digits by saveAll', async () => {
        await gom.saveAll([
            Object.assign(new Counter(), { id: 'b', value: BIG }),
            Object.assign(new Counter(), { id: 'c', value: -BIG })
        ]);
        expect(await stored('b')).toContain('9007199254740993');
        expect(await stored('c')).toContain('-9007199254740993');
    });

    it('is written with its digits in a property bag', async () => {
        await gom.save(Object.assign(new Counter(), { id: 'd', metadata: { count: BIG } }));
        expect(await stored('d')).toContain('9007199254740993');
    });

    it('is written with its digits by patch', async () => {
        await gom.save(Object.assign(new Counter(), { id: 'e', value: 1 }));
        await gom.patch(Counter, 'e', { set: { value: BIG } });
        expect(await stored('e')).toContain('9007199254740993');
    });

    async function edgeProps(type: string): Promise<string[]> {
        return (await pm.query<any>(edgePropsText(store, type))).map((it) => String(it.props ?? it));
    }

    it('is written with its digits on a relationship of a view, by save and saveAll', async () => {
        const ledger = (id: string, target: string): Ledger =>
            Object.assign(new Ledger(), {
                counter: counter(id, { value: BIG }),
                holdings: [Object.assign(new Holding(), { since: BIG, counter: counter(target, { value: -BIG }) })]
            });
        await gom.save(ledger('f', 'g'));
        await gom.saveAll([ledger('h', 'i')]);
        expect(await stored('g')).toContain('-9007199254740993');
        expect(await stored('i')).toContain('-9007199254740993');
        const edges = await edgeProps('SQL_BIG_HOLDS');
        expect(edges).toHaveLength(2);
        edges.forEach((it) => expect(it).toContain('9007199254740993'));
    });

    it('is written with its digits by patchAll', async () => {
        await gom.save(counter('j', { value: 1 }));
        await gom.patchAll([counter('j', { value: BIG })], { only: ['value'] });
        expect(await stored('j')).toContain('9007199254740993');
    });

    it('is written with its digits by relate', async () => {
        await gom.saveAll([counter('k'), counter('l')]);
        expect(
            await gom.edges.relate(nodeRef(Counter, 'k'), nodeRef(Counter, 'l'), 'SQL_BIG_RELATED', { n: BIG })
        ).toBe(true);
        expect(await edgeProps('SQL_BIG_RELATED')).toEqual([expect.stringContaining('9007199254740993')]);
    });

    it('is written with its digits in a list and in a @JsonPacked field', async () => {
        await gom.save(counter('m', { counts: [BIG, 1], packed: { n: BIG } }));
        expect(await stored('m')).toContain('9007199254740993');
    });

    it('is saved, loaded and related as a @NodeId', async () => {
        const one = Object.assign(new Tally(), { id: BIG });
        const two = Object.assign(new Tally(), { id: BigInt(2) });
        await gom.saveAll([one, two]);
        expect(await gom.loadAll(Tally)).toHaveLength(2);
        expect(await gom.edges.relate(nodeRef(Tally, BIG), nodeRef(Tally, BigInt(2)), 'SQL_BIG_TALLIED')).toBe(true);
    });

    it('is found by load, delete, deleteAll and unrelate as a @NodeId', async () => {
        await gom.saveAll([BIG, BigInt(2), BigInt(3)].map((id) => Object.assign(new Tally(), { id })));
        expect(await gom.load(Tally, BIG)).toBeTruthy();
        expect(await gom.loadAll(Tally, (q) => ({ where: q.id.in([BIG]) }))).toHaveLength(1);
        await gom.edges.relate(nodeRef(Tally, BIG), nodeRef(Tally, BigInt(2)), 'SQL_BIG_TALLIED');
        expect(await gom.edges.unrelate(nodeRef(Tally, BIG), nodeRef(Tally, BigInt(2)), 'SQL_BIG_TALLIED')).toBe(1);
        expect(await gom.delete(Tally, BIG)).toBe(1);
        expect(await gom.deleteAll(Tally, (q) => ({ where: q.id.eq(BigInt(3)) }))).toBe(1);
        expect(await gom.loadAll(Tally)).toHaveLength(1);
    });

    it('is kept and dropped as a @NodeId by a save that replaces a relationship', async () => {
        const tally = (id: bigint): Tally => Object.assign(new Tally(), { id });
        const roll = (...ids: bigint[]): Roll =>
            Object.assign(new Roll(), { tally: tally(BIG), tallies: ids.map(tally) });
        await gom.save(roll(BigInt(2), BigInt(3)));
        await gom.save(roll(BigInt(2)), { replace: ['tallies'] });
        const loaded = (await gom.loadAll(Roll)).find((it) => Number(it.tally.id) === Number(BIG))!;
        expect(loaded.tallies.map((it) => Number(it.id))).toEqual([2]);
    });

    it('is compared in a where by in and hasItem', async () => {
        await gom.saveAll([counter('n', { value: BIG, counts: [BIG] }), counter('o', { value: 3, counts: [3] })]);
        const ids = async (where: (q: any) => any): Promise<string[]> =>
            (await gom.loadAll(Counter, (q) => ({ where: where(q) }))).map((it) => it.id).sort();
        expect(await ids((q) => q.value.in([BIG, BigInt(4)]))).toEqual(['n']);
        expect(await ids((q) => q.counts.hasItem(BIG))).toEqual(['n']);
    });

    // Oracle's driver reads a JSON value's numbers through a JavaScript number, so a load there still rounds (#737).
    const exactLoads = store.type !== DatabaseType.ORACLE;

    (exactLoads ? it : it.skip)(
        'is loaded back as a bigint where the field is declared one, and saved again unchanged',
        async () => {
            await gom.save(
                Object.assign(new Gauge(), {
                    id: 'p',
                    value: BIG,
                    counts: [BIG, 2],
                    metadata: { count: -BIG },
                    packed: { deep: [BIG] }
                })
            );
            const loaded = (await gom.load(Gauge, 'p'))!;
            expect(loaded.value).toBe(BIG);
            expect(loaded.counts).toEqual([BIG, BigInt(2)]);
            expect(loaded.metadata.count).toBe(-BIG);
            expect(loaded.packed).toEqual({ deep: [BIG] });
            expect(loaded.initialized).toBe(BigInt(0));
            await gom.save(Object.assign(loaded, { initialized: BIG }));
            const again = (await gom.load(Gauge, 'p'))!;
            expect(again.initialized).toBe(BIG);
            expect(await stored('p')).toContain('-9007199254740993');
        }
    );

    (exactLoads ? it : it.skip)('is loaded back as a number where the field is not declared a bigint', async () => {
        await gom.save(counter('q', { value: BIG, counts: [BIG], metadata: { count: BIG }, packed: { deep: [BIG] } }));
        const loaded = (await gom.load(Counter, 'q'))!;
        expect(loaded.value).toBe(Number(BIG));
        expect(loaded.counts).toEqual([Number(BIG)]);
        expect(loaded.metadata.count).toBe(Number(BIG));
        expect(loaded.packed).toEqual({ deep: [Number(BIG)] });
    });

    (exactLoads ? it : it.skip)(
        'is loaded back as a bigint @NodeId declared bigint, a number where declared otherwise',
        async () => {
            await gom.saveAll([
                Object.assign(new Ticket(), { id: BIG }),
                Object.assign(new Ticket(), { id: BigInt(7) })
            ]);
            expect((await gom.loadAll(Ticket)).map((it) => it.id).sort()).toEqual([BigInt(7), BIG]);
            await gom.save(Object.assign(new Tally(), { id: BIG }));
            expect((await gom.load(Tally, BIG))!.id).toBe(Number(BIG));
        }
    );
});
