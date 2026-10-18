import {
    CypherBackend,
    cypherGrammarFor,
    Direction,
    GraphPath,
    GraphView,
    hop,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['PathTest', 'Actor'] })
class Actor {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['PathTest', 'Director'] })
class Director {
    @NodeId() id: string;
}

@GraphView()
class ActorDirectors {
    @Root() actor: Actor;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie'), hop('DIRECTED_BY')], { target: () => Director })
    directors: Director[];
    @GraphPath([hop('ACTED_IN'), hop('DIRECTED_BY')], { target: () => Director })
    anyDirector?: Director;
}

@GraphView()
class DirectedActor {
    @Root() actor: Actor;
    @GraphPath([hop('ACTED_IN'), hop('DIRECTED_BY')], { target: () => Director, required: true })
    directors: Director[];
}

describe.each(graphEngines())('@GraphPath on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, new CypherBackend(cypherGrammarFor(engine.type)), new ModelRegistry());
        await pm.execute(new QuerySpecification('MATCH (n:PathTest) DETACH DELETE n'));
        // keanu acted in two movies by lana, and a play (not a Movie) by a stage director.
        await pm.execute(
            new QuerySpecification(
                "CREATE (k:PathTest:Actor {id: 'keanu'}), (:PathTest:Actor {id: 'extra'}), " +
                    "(lana:PathTest:Director {id: 'lana'}), (stage:PathTest:Director {id: 'stage'}), " +
                    "(k)-[:ACTED_IN]->(m1:PathTest:Movie {id: 'm1'})-[:DIRECTED_BY]->(lana), " +
                    "(k)-[:ACTED_IN]->(m2:PathTest:Movie {id: 'm2'})-[:DIRECTED_BY]->(lana), " +
                    "(k)-[:ACTED_IN]->(:PathTest:Play {id: 'p1'})-[:DIRECTED_BY]->(stage)"
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:PathTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should map the far nodes of a path, each once, through hops with the labels asked for', async () => {
        const loaded = (await gom.load(ActorDirectors, 'keanu'))!;
        expect(loaded.directors.map((it) => it.id)).toEqual(['lana']);
        expect(loaded.directors[0]).toBeInstanceOf(Director);
        expect(['lana', 'stage']).toContain(loaded.anyDirector!.id);
    });

    it('should give an empty list or undefined where there is no path', async () => {
        const extra = (await gom.load(ActorDirectors, 'extra'))!;
        expect(extra.directors).toEqual([]);
        expect(extra.anyDirector).toBeUndefined();
    });

    it('should leave out roots without a required path', async () => {
        expect((await gom.loadAll(DirectedActor)).map((it) => it.actor.id)).toEqual(['keanu']);
        expect(await gom.count(DirectedActor)).toEqual(1);
    });

    it('should never write a path', async () => {
        await gom.save(
            Object.assign(new ActorDirectors(), {
                actor: Object.assign(new Actor(), { id: 'extra' }),
                directors: [Object.assign(new Director(), { id: 'nolan' })]
            })
        );
        expect((await gom.load(ActorDirectors, 'extra'))!.directors).toEqual([]);
        expect(await gom.load(Director, 'nolan')).toBeUndefined();
    });
});
