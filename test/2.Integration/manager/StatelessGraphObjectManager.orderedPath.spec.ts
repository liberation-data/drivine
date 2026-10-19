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

@NodeFragment({ labels: ['OrderedPathTest', 'Actor'] })
class Actor {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['OrderedPathTest', 'Director'] })
class Director {
    @NodeId() id: string;
}

@GraphView()
class ActorDirectorsByYear {
    @Root() actor: Actor;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'year'), hop('DIRECTED_BY')], { target: () => Director })
    directors: Director[];
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'year'), hop('DIRECTED_BY')], { target: () => Director })
    first?: Director;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'year', false), hop('DIRECTED_BY')], {
        target: () => Director
    })
    latest?: Director;
}

describe.each(graphEngines())('@GraphPath ordered by a hop on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
        await pm.execute(new QuerySpecification('MATCH (n:OrderedPathTest) DETACH DELETE n'));
        // o1 acted in five movies by four directors; nolan directed two. By year: murnau 999, lynch 1986, nolan 2000,
        // bigelow 2008, nolan 2010. 999 is first as a number and last as text. o2 acted in nothing.
        await pm.execute(
            new QuerySpecification(
                "CREATE (o1:OrderedPathTest:Actor {id: 'o1'}), (:OrderedPathTest:Actor {id: 'o2'}), " +
                    "(murnau:OrderedPathTest:Director {id: 'murnau'}), (lynch:OrderedPathTest:Director {id: 'lynch'}), " +
                    "(nolan:OrderedPathTest:Director {id: 'nolan'}), (bigelow:OrderedPathTest:Director {id: 'bigelow'}), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y5', year: 2010})-[:DIRECTED_BY]->(nolan), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y3', year: 2000})-[:DIRECTED_BY]->(nolan), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y1', year: 999})-[:DIRECTED_BY]->(murnau), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y4', year: 2008})-[:DIRECTED_BY]->(bigelow), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y2', year: 1986})-[:DIRECTED_BY]->(lynch)"
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:OrderedPathTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should hold the far nodes in the order of the first node of the ordered hop that leads to each', async () => {
        const loaded = (await gom.load(ActorDirectorsByYear, 'o1'))!;
        expect(loaded.directors.map((it) => it.id)).toEqual(['murnau', 'lynch', 'nolan', 'bigelow']);
        expect(loaded.first!.id).toEqual('murnau');
        expect(loaded.latest!.id).toEqual('nolan');
    });

    it('should give an empty list or undefined where there is no path', async () => {
        const idle = (await gom.load(ActorDirectorsByYear, 'o2'))!;
        expect(idle.directors).toEqual([]);
        expect(idle.first).toBeUndefined();
    });
});
