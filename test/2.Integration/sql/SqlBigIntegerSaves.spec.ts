import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PropertyBag,
    QuerySpecification,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { SqlSeed, sqlPersistenceManager, sqlStores, SqlStore } from '../support/SqlStores';

jest.setTimeout(30_000);

@NodeFragment({ labels: ['SqlBigSave'] })
class Counter {
    @NodeId() id: string;
    value?: bigint | number;
    @PropertyBag() metadata: Record<string, any> = {};
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
                `WHERE JSON_VALUE(n.props, '$.id') = '${id}'`
        );
    }
    return new QuerySpecification(
        `SELECT n.props::text AS "props" FROM drivine_node n WHERE n.props ->> 'id' = '${id}'`
    );
}

const BIG = BigInt('9007199254740993');

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
});
