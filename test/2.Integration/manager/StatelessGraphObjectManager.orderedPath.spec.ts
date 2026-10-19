import {
    CypherBackend,
    cypherGrammarFor,
    Direction,
    GraphPath,
    GraphRelationship,
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

@NodeFragment({ labels: ['OrderedPathTest', 'Movie'] })
class Movie {
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
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'year', false), hop('DIRECTED_BY')], {
        target: () => Director
    })
    latestFirst: Director[];
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, undefined, 'year')], { target: () => Movie })
    movies: Movie[];
}

@GraphView()
class ActorDirectorsByKey {
    @Root() actor: Actor;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'sort key'), hop('DIRECTED_BY')], {
        target: () => Director
    })
    directors: Director[];
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'sort key', false), hop('DIRECTED_BY')], {
        target: () => Director
    })
    directorsDescending: Director[];
}

@GraphView()
class DirectorCast {
    @Root() director: Director;
    @GraphPath([hop('DIRECTED_BY', Direction.INCOMING, 'Movie', 'year', false), hop('ACTED_IN', Direction.INCOMING)], {
        target: () => Actor
    })
    cast: Actor[];
}

@GraphView()
class Acquaintance {
    @Root() actor: Actor;
    @GraphRelationship({ type: 'KNOWS', target: () => ActorDirectorsByYear })
    friends: ActorDirectorsByYear[];
}

@GraphView()
class CreditedActor {
    @Root() actor: Actor;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'year'), hop('DIRECTED_BY')], {
        target: () => Director,
        required: true
    })
    directors: Director[];
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
        // o1 acted in six movies by five directors; nolan directed two. By year: murnau 999, lynch 1986, nolan 2000,
        // bigelow 2008, nolan 2010, and anon's movie has no year. 999 is first as a number and last as text. o2 acted
        // in nothing. o3 acted in nolan's 2000 movie and knows o1.
        await pm.execute(
            new QuerySpecification(
                "CREATE (o1:OrderedPathTest:Actor {id: 'o1'}), (:OrderedPathTest:Actor {id: 'o2'}), " +
                    "(o3:OrderedPathTest:Actor {id: 'o3'})-[:KNOWS]->(o1), (anon:OrderedPathTest:Director {id: 'anon'}), " +
                    "(murnau:OrderedPathTest:Director {id: 'murnau'}), (lynch:OrderedPathTest:Director {id: 'lynch'}), " +
                    "(nolan:OrderedPathTest:Director {id: 'nolan'}), (bigelow:OrderedPathTest:Director {id: 'bigelow'}), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y5', year: 2010})-[:DIRECTED_BY]->(nolan), " +
                    "(o1)-[:ACTED_IN]->(y3:OrderedPathTest:Movie {id: 'y3', year: 2000})-[:DIRECTED_BY]->(nolan), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y0'})-[:DIRECTED_BY]->(anon), (o3)-[:ACTED_IN]->(y3), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y1', year: 999})-[:DIRECTED_BY]->(murnau), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y4', year: 2008})-[:DIRECTED_BY]->(bigelow), " +
                    "(o1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'y2', year: 1986})-[:DIRECTED_BY]->(lynch)"
            )
        );
        // k1 acted in movies whose 'sort key' is a text or a number: lynch 'a', bigelow 'b', nolan 'c' and 5, murnau
        // 10, and anon none. Lowest first, nolan keeps 'c'; highest first, 5.
        await pm.execute(
            new QuerySpecification(
                "MATCH (lynch:OrderedPathTest {id: 'lynch'}), (bigelow:OrderedPathTest {id: 'bigelow'}), " +
                    "(nolan:OrderedPathTest {id: 'nolan'}), (murnau:OrderedPathTest {id: 'murnau'}), " +
                    "(anon:OrderedPathTest {id: 'anon'}) " +
                    "CREATE (k1:OrderedPathTest:Actor {id: 'k1'}), " +
                    "(k1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'ka', `sort key`: 'a'})-[:DIRECTED_BY]->(lynch), " +
                    "(k1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'kb', `sort key`: 'b'})-[:DIRECTED_BY]->(bigelow), " +
                    "(k1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'kc', `sort key`: 'c'})-[:DIRECTED_BY]->(nolan), " +
                    "(k1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'k5', `sort key`: 5})-[:DIRECTED_BY]->(nolan), " +
                    "(k1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'k10', `sort key`: 10})-[:DIRECTED_BY]->(murnau), " +
                    "(k1)-[:ACTED_IN]->(:OrderedPathTest:Movie {id: 'kn'})-[:DIRECTED_BY]->(anon)"
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:OrderedPathTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should hold the far nodes in the order of the first node of the ordered hop that leads to each', async () => {
        const loaded = (await gom.load(ActorDirectorsByYear, 'o1'))!;
        expect(loaded.directors.map((it) => it.id)).toEqual(['murnau', 'lynch', 'nolan', 'bigelow', 'anon']);
        expect(loaded.first!.id).toEqual('murnau');
        expect(loaded.latest!.id).toEqual('nolan');
    });

    it('should put a node without the property last, read highest first as lowest', async () => {
        const loaded = (await gom.load(ActorDirectorsByYear, 'o1'))!;
        expect(loaded.latestFirst.map((it) => it.id)).toEqual(['nolan', 'bigelow', 'lynch', 'murnau', 'anon']);
    });

    it('should read a text before a number, lowest first, and a number before a text, highest first', async () => {
        const loaded = (await gom.load(ActorDirectorsByKey, 'k1'))!;
        expect(loaded.directors.map((it) => it.id)).toEqual(['lynch', 'bigelow', 'nolan', 'murnau', 'anon']);
        expect(loaded.directorsDescending.map((it) => it.id)).toEqual(['murnau', 'nolan', 'bigelow', 'lynch', 'anon']);
    });

    it('should order by the far node where the last hop names the order', async () => {
        const loaded = (await gom.load(ActorDirectorsByYear, 'o1'))!;
        expect(loaded.movies.map((it) => it.id)).toEqual(['y1', 'y2', 'y3', 'y4', 'y5', 'y0']);
    });

    it('should order a path of incoming hops', async () => {
        const nolan = (await gom.load(DirectorCast, 'nolan'))!;
        // o1 by 2010, o3 by 2000, and k1 last: nolan's movies with k1 have no year.
        expect(nolan.cast.map((it) => it.id)).toEqual(['o1', 'o3', 'k1']);
    });

    it('should order a path of a view nested in another', async () => {
        const o3 = (await gom.load(Acquaintance, 'o3'))!;
        expect(o3.friends.map((it) => it.actor.id)).toEqual(['o1']);
        expect(o3.friends[0].directors.map((it) => it.id)).toEqual(['murnau', 'lynch', 'nolan', 'bigelow', 'anon']);
        expect(o3.friends[0].latest!.id).toEqual('nolan');
    });

    it('should leave out roots without a required ordered path', async () => {
        expect((await gom.loadAll(CreditedActor)).map((it) => it.actor.id).sort()).toEqual(['k1', 'o1', 'o3']);
        expect((await gom.load(CreditedActor, 'o3'))!.directors.map((it) => it.id)).toEqual(['nolan']);
    });

    it('should give an empty list or undefined where there is no path', async () => {
        const idle = (await gom.load(ActorDirectorsByYear, 'o2'))!;
        expect(idle.directors).toEqual([]);
        expect(idle.first).toBeUndefined();
    });
});
