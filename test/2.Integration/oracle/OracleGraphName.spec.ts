import {
    ConnectionPropertiesFromEnv,
    DatabaseRegistry,
    GraphObjectManagerFactory,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    rangeIndex,
    StatelessGraphObjectManager,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';

jest.setTimeout(60_000);

const GRAPH = 'drivine_named_test';

@NodeFragment({ labels: ['OraNamed'] })
class Tenant {
    @NodeId() id: string;
    name?: string;
}

/** drivine4j's `default-graph-path`: a store on Oracle works on the graph its connection names, and on no other. */
describeOnOracle('a named graph on Oracle', () => {
    let pm: PersistenceManager;
    let named: StatelessGraphObjectManager;
    let unnamed: StatelessGraphObjectManager;
    const count = async (table: string, id: string): Promise<number> =>
        Number(
            await pm.getOne<number>(
                new QuerySpecification(
                    `SELECT COUNT(*) FROM ${table} WHERE JSON_VALUE(props, '$.id') = $id ` +
                        `AND JSON_EXISTS(labels, '$?(@ == "OraNamed")')`
                ).bind({
                    id
                })
            )
        );
    const dropGraph = async (): Promise<void> => {
        for (const statement of [
            `DROP PROPERTY GRAPH IF EXISTS ${GRAPH}`,
            `DROP TABLE IF EXISTS ${GRAPH}_edge PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_node PURGE`,
            `DROP TABLE IF EXISTS ${GRAPH}_schema PURGE`
        ]) {
            await pm.execute(new QuerySpecification(statement));
        }
    };

    beforeAll(async () => {
        pm = oraclePersistenceManager();
        await dropGraph();
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ ...ConnectionPropertiesFromEnv('ORACLE'), defaultGraphPath: GRAPH })
            .register('ORACLE_NAMED');
        const factory = new GraphObjectManagerFactory(
            new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance())
        );
        named = factory.get('ORACLE_NAMED');
        unnamed = factory.get('ORACLE');
    });

    afterAll(async () => {
        await unnamed.deleteAll(Tenant);
        await dropGraph();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
    });

    it("should make the graph's tables, and save and load there alone", async () => {
        await named.save(Object.assign(new Tenant(), { id: 'named-acme', name: 'Acme' }));
        expect(await count(`${GRAPH}_node`, 'named-acme')).toEqual(1);
        expect(await count('drivine_node', 'named-acme')).toEqual(0);
        expect((await named.load(Tenant, 'named-acme'))?.name).toEqual('Acme');
        expect(await unnamed.load(Tenant, 'named-acme')).toBeUndefined();
    });

    it("should keep its indexes in the graph's own catalog", async () => {
        const spec = rangeIndex('OraNamed', 'name');
        expect((await named.indexes.ensure(spec)).status).toEqual('CREATED');
        expect(await pm.query<string>(new QuerySpecification(`SELECT label FROM ${GRAPH}_schema`))).toContain(
            'OraNamed'
        );
        expect((await unnamed.indexes.list('RANGE')).some((it) => it.label === 'OraNamed')).toBe(false);
        await named.indexes.drop(spec);
    });
});
