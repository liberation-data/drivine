import {
    CypherBackend,
    cypherGrammarFor,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    rangeIndex,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

jest.setTimeout(30_000);

@NodeFragment({ labels: ['AdviceTest'] })
class Ticket {
    @NodeId() id: string;
    opened: number;
    rank: number;
}

describe.each(graphEngines())('query index advice on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const byOpened = rangeIndex('AdviceTest', 'opened');
    const byOpenedAndRank = rangeIndex('AdviceTest', ['opened', 'rank']);

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
        gom.indexAdvice = 'FAIL';
        await gom.indexes.drop(byOpenedAndRank);
        await gom.indexes.drop(byOpened);
        await pm.execute(new QuerySpecification('MATCH (n:AdviceTest) DETACH DELETE n'));
        await pm.execute(
            new QuerySpecification(
                "CREATE (:AdviceTest {id: 't1', opened: 1, rank: 2}), (:AdviceTest {id: 't2', opened: 2, rank: 1})"
            )
        );
    });

    afterAll(async () => {
        await gom.indexes.drop(byOpenedAndRank);
        await gom.indexes.drop(byOpened);
        await pm.execute(new QuerySpecification('MATCH (n:AdviceTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should refuse an unindexed order when told to fail, naming the index to make', async () => {
        await expect(gom.loadAll(Ticket, (q) => ({ orderBy: q.opened.asc() }))).rejects.toThrow(
            /orderBy on AdviceTest\(opened\) has no matching range index.*rangeIndex\('AdviceTest', \['opened'\]\)/
        );
        await expect(
            gom.loadAll(Ticket, (q) => ({ orderBy: q.opened.asc(), seek: q.opened.after(1) }))
        ).rejects.toThrow(/seek on AdviceTest\(opened\)/);
    });

    it('should not advise an order of one root, pinned by its id', async () => {
        const one = await gom.loadAll(Ticket, (q) => ({ where: q.id.eq('t1'), orderBy: q.opened.asc() }));
        expect(one.map((it) => it.id)).toEqual(['t1']);
    });

    it('should take an index over exactly the ordered properties, once it is seen', async () => {
        await gom.indexes.ensure(byOpened);
        await expect(gom.loadAll(Ticket, (q) => ({ orderBy: q.opened.asc() }))).rejects.toThrow(/no matching/);
        gom.indexAdvisor.refresh();
        const rows = await gom.loadAll(Ticket, (q) => ({ orderBy: q.opened.desc() }));
        expect(rows.map((it) => it.id)).toEqual(['t2', 't1']);
        await gom.indexes.ensure(byOpenedAndRank);
        gom.indexAdvisor.refresh();
        await gom.loadAll(Ticket, (q) => ({ orderBy: [q.opened.asc(), q.rank.asc()] }));
    });

    it('should say nothing when off', async () => {
        gom.indexAdvice = 'OFF';
        await gom.loadAll(Ticket, (q) => ({ orderBy: q.rank.asc() }));
        gom.indexAdvice = 'FAIL';
    });
});
