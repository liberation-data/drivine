import {
    Aggregate,
    AggregateFunction,
    Count,
    CypherBackend,
    cypherGrammarFor,
    Direction,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    ReadOnly,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['AggTest', 'Actor'] })
class Actor {
    @NodeId() id: string;
}

@GraphView()
class ActorStats {
    @Root() actor: Actor;
    @ReadOnly() @Count('ACTED_IN') movieCount: number;
    @Count('FOLLOWS', Direction.INCOMING) followers: number;
    @Aggregate({ function: AggregateFunction.AVG, type: 'RATED', property: 'score' }) avgRating?: number;
    @Aggregate({ function: AggregateFunction.SUM, type: 'RATED', property: 'score' }) totalRating: number;
    @Aggregate({ function: AggregateFunction.MIN, type: 'RATED', property: 'score' }) minRating?: number;
    @Aggregate({ function: AggregateFunction.MAX, type: 'RATED', property: 'score' }) maxRating?: number;
}

describe.each(graphEngines())('@Count and @Aggregate on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
        await pm.execute(new QuerySpecification('MATCH (n:AggTest) DETACH DELETE n'));
        await pm.execute(
            new QuerySpecification(
                "CREATE (a:AggTest:Actor {id: 'keanu'}), (:AggTest:Actor {id: 'nobody'}), " +
                    "(a)-[:ACTED_IN]->(:AggTest {id: 'm1'}), (a)-[:ACTED_IN]->(:AggTest {id: 'm2'}), (a)-[:ACTED_IN]->(:AggTest {id: 'm3'}), " +
                    '(a)-[:RATED]->(:AggTest {score: 2}), (a)-[:RATED]->(:AggTest {score: 5}), (a)-[:RATED]->(:AggTest {}), ' +
                    "(:AggTest {id: 'fan'})-[:FOLLOWS]->(a)"
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:AggTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should count and aggregate in the query', async () => {
        const stats = (await gom.load(ActorStats, 'keanu'))!;
        expect([stats.movieCount, stats.followers, stats.totalRating, stats.minRating, stats.maxRating]).toEqual([
            3, 1, 7, 2, 5
        ]);
        expect(stats.avgRating).toBeCloseTo(3.5);
    });

    it('should give 0 for a count or sum of none, and undefined for an average, minimum or maximum', async () => {
        const stats = (await gom.load(ActorStats, 'nobody'))!;
        expect([stats.movieCount, stats.followers, stats.totalRating]).toEqual([0, 0, 0]);
        expect([stats.avgRating, stats.minRating, stats.maxRating]).toEqual([undefined, undefined, undefined]);
    });

    it('should never write an aggregate', async () => {
        const stats = (await gom.load(ActorStats, 'keanu'))!;
        stats.movieCount = 99;
        await gom.save(stats);
        expect((await gom.load(ActorStats, 'keanu'))!.movieCount).toEqual(3);
        const props = await pm.getOne<Record<string, any>>(
            new QuerySpecification("MATCH (n:AggTest:Actor {id: 'keanu'}) RETURN properties(n)")
        );
        expect(Object.keys(props)).not.toContain('movieCount');
    });
});
