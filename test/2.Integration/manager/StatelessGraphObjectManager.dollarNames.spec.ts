import {
    backendFor,
    count,
    DatabaseType,
    key,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    SqliteGraph,
    StatelessGraphObjectManager,
    sum
} from '@liberation-data/drivine';
import { clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { sqlStores } from '../support/SqlStores';

jest.setTimeout(60_000);

@NodeFragment({ labels: ['DollarNamed'] })
class Ranked {
    @NodeId() id: string;
    $score?: number;
}

/**
 * A query DSL filter, order and grouped read of a property whose name begins with `$`, which store layout 2 holds as
 * `$$score` (drivine-cypher-spec#161). The DSL's own SQL named it as it is, `$score`, so it found no node, ordered by
 * nothing and grouped every node under no value, silently. The shared module's fragments read it as the layout holds it:
 * on SQLite since drivine-cypher-spec#235 step 2, on Postgres since step 3 and on Oracle since step 4.
 */
describe.each(sqlStores())('A property whose name begins with $ in the query DSL on $type', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

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
        await clearLabels(pm, store, 'DollarNamed');
        await gom.saveAll([1, 2, 3].map((score) => Object.assign(new Ranked(), { id: `r${score}`, $score: score })));
    });

    afterAll(async () => {
        await clearLabels(pm, store, 'DollarNamed');
        await closeGraphEngines();
    });

    it('saves and loads it by its own name', async () => {
        expect((await gom.load(Ranked, 'r2'))?.$score).toEqual(2);
    });

    it('filters by it', async () => {
        const found = await gom.loadAll(Ranked, (q: any) => ({ where: q.$score.gt(1) }));
        expect(found.map((it) => it.id).sort()).toEqual(['r2', 'r3']);
        expect(await gom.count(Ranked, (q: any) => ({ where: q.$score.eq(3) }))).toEqual(1);
    });

    it('orders and seeks by it', async () => {
        expect((await gom.loadAll(Ranked, (q: any) => ({ orderBy: q.$score.desc() }))).map((it) => it.id)).toEqual([
            'r3',
            'r2',
            'r1'
        ]);
        expect(
            (await gom.loadAll(Ranked, (q: any) => ({ orderBy: q.$score.asc(), seek: q.$score.after(1) }))).map(
                (it) => it.id
            )
        ).toEqual(['r2', 'r3']);
    });

    it('groups and adds by it', async () => {
        const groups = await gom.groups.load(Ranked, (q: any) => ({
            keys: { score: key(q.$score) },
            aggregates: { nodes: count(), total: sum(q.$score) },
            orderBy: [['score', 'desc']]
        }));
        expect(groups).toEqual([
            { score: 3, nodes: 1, total: 3 },
            { score: 2, nodes: 1, total: 2 },
            { score: 1, nodes: 1, total: 1 }
        ]);
    });
    // A raw where names it as Cypher writes it, in backticks, and reads the key layout 2 holds it under (#793).
    it('reads it in a raw where by the key it is held under', async () => {
        const found = await gom.loadAll(Ranked, { where: 'n.`$score` IS NOT NULL' });
        expect(found.map((it) => it.id).sort()).toEqual(['r1', 'r2', 'r3']);
        expect(await gom.loadAll(Ranked, { where: 'n.`$score` IS NULL' })).toEqual([]);
        // A patch's raw where, which Postgres and SQLite run with its values written in (PostgresWrites' meeting).
        expect((await gom.patch(Ranked, 'r2', { set: { $score: 20 }, where: 'n.`$score` IS NOT NULL' })).applied).toBe(
            true
        );
        expect((await gom.load(Ranked, 'r2'))?.$score).toEqual(20);
        // A grouped read's raw where and raw aggregate filter.
        const groups = await gom.groups.load(Ranked, {
            where: 'n.`$score` IS NOT NULL',
            keys: { id: key('id') },
            aggregates: { scored: count('n.`$score` IS NOT NULL') },
            orderBy: [['id', 'asc']]
        });
        expect(groups).toEqual([
            { id: 'r1', scored: 1 },
            { id: 'r2', scored: 1 },
            { id: 'r3', scored: 1 }
        ]);
    });
});
