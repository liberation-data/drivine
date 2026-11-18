import {
    above,
    backendFor,
    caseOf,
    count,
    DatabaseType,
    key,
    max,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    SqliteGraph,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { sqlStores } from '../support/SqlStores';

jest.setTimeout(60_000);

@NodeFragment({ labels: ['DatedFilter'] })
class Dated {
    @NodeId() id: string;
    name?: string;
    at?: Date;
    days?: Date[];
}

/**
 * A query DSL filter, seek or order given a date (#771). On every SQL store it is the shared module's fragment
 * (drivine-cypher-spec#235: SQLite since step 2, Postgres since step 3, Oracle since step 4), which compares a date by
 * the tag the store layout holds it as, so `eq`, `in`, `hasItem`, `gt`, a seek, an order and a patch's or a grouped read's
 * condition give the rows Neo4j does. The DSL's SQL before compared a property's text with the date's ISO text, so `eq`,
 * `in` and `hasItem` found nothing and `gt` gave the wrong rows, and Postgres and Oracle refused a date until their steps.
 * A Cypher statement compares dates as Neo4j does on each, and a filter of anything else is as it was.
 */
describe.each(sqlStores())('A date in a query DSL filter on $type', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const first = new Date('2026-01-01T00:00:00.000Z');
    const second = new Date('2026-02-01T00:00:00.000Z');

    beforeAll(async () => {
        pm = persistenceManagerFor(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        if (store.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
        if (store.type === DatabaseType.SQLITE) {
            await pm.execute(new QuerySpecification(new SqliteGraph().ensuring));
        }
    });

    beforeEach(async () => {
        await clearLabels(pm, store, 'DatedFilter');
        await gom.saveAll([
            Object.assign(new Dated(), { id: 'd1', name: 'one', at: first, days: [first] }),
            Object.assign(new Dated(), { id: 'd2', name: 'two', at: second, days: [second] })
        ]);
    });

    afterAll(async () => {
        await clearLabels(pm, store, 'DatedFilter');
        await closeGraphEngines();
    });

    const found = async (where: (q: any) => any): Promise<string[]> =>
        (await gom.loadAll(Dated, (q) => ({ where: where(q) }))).map((it) => it.id).sort();

    it('compares a date by its tag in a comparison, an in, a hasItem, a seek and an order', async () => {
        expect(await found((q) => q.at.eq(first))).toEqual(['d1']);
        expect(await found((q) => q.at.gt(first))).toEqual(['d2']);
        expect(await found((q) => q.at.in([second]))).toEqual(['d2']);
        expect(await found((q) => q.at.notIn([second]))).toEqual(['d1']);
        expect(await found((q) => q.days.hasItem(second))).toEqual(['d2']);
        expect(
            (await gom.loadAll(Dated, (q) => ({ orderBy: q.at.asc(), seek: (q.at as any).after(first) }))).map(
                (it) => it.id
            )
        ).toEqual(['d2']);
        expect(
            (
                await gom.loadAll(Dated, (q) => ({
                    orderBy: caseOf([above(q.at as any, first).then(1)], 2).asc()
                }))
            ).map((it) => it.id)
        ).toEqual(['d2', 'd1']);
        expect(await gom.count(Dated, (q: any) => ({ where: q.at.gte(second) }))).toEqual(1);
    });

    it("compares a date by its tag in a patch's where, and in a grouped read's where and aggregate", async () => {
        expect(
            (await gom.patch(Dated, 'd1', { set: { name: 'missed' }, where: (q: any) => q.at.eq(second) })).applied
        ).toBe(false);
        expect(
            (await gom.patch(Dated, 'd1', { set: { name: 'patched' }, where: (q: any) => q.at.eq(first) })).applied
        ).toBe(true);
        expect((await gom.load(Dated, 'd1'))?.name).toEqual('patched');
        const groups = await gom.groups.load(Dated, (q: any) => ({
            where: q.at.gte(first),
            keys: { name: key(q.name) },
            aggregates: { later: count(q.at.gt(first)), last: max(q.at) },
            orderBy: [['name', 'asc']]
        }));
        // A date is read back as its text, as a load reads it.
        expect(groups).toEqual([
            { name: 'patched', later: 0, last: '2026-01-01T00:00:00Z' },
            { name: 'two', later: 1, last: '2026-02-01T00:00:00Z' }
        ]);
        expect(
            await gom.groups.load(Dated, (q: any) => ({ where: q.at.gt(first), keys: { name: key(q.name) } }))
        ).toEqual([{ name: 'two' }]);
    });

    it('leaves a filter of anything else, and a Cypher statement of a date, as they were', async () => {
        expect(await found((q) => q.name.eq('two'))).toEqual(['d2']);
        expect(await found((q) => q.at.isNotNull())).toEqual(['d1', 'd2']);
        expect(
            await pm.query(
                new QuerySpecification({
                    text: 'MATCH (n:DatedFilter) WHERE n.at > $d RETURN n.id',
                    language: 'CYPHER'
                }).bind({ d: first })
            )
        ).toEqual(['d2']);
    });
});
