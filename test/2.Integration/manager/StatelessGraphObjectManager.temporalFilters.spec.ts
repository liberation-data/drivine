import {
    above,
    backendFor,
    caseOf,
    DatabaseType,
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

const REFUSED = /the query DSL doesn't compare on a SQL store yet \(drivine-cypher-spec#235\)/;

/**
 * A query DSL filter, seek or order given a date is refused by name on a SQL store (#771): the store layout holds a date
 * as its tag, and the DSL's SQL compared a property's text with the date's ISO text, so `eq`, `in` and `hasItem` found
 * nothing and `gt` gave the wrong rows. A Cypher statement compares dates as Neo4j does, and a filter of anything else is
 * as it was. Lifted when the DSL's filters come from the shared module's fragments (drivine-cypher-spec#235).
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

    it('is refused by name in a comparison, an in, a hasItem, a seek and an order expression', async () => {
        for (const where of [
            (q: any) => q.at.eq(first),
            (q: any) => q.at.gt(first),
            (q: any) => q.at.in([second]),
            (q: any) => q.at.notIn([second]),
            (q: any) => q.days.hasItem(second)
        ]) {
            await expect(found(where)).rejects.toThrow(REFUSED);
        }
        await expect(
            gom.loadAll(Dated, (q) => ({ orderBy: q.at.asc(), seek: (q.at as any).after(first) }))
        ).rejects.toThrow(REFUSED);
        await expect(
            gom.loadAll(Dated, (q) => ({ orderBy: caseOf([above(q.at as any, first).then(1)], 2).asc() }))
        ).rejects.toThrow(REFUSED);
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
